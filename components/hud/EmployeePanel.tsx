"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Coffee,
  Footprints,
  Hand,
  ListTodo,
  MessageSquare,
  Pencil,
  Send,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { STATUS_META, type Task } from "@/lib/data/types";
import { CEO_ID } from "@/lib/data/seed";
import { getSim } from "@/lib/office/runtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, timeAgo } from "@/lib/utils";
import { departmentColor } from "@/lib/data/brand";
import { Avatar } from "./Avatar";
import { useInbox } from "@/lib/integrations/inbox";
import { MessageSquareText } from "lucide-react";
import { AINotConfigured, ApprovalCard, ChatPanel, TaskComposer, TaskRow, useAIEnabled } from "./AIWork";
import { acknowledge } from "@/lib/ai/runner";

export function StatusBadge({ status }: { status: keyof typeof STATUS_META }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
      <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export { TaskRow } from "./AIWork";

export function EmployeePanel() {
  const id = useUI((s) => s.selectedEmployeeId);
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const emp = useOffice((s) => s.employees.find((e) => e.id === id));
  const dept = useOffice((s) => s.departments.find((d) => d.id === emp?.departmentId));
  const companies = useOffice((s) => s.companies);
  const company = companies.find((c) => c.id === emp?.companyId);
  const allTasks = useOffice((s) => s.tasks);
  const allActivity = useOffice((s) => s.activity);
  const allApprovals = useOffice((s) => s.approvals);
  const approvals = useMemo(() => allApprovals.filter((a) => a.employeeId === id), [allApprovals, id]);
  const tasks = useMemo(() => allTasks.filter((t) => t.employeeId === id), [allTasks, id]);
  const activity = useMemo(() => allActivity.filter((a) => a.employeeId === id).slice(0, 40), [allActivity, id]);

  const [tab, setTab] = useState("overview");
  const ai = useAIEnabled();

  if (!emp) return null;
  const sim = getSim();
  const accent = departmentColor(dept, companies);
  const inMeeting = emp.status === "in_meeting";
  const queued = tasks.filter((t) => t.status === "queued").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const current = tasks.find((t) => ["running", "validating", "waiting_data", "waiting_approval"].includes(t.status));

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const needsAck = emp.status === "error" || emp.status === "waiting_data" || emp.status === "task_completed";

  return (
    <aside className="anim-panel pointer-events-auto absolute bottom-3 right-3 top-[68px] z-30 flex w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-panel/95 shadow-2xl backdrop-blur">
      <div
        className="relative border-b border-slate-100 p-4"
        style={{ backgroundImage: `linear-gradient(135deg, ${accent}33 0%, ${accent}10 45%, transparent 75%)` }}
      >
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <button className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-100" onClick={() => set({ selectedEmployeeId: null })} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <Avatar appearance={emp.appearance} size={56} ring={accent} />
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">{emp.name}</div>
            <div className="truncate text-xs text-slate-500">{emp.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={emp.status} />
              {company && (
                <Badge variant="outline">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: company.color }} />
                  {company.name}
                </Badge>
              )}
              {!company && dept && <Badge variant="outline">{dept.name}</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <QuickAction icon={<Footprints />} label="Visit" onClick={() => sim.visit(CEO_ID, emp.id)} />
          <QuickAction
            icon={<BriefcaseBusiness />}
            label="Summon"
            disabled={inMeeting}
            onClick={() => {
              if (sim.summonToCEO(emp.id)) toast("info", `${emp.name} is heading to your office`);
              else toast("error", "No free spot in the CEO office right now");
            }}
          />
          <QuickAction
            icon={<Coffee />}
            label="Break"
            disabled={inMeeting}
            onClick={() => {
              if (!sim.startBreak(emp.id)) toast("error", "The lounge is full right now");
            }}
          />
          <QuickAction icon={<Undo2 />} label="To desk" disabled={inMeeting} onClick={() => sim.returnToDesk(emp.id)} />
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
          <Hand className="h-3 w-3" /> Tip: press and drag an employee to pick them up. Drop on a free desk to reassign it.
        </p>
      </div>

      {needsAck && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-600">
          <span>
            {emp.status === "error" ? "The last task failed." : emp.status === "waiting_data" ? "Waiting for data you can provide." : "Finished a task."} See the Tasks tab.
          </span>
          <button className="font-semibold text-sky-700 hover:underline" onClick={() => acknowledge(emp.id)}>
            Mark as seen
          </button>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">
              <BriefcaseBusiness /> Profile
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex-1">
              <ListTodo /> Tasks{pendingApprovals.length ? ` (${pendingApprovals.length}!)` : queued ? ` (${queued})` : ""}
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-1">
              <MessageSquare /> Chat
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">
              <Activity /> Log
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4">
          <TabsContent value="overview" className="space-y-4">
            <Section title="Current task">
              {current ? (
                <TaskRow t={current} />
              ) : (
                <p className="text-xs text-slate-500">
                  No task is running.{" "}
                  <button className="font-medium text-sky-700 hover:underline" onClick={() => setTab("tasks")}>
                    Assign one
                  </button>{" "}
                  or{" "}
                  <button className="font-medium text-sky-700 hover:underline" onClick={() => setTab("chat")}>
                    start a chat
                  </button>
                  .
                </p>
              )}
            </Section>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Queued" value={queued} />
              <Stat label="Completed" value={completed} />
              <Stat label="Approvals" value={pendingApprovals.length} />
            </div>
            <Section title="Responsibilities">
              <ul className="space-y-1">
                {emp.responsibilities.map((r) => (
                  <li key={r} className="flex gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Personality">
              <p className="text-xs text-slate-600">{emp.personality}</p>
            </Section>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info icon={<Clock />} label="Working hours" value={`${emp.workingHours.start}–${emp.workingHours.end} MYT`} />
              <Info icon={<Send />} label="Reporting" value={emp.reportingSchedule} />
              <Info icon={<Bot />} label="AI model" value={emp.ai.provider === "none" ? "Not configured" : `${emp.ai.provider} · ${emp.ai.model}`} />
              <Info icon={<BriefcaseBusiness />} label="Workstation" value={emp.workstationId ?? "Unassigned"} />
            </div>
            <Section title="Data access permissions">
              <div className="flex flex-wrap gap-1">
                {emp.permissions.map((p) => (
                  <Badge key={p} variant="secondary">
                    <ShieldCheck className="h-3 w-3" />
                    {p}
                  </Badge>
                ))}
              </div>
            </Section>
            <Button variant="outline" size="sm" className="w-full" onClick={() => set({ dialog: "edit-employee", editEmployeeId: emp.id })}>
              <Pencil /> Edit employee
            </Button>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-3">
            {ai === false && <AINotConfigured />}
            {emp.permissions.includes("customers:read") && <InboxShortcut />}
            <TaskComposer emp={emp} />
            <Section title="Pending approvals">
              {pendingApprovals.length ? (
                <div className="space-y-2">
                  {pendingApprovals.map((a) => (
                    <ApprovalCard key={a.id} a={a} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No actions awaiting your approval.</p>
              )}
            </Section>
            <Section title={`Task history (${tasks.length})`}>
              <div className="space-y-2">
                {tasks.length ? tasks.map((t) => <TaskRow key={t.id} t={t} />) : <p className="text-xs text-slate-500">No tasks yet.</p>}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="chat" className="h-full">
            <ChatPanel emp={emp} />
          </TabsContent>

          <TabsContent value="activity" className="space-y-2">
            {activity.length ? (
              activity.map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="w-14 shrink-0 text-slate-400">{timeAgo(a.at)}</span>
                  <span className="text-slate-700">{a.text}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No recorded activity yet.</p>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function QuickAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-panel py-2 text-[11px] font-medium text-slate-700 transition hover:border-navy/30 hover:bg-slate-50 disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4"
    >
      {icon}
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-center">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-400 [&_svg]:h-3 [&_svg]:w-3">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-medium text-slate-700" title={value}>
        {value}
      </div>
    </div>
  );
}

function InboxShortcut() {
  const unread = useInbox((s) => s.unread);
  const set = useUI((s) => s.set);
  return (
    <button
      onClick={() => set({ dialog: "inbox" })}
      className="flex w-full items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-left text-xs hover:bg-sky-100"
    >
      <MessageSquareText className="h-5 w-5 text-sky-700" />
      <div className="flex-1">
        <div className="font-semibold text-sky-900">Customer inbox (Lazada)</div>
        <div className="text-sky-800/80">Open buyer chats — I draft replies, you approve before sending.</div>
      </div>
      {unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{unread} unread</span>}
    </button>
  );
}
