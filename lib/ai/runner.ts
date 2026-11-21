"use client";

// Browser-side orchestration of AI work: builds the context snapshot, calls the
// server routes, and turns results into task records, approvals, statuses,
// notifications and office behaviour.

import { useOffice } from "@/lib/store/office-store";
import { useActionCards } from "@/lib/store/action-cards";
import { useUI } from "@/lib/store/ui-store";
import type { Employee } from "@/lib/data/types";
import { getSim } from "@/lib/office/runtime";
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES,
  briefFrom,
  type ChatResponse,
  type OfficeContext,
  type TaskRunResponse,
  type UploadedFile,
} from "./protocol";

let aiEnabled: boolean | null = null;
let aiProbe: Promise<boolean> | null = null;

/** Whether the server has an AI key configured (cached). */
export function checkAI(): Promise<boolean> {
  if (aiEnabled !== null) return Promise.resolve(aiEnabled);
  if (!aiProbe)
    aiProbe = fetch("/api/health")
      .then((r) => r.json())
      .then((h) => (aiEnabled = Boolean(h.ai)))
      .catch(() => (aiEnabled = false));
  return aiProbe;
}

/** Files attached to tasks are held in memory only until the task runs. */
const pendingFiles = new Map<string, UploadedFile[]>();

export async function readUpload(file: File): Promise<UploadedFile> {
  const ext = "." + (file.name.toLowerCase().split(".").pop() ?? "");
  if (!ACCEPTED_FILE_TYPES.includes(ext)) throw new Error(`${file.name}: unsupported type. Use PDF, Word, Excel, CSV, text or images.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type, data: btoa(bin) };
}

export { MAX_FILES };

function deptName(e: Employee) {
  return useOffice.getState().departments.find((d) => d.id === e.departmentId)?.name ?? "";
}
function companyName(e: Employee) {
  return useOffice.getState().companies.find((c) => c.id === e.companyId)?.name ?? null;
}

export function buildContext(): OfficeContext {
  const s = useOffice.getState();
  const nameOf = (id: string) => s.employees.find((e) => e.id === id)?.name ?? "Unknown";
  return {
    ceoName: s.settings.ceoName,
    demoMode: s.settings.demoMode,
    companies: s.companies.map((c) => ({ name: c.name, description: c.description, active: c.active })),
    team: s.employees
      .filter((e) => e.active)
      .map((e) => ({ name: e.name, title: e.title, department: deptName(e), status: e.status })),
    recentTasks: s.tasks.slice(0, 15).map((t) => ({
      employee: nameOf(t.employeeId),
      title: t.title,
      status: t.status,
      result: t.result ? t.result.slice(0, 600) : null,
      createdAt: t.createdAt,
    })),
  };
}

function inQuietHours() {
  const q = useOffice.getState().settings.quietHours;
  if (!q.enabled) return false;
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return q.start <= q.end ? hm >= q.start && hm < q.end : hm >= q.start || hm < q.end;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Queue a task (with optional files) and start it when the employee is free. */
export function enqueueTask(taskId: string, files: UploadedFile[] = []) {
  if (files.length) pendingFiles.set(taskId, files);
  const t = useOffice.getState().tasks.find((x) => x.id === taskId);
  if (t) void pump(t.employeeId);
}

/** Start the next queued task for an employee if none is running. */
export async function pump(employeeId: string) {
  if (!(await checkAI())) return;
  const s = useOffice.getState();
  if (s.tasks.some((t) => t.employeeId === employeeId && (t.status === "running" || t.status === "validating"))) return;
  const next = [...s.tasks].reverse().find((t) => t.employeeId === employeeId && t.status === "queued");
  if (next) await runTask(next.id);
}

export async function runTask(taskId: string) {
  const store = useOffice.getState();
  const task = store.tasks.find((t) => t.id === taskId);
  const emp = task && store.employees.find((e) => e.id === task.employeeId);
  if (!task || !emp) return;
  if (!(await checkAI())) {
    useUI.getState().toast("error", "The AI engine isn't configured yet (AI_API_KEY).");
    return;
  }
  const files = pendingFiles.get(taskId) ?? [];
  if (task.fileNames?.length && !files.length) {
    store.updateTask(taskId, { status: "failed", result: "The attached files were lost when the page reloaded. Please assign the task again with the files." });
    return;
  }

  store.updateTask(taskId, { status: "running", result: null });
  if (emp.status !== "in_meeting") {
    store.setEmployeeStatus([emp.id], "working");
    const a = getSim().agents.get(emp.id);
    if (a && a.intent !== "desk") getSim().returnToDesk(emp.id);
  }
  store.logActivity(emp.id, `${emp.name} started working on “${task.title}”`);

  try {
    const res = await postJSON<TaskRunResponse>("/api/ai/task", {
      employee: briefFrom(emp, deptName(emp), companyName(emp)),
      task: { id: task.id, title: task.title, instructions: task.instructions, priority: task.priority },
      context: buildContext(),
      files,
    });
    pendingFiles.delete(taskId);
    const st = useOffice.getState();
    st.updateTask(taskId, { status: res.status, result: res.result, usage: res.usage, model: res.model });
    st.addApprovals(res.approvals.map((a) => ({ ...a, taskId, employeeId: emp.id })));
    // also post them to the CEO's Telegram (✅ / ❌ buttons) when it's linked — best effort
    if (res.approvals.length) void fetch("/api/integrations/telegram/approvals", { method: "POST" }).catch(() => {});
    const quiet = inQuietHours();
    const stillInMeeting = useOffice.getState().employees.find((e) => e.id === emp.id)?.status === "in_meeting";
    if (res.status === "completed") {
      if (!stillInMeeting) st.setEmployeeStatus([emp.id], "task_completed");
      st.notify({ priority: "info", title: `${emp.name} finished: ${task.title}`, body: res.result.replace(/[#>*_`|]/g, "").slice(0, 180), employeeId: emp.id, demo: false });
      setTimeout(() => {
        const e = useOffice.getState().employees.find((x) => x.id === emp.id);
        if (e?.status === "task_completed") useOffice.getState().setEmployeeStatus([emp.id], "available");
      }, 60_000);
    } else if (res.status === "waiting_approval") {
      if (!stillInMeeting) st.setEmployeeStatus([emp.id], "waiting_approval");
      st.notify({
        priority: "important",
        title: `${emp.name} needs your approval`,
        body: res.approvals.map((a) => a.summary).join(" · ").slice(0, 240),
        employeeId: emp.id,
        demo: false,
      });
      // walk over to the CEO office to report (not during quiet hours or meetings)
      if (!quiet && !stillInMeeting) getSim().summonToCEO(emp.id);
    } else if (res.status === "waiting_data") {
      if (!stillInMeeting) st.setEmployeeStatus([emp.id], "waiting_data");
      st.notify({ priority: "important", title: `${emp.name} is waiting for data`, body: res.missingData ?? "Required data is missing.", employeeId: emp.id, demo: false });
    } else {
      if (!stillInMeeting) st.setEmployeeStatus([emp.id], "error");
      st.notify({ priority: "important", title: `${emp.name} couldn't finish “${task.title}”`, body: res.result.slice(0, 200), employeeId: emp.id, demo: false });
    }
    st.logActivity(emp.id, `${emp.name} ${res.status === "completed" ? "completed" : res.status.replace("_", " ")} “${task.title}”`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const st = useOffice.getState();
    st.updateTask(taskId, { status: "failed", result: msg });
    st.setEmployeeStatus([emp.id], "error");
    st.notify({ priority: "important", title: `${emp.name} hit a problem`, body: msg, employeeId: emp.id, demo: false });
  }
  void pump(emp.id);
}

