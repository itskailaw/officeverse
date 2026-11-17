"use client";

// Persistent business + office state. Persisted to localStorage (local/demo
// mode) and mirrored to Supabase by lib/data/sync.ts when configured.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ActivityEntry,
  AppNotification,
  Approval,
  AuditEntry,
  ChatMessage,
  Company,
  Department,
  Employee,
  EmployeeStatus,
  FurnitureItem,
  Meeting,
  MeetingItem,
  OfficeLayout,
  OfficeSettings,
  Task,
} from "@/lib/data/types";
import { DEFAULT_SETTINGS, SEED_COMPANIES, SEED_DEPARTMENTS, SEED_EMPLOYEES } from "@/lib/data/seed";
import { DEFAULT_LAYOUT } from "@/lib/office/layout";

export const uid = (p = "id") =>
  `${p}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();

export interface OfficeData {
  companies: Company[];
  departments: Department[];
  employees: Employee[];
  tasks: Task[];
  meetings: Meeting[];
  notifications: AppNotification[];
  activity: ActivityEntry[];
  audit: AuditEntry[];
  settings: OfficeSettings;
  furniture: FurnitureItem[];
  approvals: Approval[];
  chatMessages: ChatMessage[];
}

export type Result = { ok: true; id?: string } | { ok: false; error: string };

interface Actions {
  // companies & departments
  addCompany(c: Pick<Company, "name" | "description" | "color">): Result;
  updateCompany(id: string, patch: Partial<Company>): Result;
  deleteCompany(id: string): Result;
  addDepartment(d: Pick<Department, "name" | "description" | "companyId">): Result;
  updateDepartment(id: string, patch: Partial<Department>): Result;
  deleteDepartment(id: string): Result;
  // employees
  hireEmployee(e: Omit<Employee, "id" | "createdAt" | "status" | "active">): Result;
  updateEmployee(id: string, patch: Partial<Employee>): Result;
  setEmployeeActive(id: string, active: boolean): Result;
  setEmployeeStatus(ids: string[], status: EmployeeStatus): void;
  assignWorkstation(id: string, workstationId: string | null): Result;
  // tasks
  assignTask(t: Pick<Task, "employeeId" | "title" | "instructions" | "priority"> & Partial<Pick<Task, "source" | "meetingId" | "fileNames">>): Result;
  cancelTask(id: string): Result;
  updateTask(id: string, patch: Partial<Task>): void;
  // approvals & chat
  addApprovals(list: Omit<Approval, "id" | "createdAt" | "status">[]): void;
  decideApproval(id: string, decision: "approved" | "rejected"): Result;
  addChatMessage(m: Omit<ChatMessage, "id" | "createdAt">): string;
  clearChat(employeeId: string): void;
  // meetings
  startMeeting(topic: string, attendeeIds: string[]): Result;
  addMeetingItem(meetingId: string, item: Pick<MeetingItem, "kind" | "text" | "assigneeId">): Result;
  removeMeetingItem(meetingId: string, itemId: string): void;
  endMeeting(meetingId: string): Result;
  // notifications & logs
  notify(n: Omit<AppNotification, "id" | "createdAt" | "read">): void;
  markRead(id: string): void;
  markAllRead(): void;
  clearNotifications(): void;
  logActivity(employeeId: string | null, text: string): void;
  // settings & layout
  updateSettings(patch: Partial<OfficeSettings>): void;
  moveFurniture(id: string, x: number, z: number, rot: number): void;
  resetLayout(): void;
  resetAppearance(): void;
  resetAll(): void;
  hydrate(data: Partial<OfficeData>): void;
}

export type OfficeState = OfficeData & Actions;

export const initialData = (): OfficeData => ({
  companies: SEED_COMPANIES,
  departments: SEED_DEPARTMENTS,
  employees: SEED_EMPLOYEES,
  tasks: [],
  meetings: [],
  notifications: [
    {
      id: "n-welcome",
      priority: "info",
      title: "Welcome to OfficeVerse",
      body: "Phase 1 is live: explore the office, talk to your team, call meetings and queue tasks. AI execution and marketplace integrations arrive in Phases 2–3 — until then no live business data is shown.",
      demo: false,
      read: false,
      createdAt: now(),
    },
  ],
  activity: [],
  audit: [],
  settings: DEFAULT_SETTINGS,
  furniture: DEFAULT_LAYOUT.furniture,
  approvals: [],
  chatMessages: [],
});

export const useOffice = create<OfficeState>()(
  persist(
    (set, get) => {
      const audit = (action: string, entity: string, entityId: string | null, detail?: string) =>
        set((s) => ({
          audit: [{ id: uid("audit"), actor: "ceo", action, entity, entityId, detail, at: now() }, ...s.audit].slice(0, 500),
        }));

      return {
        ...initialData(),

        // ── companies ──
        addCompany(c) {
          const name = c.name.trim();
          if (!name) return { ok: false, error: "Company name is required." };
          if (get().companies.some((x) => x.name.toLowerCase() === name.toLowerCase()))
            return { ok: false, error: "A company with that name already exists." };
          const id = uid("co");
          set((s) => ({ companies: [...s.companies, { ...c, name, id, active: true, createdAt: now() }] }));
          audit("create", "company", id, name);
          return { ok: true, id };
        },
        updateCompany(id, patch) {
          if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "Name cannot be empty." };
          set((s) => ({ companies: s.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
          audit("update", "company", id, Object.keys(patch).join(", "));
          return { ok: true };
        },
        deleteCompany(id) {
          const s = get();
          const emps = s.employees.filter((e) => e.companyId === id).length;
          if (emps) return { ok: false, error: `Reassign the ${emps} employee(s) of this company to another department first (deactivating keeps the company).` };
          const name = s.companies.find((c) => c.id === id)?.name;
          set((st) => ({
            companies: st.companies.filter((c) => c.id !== id),
            departments: st.departments.filter((d) => d.companyId !== id),
          }));
          audit("delete", "company", id, name);
          return { ok: true };
        },
        addDepartment(d) {
          const name = d.name.trim();
          if (!name) return { ok: false, error: "Department name is required." };
          const id = uid("dept");
          set((s) => ({ departments: [...s.departments, { ...d, name, id, active: true, createdAt: now() }] }));
          audit("create", "department", id, name);
          return { ok: true, id };
        },
        updateDepartment(id, patch) {
          if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "Name cannot be empty." };
          set((s) => ({ departments: s.departments.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
          audit("update", "department", id, Object.keys(patch).join(", "));
          return { ok: true };
        },
        deleteDepartment(id) {
          const n = get().employees.filter((e) => e.departmentId === id).length;
          if (n) return { ok: false, error: `Move the ${n} employee(s) out of this department first.` };
          set((s) => ({ departments: s.departments.filter((d) => d.id !== id) }));
          audit("delete", "department", id);
          return { ok: true };
        },

        // ── employees ──
        hireEmployee(e) {
          if (!e.name.trim()) return { ok: false, error: "Name is required." };
          if (!e.title.trim()) return { ok: false, error: "Job title is required." };
          if (e.workstationId && get().employees.some((x) => x.active && x.workstationId === e.workstationId))
            return { ok: false, error: "That workstation is already taken." };
          const id = uid("emp");
          set((s) => ({
            employees: [...s.employees, { ...e, id, status: "available", active: true, createdAt: now() }],
          }));
          audit("hire", "employee", id, `${e.name} — ${e.title}`);
          get().logActivity(id, `${e.name} joined as ${e.title}`);
          return { ok: true, id };
        },
        updateEmployee(id, patch) {
          if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "Name cannot be empty." };
          set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
          audit("update", "employee", id, Object.keys(patch).join(", "));
          return { ok: true };
        },
        setEmployeeActive(id, active) {
          const e = get().employees.find((x) => x.id === id);
          if (!e) return { ok: false, error: "Employee not found." };
          if (active && e.workstationId && get().employees.some((x) => x.id !== id && x.active && x.workstationId === e.workstationId)) {
            set((s) => ({ employees: s.employees.map((x) => (x.id === id ? { ...x, workstationId: null } : x)) }));
          }
          set((s) => ({ employees: s.employees.map((x) => (x.id === id ? { ...x, active } : x)) }));
          audit(active ? "reactivate" : "deactivate", "employee", id, e.name);
          return { ok: true };
        },
        setEmployeeStatus(ids, status) {
          set((s) => ({ employees: s.employees.map((e) => (ids.includes(e.id) ? { ...e, status } : e)) }));
        },
        assignWorkstation(id, workstationId) {
          if (workstationId && get().employees.some((x) => x.id !== id && x.active && x.workstationId === workstationId))
            return { ok: false, error: "That workstation belongs to someone else." };
          set((s) => ({ employees: s.employees.map((e) => (e.id === id ? { ...e, workstationId } : e)) }));
          audit("assign_workstation", "employee", id, workstationId ?? "none");
          return { ok: true };
        },

        // ── tasks ──
        assignTask(t) {
          if (!t.title.trim()) return { ok: false, error: "Task title is required." };
          const emp = get().employees.find((e) => e.id === t.employeeId);
          if (!emp) return { ok: false, error: "Employee not found." };
          const id = uid("task");
          const task: Task = {
            id,
            employeeId: t.employeeId,
            companyId: emp.companyId,
            title: t.title.trim(),
            instructions: t.instructions.trim(),
            priority: t.priority,
            status: "queued",
            source: t.source ?? "ceo",
            meetingId: t.meetingId ?? null,
            fileNames: t.fileNames ?? [],
            result: null,
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          audit("assign", "task", id, `${emp.name}: ${task.title}`);
          get().logActivity(emp.id, `received task “${task.title}”`);
          return { ok: true, id };
        },
        cancelTask(id) {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "cancelled", updatedAt: now() } : t)) }));
          audit("cancel", "task", id);
          return { ok: true };
        },
        updateTask(id, patch) {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now() } : t)) }));
        },

        // ── approvals & chat ──
        addApprovals(list) {
          if (!list.length) return;
          set((s) => ({
            approvals: [...list.map((a) => ({ ...a, id: uid("appr"), status: "pending" as const, createdAt: now(), decidedAt: null })), ...s.approvals].slice(0, 300),
          }));
        },
        decideApproval(id, decision) {
          const a = get().approvals.find((x) => x.id === id);
          if (!a) return { ok: false, error: "Approval not found." };
          if (a.status !== "pending") return { ok: false, error: "This approval was already decided." };
          set((s) => ({ approvals: s.approvals.map((x) => (x.id === id ? { ...x, status: decision, decidedAt: now() } : x)) }));
          audit(decision === "approved" ? "approve" : "reject", "approval", id, a.summary);
          // once nothing else is pending for the task, close it out
          const stillPending = get().approvals.some((x) => x.taskId === a.taskId && x.status === "pending");
          if (a.taskId && !stillPending) {
            const t = get().tasks.find((x) => x.id === a.taskId);
            if (t && t.status === "waiting_approval") get().updateTask(t.id, { status: "completed" });
          }
          const empPending = get().approvals.some((x) => x.employeeId === a.employeeId && x.status === "pending");
          const emp = get().employees.find((e) => e.id === a.employeeId);
          if (emp && !empPending && emp.status === "waiting_approval") get().setEmployeeStatus([emp.id], "available");
          if (emp) get().logActivity(emp.id, `CEO ${decision} “${a.summary}” from ${emp.name}`);
          return { ok: true };
        },
        addChatMessage(m) {
          const id = uid("msg");
          set((s) => ({ chatMessages: [...s.chatMessages, { ...m, id, createdAt: now() }].slice(-2000) }));
          return id;
        },
        clearChat(employeeId) {
          set((s) => ({ chatMessages: s.chatMessages.filter((m) => m.employeeId !== employeeId) }));
        },

        // ── meetings ──
        startMeeting(topic, attendeeIds) {
          if (!topic.trim()) return { ok: false, error: "Meeting topic is required." };
          if (!attendeeIds.length) return { ok: false, error: "Select at least one attendee." };
          if (get().meetings.some((m) => m.status === "in_progress")) return { ok: false, error: "A meeting is already in progress." };
          const id = uid("mtg");
          set((s) => ({
            meetings: [
              { id, topic: topic.trim(), attendeeIds, status: "in_progress", startedAt: now(), endedAt: null, items: [], summary: null, createdAt: now() },
              ...s.meetings,
            ],
          }));
          get().setEmployeeStatus(attendeeIds, "in_meeting");
          audit("start", "meeting", id, topic);
          return { ok: true, id };
        },
        addMeetingItem(meetingId, item) {
          if (!item.text.trim()) return { ok: false, error: "Text is required." };
          let taskId: string | null = null;
          if (item.kind === "action") {
            if (!item.assigneeId) return { ok: false, error: "Choose who owns this action item." };
            const r = get().assignTask({
              employeeId: item.assigneeId,
              title: item.text,
              instructions: `Action item from meeting: ${get().meetings.find((m) => m.id === meetingId)?.topic ?? ""}`,
              priority: "normal",
              source: "meeting",
              meetingId,
            });
            if (r.ok) taskId = r.id ?? null;
          }
          const mi: MeetingItem = { id: uid("mi"), kind: item.kind, text: item.text.trim(), assigneeId: item.assigneeId ?? null, taskId, createdAt: now() };
          set((s) => ({ meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, items: [...m.items, mi] } : m)) }));
          return { ok: true, id: mi.id };
        },
        removeMeetingItem(meetingId, itemId) {
          set((s) => ({ meetings: s.meetings.map((m) => (m.id === meetingId ? { ...m, items: m.items.filter((i) => i.id !== itemId) } : m)) }));
        },
        endMeeting(meetingId) {
          const m = get().meetings.find((x) => x.id === meetingId);
          if (!m) return { ok: false, error: "Meeting not found." };
          const emps = get().employees;
          const name = (id?: string | null) => emps.find((e) => e.id === id)?.name ?? "—";
          const sect = (kind: MeetingItem["kind"]) => m.items.filter((i) => i.kind === kind);
          const lines = [
            `Meeting: ${m.topic}`,
            `Attendees: ${m.attendeeIds.map((id) => name(id)).join(", ")}`,
            "",
            "Decisions:",
            ...(sect("decision").length ? sect("decision").map((d) => `• ${d.text}`) : ["• None recorded"]),
            "",
            "Action items:",
            ...(sect("action").length ? sect("action").map((a) => `• ${a.text} — ${name(a.assigneeId)}`) : ["• None recorded"]),
            "",
            "Notes:",
            ...(sect("note").length ? sect("note").map((n) => `• ${n.text}`) : ["• None recorded"]),
          ];
          const summary = lines.join("\n");
          set((s) => ({
            meetings: s.meetings.map((x) => (x.id === meetingId ? { ...x, status: "ended", endedAt: now(), summary } : x)),
          }));
          get().setEmployeeStatus(m.attendeeIds, "available");
          get().notify({
            priority: "info",
            title: `Meeting summary saved: ${m.topic}`,
            body: `${sect("decision").length} decision(s), ${sect("action").length} action item(s) assigned.`,
            demo: false,
          });
          audit("end", "meeting", meetingId, m.topic);
          return { ok: true };
        },

        // ── notifications & logs ──
        notify(n) {
          set((s) => ({ notifications: [{ ...n, id: uid("n"), read: false, createdAt: now() }, ...s.notifications].slice(0, 200) }));
        },
        markRead(id) {
          set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
        },
        markAllRead() {
          set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
        },
        clearNotifications() {
          set({ notifications: [] });
        },
        logActivity(employeeId, text) {
          set((s) => ({ activity: [{ id: uid("act"), employeeId, text, at: now() }, ...s.activity].slice(0, 300) }));
        },

        // ── settings & layout ──
        updateSettings(patch) {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
        },
        moveFurniture(id, x, z, rot) {
          set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, x, z, rot } : f)) }));
          audit("move", "furniture", id, `${x.toFixed(2)}, ${z.toFixed(2)}`);
        },
        resetLayout() {
          set({ furniture: DEFAULT_LAYOUT.furniture });
          // restore default workstations for seeded employees
          set((s) => ({
            employees: s.employees.map((e) => {
              const seed = SEED_EMPLOYEES.find((x) => x.id === e.id);
              return seed ? { ...e, workstationId: seed.workstationId } : e;
            }),
          }));
          audit("reset", "layout", null);
        },
        resetAppearance() {
          set((s) => ({
            settings: {
              ...s.settings,
              wallColor: DEFAULT_SETTINGS.wallColor,
              accentColor: DEFAULT_SETTINGS.accentColor,
              floorWood: DEFAULT_SETTINGS.floorWood,
              lighting: DEFAULT_SETTINGS.lighting,
              walls: DEFAULT_SETTINGS.walls,
            },
          }));
          audit("reset", "appearance", null);
        },
        resetAll() {
          set(initialData());
        },
        hydrate(data) {
          set((s) => ({ ...s, ...data }));
        },
      };
    },
    {
      name: "officeverse:v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        companies: s.companies,
        departments: s.departments,
        employees: s.employees,
        tasks: s.tasks,
        meetings: s.meetings,
        notifications: s.notifications,
        activity: s.activity,
        audit: s.audit,
        settings: s.settings,
        furniture: s.furniture,
        approvals: s.approvals,
        chatMessages: s.chatMessages,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OfficeData>;
        const merged = { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
        // forward-migrate older saves: add newly introduced default furniture
        if (p.furniture) {
          const have = new Set(p.furniture.map((f) => f.id));
          merged.furniture = [...p.furniture, ...DEFAULT_LAYOUT.furniture.filter((f) => !have.has(f.id))];
        }
        // ...and give seeded employees their default outfit if they have none yet
        if (p.employees) {
          merged.employees = p.employees.map((e) => {
            const seed = SEED_EMPLOYEES.find((s) => s.id === e.id);
            let next = !e.appearance.outfit && seed ? { ...e, appearance: { ...e.appearance, outfit: seed.appearance.outfit } } : e;
            if (next.ai.maxTokensPerTask < 8000) next = { ...next, ai: { ...next.ai, maxTokensPerTask: 16000 } };
            return next;
          });
        }
        if (merged.settings.ceoAppearance && !merged.settings.ceoAppearance.outfit) {
          merged.settings = { ...merged.settings, ceoAppearance: { ...merged.settings.ceoAppearance, outfit: "blazer" } };
        }
        return merged;
      },
    },
  ),
);

/** Build the full layout from the static shell + persisted furniture. */
export function layoutFrom(furniture: FurnitureItem[]): OfficeLayout {
  return { ...DEFAULT_LAYOUT, furniture };
}
