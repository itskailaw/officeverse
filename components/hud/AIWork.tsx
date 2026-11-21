"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, ChevronUp, Copy, FileUp, Loader2, Paperclip, Play, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useActionCards } from "@/lib/store/action-cards";
import type { Approval, Employee, Task } from "@/lib/data/types";
import { checkAI, enqueueTask, MAX_FILES, readUpload, runTask, sendChat } from "@/lib/ai/runner";
import { ACCEPTED_FILE_TYPES, type UploadedFile } from "@/lib/ai/protocol";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { cn, timeAgo } from "@/lib/utils";

export const TASK_STATUS: Record<Task["status"], { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-slate-100 text-slate-700" },
  validating: { label: "Checking access", cls: "bg-sky-100 text-sky-800" },
  running: { label: "Working…", cls: "bg-blue-100 text-blue-800" },
  waiting_data: { label: "Waiting for data", cls: "bg-amber-100 text-amber-800" },
  waiting_approval: { label: "Needs approval", cls: "bg-purple-100 text-purple-800" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500 line-through" },
};

/** Whether the server has an AI key. null while checking. */
export function useAIEnabled() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    void checkAI().then(setOn);
  }, []);
  return on;
}

export function AINotConfigured() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
      <b>AI engine not configured.</b> Add <code>AI_API_KEY</code> in Vercel (Settings → Environments → Production) and redeploy. Tasks you assign are saved
      and will run once it&apos;s set up.
    </div>
  );
}

