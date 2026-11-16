"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Gavel, Loader2, StickyNote, Trash2, Users } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { CEO_ID } from "@/lib/data/seed";
import type { MeetingItem } from "@/lib/data/types";
import { getSim } from "@/lib/office/runtime";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Avatar } from "./Avatar";

const MAX_ATTENDEES = 9;

export function MeetingCallDialog() {
  const open = useUI((s) => s.dialog === "meeting-call");
  const setUI = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const employees = useOffice((s) => s.employees);
  const departments = useOffice((s) => s.departments);
  const start = useOffice((s) => s.startMeeting);
  const [topic, setTopic] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setTopic("");
      setPicked([]);
    }
  }, [open]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_ATTENDEES ? (toast("error", `The table seats ${MAX_ATTENDEES} attendees plus you`), p) : [...p, id]));

  const go = () => {
    const r = start(topic, picked);
    if (!r.ok) return toast("error", r.error);
    getSim().callMeeting(picked, CEO_ID);
    useOffice.getState().logActivity(null, `CEO called a meeting: ${topic}`);
    setUI({ dialog: null, selectedEmployeeId: null });
    useUI.getState().camera({ kind: "focus", x: 15, z: 18 });
  };

  const active = employees.filter((e) => e.active);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && setUI({ dialog: null })}>
      <DialogContent title="Call a meeting" description="Selected employees will walk to the Meeting Room and take a seat." className="max-w-xl">
        <div className="space-y-4 p-5">
          <div>
            <Label>Topic</Label>
            <Input autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Weekly e-commerce review" maxLength={120} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="mb-0">
                Attendees ({picked.length}/{MAX_ATTENDEES})
              </Label>
              <div className="flex gap-2 text-[11px]">
                {departments
                  .filter((d) => active.some((e) => e.departmentId === d.id))
                  .slice(0, 4)
                  .map((d) => (
                    <button
                      key={d.id}
                      className="text-sky-700 hover:underline"
                      onClick={() => setPicked(active.filter((e) => e.departmentId === d.id).map((e) => e.id).slice(0, MAX_ATTENDEES))}
                    >
                      {d.name.split(" ")[0]}
                    </button>
                  ))}
              </div>
            </div>
            <div className="scrollbar-thin grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
              {active.map((e) => (
                <button
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${picked.includes(e.id) ? "border-navy bg-navy/5" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <Avatar appearance={e.appearance} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-slate-800">{e.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{e.title}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={() => setUI({ dialog: null })}>
            Cancel
          </Button>
          <Button onClick={go} disabled={!topic.trim() || !picked.length}>
            <Users /> Start meeting
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const KIND_META: Record<MeetingItem["kind"], { label: string; icon: React.ReactNode; cls: string }> = {
  note: { label: "Note", icon: <StickyNote className="h-3.5 w-3.5" />, cls: "text-slate-600" },
  decision: { label: "Decision", icon: <Gavel className="h-3.5 w-3.5" />, cls: "text-emerald-700" },
  action: { label: "Action", icon: <CheckSquare className="h-3.5 w-3.5" />, cls: "text-sky-700" },
};

export function MeetingPanel() {
  const meeting = useOffice((s) => s.meetings.find((m) => m.status === "in_progress"));
  const employees = useOffice((s) => s.employees);
  const addItem = useOffice((s) => s.addMeetingItem);
  const removeItem = useOffice((s) => s.removeMeetingItem);
  const end = useOffice((s) => s.endMeeting);
  const toast = useUI((s) => s.toast);
  const [kind, setKind] = useState<MeetingItem["kind"]>("note");
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [seated, setSeated] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!meeting) return;
    const t = setInterval(() => {
      const sim = getSim();
      setSeated(meeting.attendeeIds.filter((id) => sim.agents.get(id)?.pose === "sit" && sim.seat(sim.agents.get(id)?.seatId)?.kind === "meeting").length);
    }, 400);
    return () => clearInterval(t);
  }, [meeting]);

  if (!meeting) return null;
  const attendees = employees.filter((e) => meeting.attendeeIds.includes(e.id));
  const allSeated = seated >= attendees.length;

  const submit = () => {
    const r = addItem(meeting.id, { kind, text, assigneeId: kind === "action" ? assignee || null : null });
    if (!r.ok) return toast("error", r.error);
    if (kind === "action") toast("success", "Action item assigned and saved as a task");
    setText("");
  };

  return (
    <div className="anim-up pointer-events-auto absolute bottom-3 left-1/2 z-30 w-[min(640px,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-panel/95 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3 bg-navy px-4 py-2.5 text-white">
        <button className="min-w-0 text-left" onClick={() => setCollapsed((c) => !c)}>
          <div className="text-[10px] uppercase tracking-widest text-sky-200">Meeting in progress</div>
          <div className="truncate text-sm font-semibold">{meeting.topic}</div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-sky-100">
            {!allSeated && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {seated}/{attendees.length} seated
          </span>
          <Button
            size="sm"
            variant="gold"
            onClick={() => {
              const r = end(meeting.id);
              if (!r.ok) return toast("error", r.error);
              getSim().endMeeting(meeting.attendeeIds, CEO_ID);
              toast("success", "Meeting ended — summary saved to the dashboard");
            }}
          >
            End meeting
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div className="space-y-3 p-4">
          <div className="flex -space-x-1.5">
            {attendees.map((e) => (
              <span key={e.id} title={`${e.name} — ${e.title}`}>
                <Avatar appearance={e.appearance} size={26} ring="#fff" />
              </span>
            ))}
          </div>
          <div className="scrollbar-thin max-h-40 space-y-1 overflow-y-auto">
            {meeting.items.length ? (
              meeting.items.map((i) => (
                <div key={i.id} className="group flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 flex items-center gap-1 font-semibold ${KIND_META[i.kind].cls}`}>{KIND_META[i.kind].icon}</span>
                  <span className="flex-1 text-slate-700">
                    {i.text}
                    {i.assigneeId && <span className="text-slate-400"> → {employees.find((e) => e.id === i.assigneeId)?.name}</span>}
                  </span>
                  {i.kind !== "action" && (
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => removeItem(meeting.id, i.id)} aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-600" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">Record notes, decisions and action items. They form the saved meeting summary.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Select className="w-28" value={kind} onChange={(e) => setKind(e.target.value as MeetingItem["kind"])}>
              <option value="note">Note</option>
              <option value="decision">Decision</option>
              <option value="action">Action item</option>
            </Select>
            {kind === "action" && (
              <Select className="w-40" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Assign to…</option>
                {attendees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            )}
            <Input
              className="min-w-40 flex-1"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={kind === "action" ? "What needs to be done?" : kind === "decision" ? "What was decided?" : "Add a note"}
              maxLength={300}
            />
            <Button onClick={submit} disabled={!text.trim()}>
              Add
            </Button>
          </div>
          <p className="text-[11px] text-slate-400">Asking employees questions and receiving AI department reports arrives with the AI engine in Phase 2.</p>
        </div>
      )}
    </div>
  );
}