/** Reset an employee from Error / Waiting back to Available. */
export function acknowledge(employeeId: string) {
  useOffice.getState().setEmployeeStatus([employeeId], "available");
}

/** Tasks left "running" by a page reload can never finish — mark them interrupted. */
export function recoverInterruptedTasks() {
  const s = useOffice.getState();
  for (const t of s.tasks) {
    if (t.status === "running" || t.status === "validating") s.updateTask(t.id, { status: "failed", result: "Interrupted by a page reload. Click “Run again”." });
  }
  const working = s.employees.filter((e) => e.status === "working").map((e) => e.id);
  if (working.length) s.setEmployeeStatus(working, "available");
}

export async function sendChat(employeeId: string, text: string, situation?: string): Promise<string> {
  const s = useOffice.getState();
  const emp = s.employees.find((e) => e.id === employeeId);
  if (!emp) throw new Error("Employee not found.");
  const history = s.chatMessages
    .filter((m) => m.employeeId === employeeId)
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!situation) s.addChatMessage({ employeeId, role: "ceo", content: text });
  const res = await postJSON<ChatResponse>("/api/ai/chat", {
    employee: briefFrom(emp, deptName(emp), companyName(emp)),
    context: buildContext(),
    history: situation ? [] : history,
    message: text,
    situation,
  });
  if (!situation) {
    const id = useOffice.getState().addChatMessage({ employeeId, role: "employee", content: res.reply, usage: res.usage, model: res.model });
    if (res.actions?.length) useActionCards.getState().add(id, res.actions);
  }
  return res.reply;
}