// ------------------------------------------------------------------ task card
export function TaskRow({ t, showEmployee, defaultOpen }: { t: Task; showEmployee?: boolean; defaultOpen?: boolean }) {
  const cancel = useOffice((s) => s.cancelTask);
  const emp = useOffice((s) => s.employees.find((e) => e.id === t.employeeId));
  const [open, setOpen] = useState(!!defaultOpen);
  const st = TASK_STATUS[t.status];
  const toast = useUI((s) => s.toast);
  return (
    <div className="rounded-lg border border-slate-200 bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="truncate text-sm font-medium text-slate-800">{t.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {showEmployee && emp ? `${emp.name} · ` : ""}
            {t.source === "meeting" ? "From meeting · " : ""}
            {timeAgo(t.createdAt)}
            {t.priority === "high" && <span className="ml-1 font-semibold text-red-600">· High priority</span>}
            {t.fileNames && t.fileNames.length > 0 && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                · <Paperclip className="h-3 w-3" />
                {t.fileNames.length}
              </span>
            )}
          </div>
        </button>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>
          {t.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
          {st.label}
        </span>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
          {t.instructions && <p className="whitespace-pre-wrap text-xs text-slate-600">{t.instructions}</p>}
          {t.fileNames && t.fileNames.length > 0 && <p className="text-[11px] text-slate-500">Files: {t.fileNames.join(", ")}</p>}
          {t.result && (
            <div className="group relative select-text">
              <Markdown>{t.result}</Markdown>
              <CopyButton text={t.result} />
            </div>
          )}
          {t.usage && (
            <p className="text-[10px] text-slate-400">
              {t.model} · {t.usage.input.toLocaleString()} in / {t.usage.output.toLocaleString()} out tokens
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-end gap-3">
        {!open && t.result && (
          <button className="flex items-center gap-0.5 text-[11px] font-medium text-sky-700 hover:underline" onClick={() => setOpen(true)}>
            View report <ChevronDown className="h-3 w-3" />
          </button>
        )}
        {open && (
          <button className="flex items-center gap-0.5 text-[11px] text-slate-500 hover:underline" onClick={() => setOpen(false)}>
            Collapse <ChevronUp className="h-3 w-3" />
          </button>
        )}
        {t.result && open && (
          <button
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
            onClick={() => navigator.clipboard?.writeText(t.result ?? "").then(() => toast("success", "Report copied"))}
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        )}
        {t.status === "queued" && (
          <>
            <button className="flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline" onClick={() => void runTask(t.id)}>
              <Play className="h-3 w-3" /> Run now
            </button>
            <button className="text-[11px] font-medium text-slate-500 hover:text-red-600" onClick={() => cancel(t.id)}>
              Cancel
            </button>
          </>
        )}
        {(t.status === "failed" || t.status === "waiting_data") && !(t.fileNames && t.fileNames.length) && (
          <button className="flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline" onClick={() => void runTask(t.id)}>
            <RotateCcw className="h-3 w-3" /> Run again
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ composer
export function TaskComposer({ emp }: { emp: Employee }) {
  const assignTask = useOffice((s) => s.assignTask);
  const toast = useUI((s) => s.toast);
  const ai = useAIEnabled();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (files.length + arr.length > MAX_FILES) return toast("error", `Attach at most ${MAX_FILES} files per task.`);
    setReading(true);
    try {
      const read = await Promise.all(arr.map(readUpload));
      setFiles((f) => [...f, ...read]);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Couldn't read the file.");
    } finally {
      setReading(false);
    }
  };

  const submit = () => {
    const r = assignTask({ employeeId: emp.id, title, instructions, priority, fileNames: files.map((f) => f.name) });
    if (!r.ok || !r.id) return toast("error", r.ok ? "Couldn't create the task." : r.error);
    enqueueTask(r.id, files);
    toast("success", ai ? `${emp.name.split(" ")[0]} is on it` : `Task saved for ${emp.name}`);
    setTitle("");
    setInstructions("");
    setPriority("normal");
    setFiles([]);
  };

  return (
    <div
      className={cn("space-y-2 rounded-xl border p-3 transition", drag ? "border-sky-400 bg-sky-50" : "border-slate-200")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      {emp.departmentId === "dept-amare" && (
        <button
          type="button"
          onClick={() => useUI.getState().set({ dialog: "subtitles" })}
          className="flex w-full items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-left text-xs text-violet-900 hover:bg-violet-100"
        >
          <span aria-hidden>🎬</span>
          <span className="flex-1">
            <b>Subtitle job</b> — upload .cip / .srt / .vtt / .ass / .sbv. Lina translates, Adam checks every line, you download the file.
          </span>
          <span className="font-semibold">Open →</span>
        </button>
      )}
      <div>
        <Label htmlFor="task-title">Task</Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Analyze yesterday's Shopee sales" maxLength={200} />
      </div>
      <div>
        <Label htmlFor="task-instr">Instructions (optional)</Label>
        <Textarea id="task-instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Context, scope, output format…" maxLength={4000} />
      </div>
      <div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-2.5 text-[11px] text-slate-500 hover:border-sky-300 hover:text-slate-700"
        >
          {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          Drop files here or click to attach — PDF, Word, Excel, CSV, text, images (max {MAX_FILES}, 3 MB each)
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                <Paperclip className="h-3 w-3" />
                {f.name}
                <button onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="Remove file">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="task-pri">Priority</Label>
          <Select id="task-pri" value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </Select>
        </div>
        <Button onClick={submit} disabled={!title.trim() || reading}>
          <Send /> Assign
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ approvals
const KIND_LABEL: Record<Approval["kind"], string> = {
  payment: "Payment",
  ad_campaign: "Ad campaign change",
  product_update: "Product / listing update",
  customer_message: "Customer message",
  record_deletion: "Delete records",
  other: "Other action",
};

export function ApprovalCard({ a, showEmployee }: { a: Approval; showEmployee?: boolean }) {
  const decide = useOffice((s) => s.decideApproval);
  const emp = useOffice((s) => s.employees.find((e) => e.id === a.employeeId));
  const toast = useUI((s) => s.toast);
  const [open, setOpen] = useState(a.status === "pending");
  return (
    <div className={cn("rounded-lg border p-3", a.status === "pending" ? "border-purple-200 bg-purple-50/40" : "border-slate-200 bg-panel")}>
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-700">{KIND_LABEL[a.kind]}</span>
          <span className="text-[10px] text-slate-400">
            {showEmployee && emp ? `${emp.name} · ` : ""}
            {timeAgo(a.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 text-sm font-medium text-slate-800">{a.summary}</div>
      </button>
      {open && <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-panel p-2 font-sans text-xs text-slate-700 ring-1 ring-slate-100">{a.draft}</pre>}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800"
          onClick={() => navigator.clipboard?.writeText(a.draft).then(() => toast("success", "Draft copied"))}
        >
          <Copy className="h-3 w-3" /> Copy draft
        </button>
        {a.status === "pending" && a.id.startsWith("review-shopee-") ? (
          <ReviewButtons a={a} />
        ) : a.status === "pending" && a.id.startsWith("cancel-shopee-") ? (
          <CancellationButtons a={a} />
        ) : a.status === "pending" ? (
          <>
            <Button size="sm" variant="outline" onClick={() => decide(a.id, "rejected")}>
              <X /> Reject
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const r = decide(a.id, "approved");
                if (r.ok) toast("success", "Approved. OfficeVerse doesn't act on external systems yet — copy the draft to use it.");
              }}
            >
              <Check /> Approve
            </Button>
          </>
        ) : (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", a.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600")}>
            {a.status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Buyer cancellation request: the decision is sent to Shopee straight away. */
/** Post Mei Ling's reply to a low rating (editable first), or skip it. */
function ReviewButtons({ a }: { a: Approval }) {
  const decide = useOffice((s) => s.decideApproval);
  const toast = useUI((s) => s.toast);
  const initial = a.draft.split("Reply to post:\n")[1] ?? "";
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState<"post" | "skip" | null>(null);
  const send = async (action: "post" | "skip") => {
    setBusy(action);
    try {
      const r = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, action, text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
      decide(a.id, action === "post" ? "approved" : "rejected");
      toast("success", action === "post" ? "Reply posted on Shopee" : "Skipped");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="w-full space-y-1.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} className="w-full rounded-lg border border-slate-200 bg-panel p-2 text-xs text-slate-800" aria-label="Reply to post" />
      <div className="flex gap-1.5">
        <Button size="sm" disabled={busy !== null || !text.trim()} onClick={() => send("post")}>
          {busy === "post" ? <Loader2 className="animate-spin" /> : <Check />} Post reply
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => send("skip")}>
          {busy === "skip" ? <Loader2 className="animate-spin" /> : <X />} Skip
        </Button>
      </div>
    </div>
  );
}

function CancellationButtons({ a }: { a: Approval }) {
  const decide = useOffice((s) => s.decideApproval);
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const send = async (accept: boolean) => {
    if (!confirm(accept ? "Accept the cancellation? The order is cancelled and the buyer refunded." : "Reject the cancellation? You'll need to ship this order.")) return;
    setBusy(accept ? "accept" : "reject");
    try {
      const r = await fetch("/api/fulfil/cancellation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, accept }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
      decide(a.id, accept ? "approved" : "rejected");
      toast("success", accept ? "Cancellation accepted on Shopee" : "Cancellation rejected — ship the order");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => send(false)}>
        {busy === "reject" ? <Loader2 className="animate-spin" /> : <X />} Reject — ship it
      </Button>
      <Button size="sm" disabled={busy !== null} onClick={() => send(true)}>
        {busy === "accept" ? <Loader2 className="animate-spin" /> : <Check />} Accept cancellation
      </Button>
    </>
  );
}

/** Approve / Cancel for actions a staff member offered in this message. Runs only on Approve (owner). */
function ActionCards({ messageId }: { messageId: string }) {
  const cards = useActionCards((s) => s.byMessage[messageId]);
  const update = useActionCards((s) => s.update);
  const toast = useUI((s) => s.toast);
  if (!cards?.length) return null;
  const run = async (action: string) => {
    update(messageId, action, { status: "running" });
    try {
      const r = await fetch("/api/actions/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      update(messageId, action, { status: j.ok ? "done" : "failed", result: j.text });
      toast(j.ok ? "success" : "error", j.text ?? "Done");
      useOffice.getState().recordAudit("staff_action", "action", null, `${action}: ${j.text ?? ""}`);
    } catch (e) {
      update(messageId, action, { status: "failed", result: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <div className="mt-2 space-y-1.5">
      {cards.map((c) => (
        <div key={c.action} className="rounded-xl border border-sky-200 bg-panel p-2 text-xs">
          <div className="font-semibold text-slate-800">{c.label}</div>
          {c.note && <div className="text-[11px] text-slate-500">{c.note}</div>}
          {c.status === "pending" || c.status === "running" ? (
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" onClick={() => void run(c.action)} disabled={c.status === "running"}>
                {c.status === "running" ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update(messageId, c.action, { status: "cancelled" })} disabled={c.status === "running"}>
                <X /> Not now
              </Button>
            </div>
          ) : (
            <div className={cn("mt-1 text-[11px] font-medium", c.status === "done" ? "text-emerald-700" : c.status === "failed" ? "text-red-700" : "text-slate-400")}>
              {c.status === "cancelled" ? "Not run" : c.result}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Small copy-to-clipboard button for a staff message or task result (shows on hover; always on touch screens). */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // older browsers: select a hidden textarea and copy
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="mt-1 flex items-center gap-1 text-[10px] font-medium text-slate-400 opacity-100 transition hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100"
      aria-label="Copy message"
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

// ------------------------------------------------------------------ chat
export function ChatPanel({ emp }: { emp: Employee }) {
  const all = useOffice((s) => s.chatMessages);
  const clear = useOffice((s) => s.clearChat);
  const messages = useMemo(() => all.filter((m) => m.employeeId === emp.id), [all, emp.id]);
  const ai = useAIEnabled();
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const first = emp.name.split(" ")[0];

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setText("");
    setBusy(true);
    try {
      await sendChat(emp.id, msg);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Message failed");
    } finally {
      setBusy(false);
    }
  };

  if (ai === false) return <AINotConfigured />;

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="flex-1 space-y-3">
        {!messages.length && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
              <Bot className="h-4 w-4" /> Chat with {first}
            </div>
            Ask about their work, get quick answers, or brainstorm. For longer work with a saved report, use the Tasks tab.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "ceo" ? "justify-end" : "justify-start")}>
            <div className={cn("group relative max-w-[88%] select-text rounded-2xl px-3 py-2", m.role === "ceo" ? "rounded-br-sm bg-navy text-white" : "rounded-bl-sm bg-slate-100")}>
              {m.role === "ceo" ? <p className="whitespace-pre-wrap text-[13px]">{m.content}</p> : <Markdown>{m.content}</Markdown>}
              {m.role !== "ceo" && <ActionCards messageId={m.id} />}
              {m.role !== "ceo" && <CopyButton text={m.content} />}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {first} is typing…
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 mt-3 space-y-1.5 bg-panel pt-2">
        <div className="flex gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Message ${first}…`}
            className="min-h-[42px] resize-none"
            rows={1}
            maxLength={4000}
          />
          <Button size="icon" onClick={() => void send()} disabled={!text.trim() || busy} aria-label="Send">
            <Send />
          </Button>
        </div>
        {messages.length > 0 && (
          <button className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-600" onClick={() => clear(emp.id)}>
            <Trash2 className="h-3 w-3" /> Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}
