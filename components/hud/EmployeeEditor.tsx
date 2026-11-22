"use client";

import { useEffect, useMemo, useState } from "react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import type { Appearance, Employee, HairStyle, Outfit, Permission } from "@/lib/data/types";
import { seatsFor } from "@/lib/office/catalog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Avatar } from "./Avatar";

const ALL_PERMS: Permission[] = [
  "orders:read",
  "ads:read",
  "inventory:read",
  "customers:read",
  "listings:read",
  "suppliers:read",
  "finance:read",
  "projects:read",
  "files:read",
  "audit:read",
  "integrations:read",
  "reports:write",
  "drafts:write",
];
const SKINS = ["#f5d0b5", "#f1c9a5", "#e8b896", "#d29b6c", "#a8714a", "#7a4e2d"];
const HAIRS: HairStyle[] = ["short", "buzz", "spiky", "curly", "long", "bob", "bun", "ponytail", "hijab"];
const OUTFITS: { v: Outfit; label: string }[] = [
  { v: "shirt", label: "Shirt" },
  { v: "polo", label: "Polo" },
  { v: "blazer", label: "Blazer" },
  { v: "hoodie", label: "Hoodie" },
  { v: "kurung", label: "Baju kurung" },
  { v: "dress", label: "Dress" },
];

export function blankEmployee(): Omit<Employee, "id" | "createdAt" | "status" | "active"> {
  return {
    name: "",
    gender: "unspecified",
    appearance: { skin: SKINS[2], hair: "#111827", hairStyle: "short", shirt: "#1e3a5f", pants: "#1e293b", shoes: "#111827", outfit: "shirt" },
    departmentId: "dept-amare",
    companyId: "co-amare",
    title: "",
    personality: "",
    responsibilities: [],
    workstationId: null,
    workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    ai: { provider: "anthropic", model: "default", temperature: 0.3, maxTokensPerTask: 16000 },
    permissions: ["reports:write"],
    reportingSchedule: "On request",
  };
}

export function AppearanceEditor({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-4">
      <Avatar appearance={value} size={88} />
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Skin tone</Label>
          <div className="flex gap-1.5">
            {SKINS.map((s) => (
              <button
                key={s}
                onClick={() => set({ skin: s })}
                className={`h-6 w-6 rounded-full border-2 ${value.skin === s ? "border-navy" : "border-white shadow"}`}
                style={{ background: s }}
                aria-label={`Skin ${s}`}
              />
            ))}
          </div>
        </div>
        <div>
          <Label>Hair style</Label>
          <Select value={value.hairStyle} onChange={(e) => set({ hairStyle: e.target.value as HairStyle })}>
            {HAIRS.map((h) => (
              <option key={h} value={h}>
                {h === "hijab" ? "Hijab / headscarf" : h[0].toUpperCase() + h.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Outfit</Label>
          <Select value={value.outfit ?? "shirt"} onChange={(e) => set({ outfit: e.target.value as Outfit })}>
            {OUTFITS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <ColorField label={value.hairStyle === "hijab" ? "Scarf colour" : "Hair colour"} value={value.hair} onChange={(v) => set({ hair: v })} />
        <ColorField label="Top" value={value.shirt} onChange={(v) => set({ shirt: v })} />
        <ColorField label="Trousers" value={value.pants} onChange={(v) => set({ pants: v })} />
        <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={!!value.glasses} onChange={(e) => set({ glasses: e.target.checked })} /> Glasses
        </label>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" />
        <span className="font-mono text-[11px] text-slate-500">{value}</span>
      </div>
    </div>
  );
}

export function EmployeeEditor() {
  const dialog = useUI((s) => s.dialog);
  const editId = useUI((s) => s.editEmployeeId);
  const setUI = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const employees = useOffice((s) => s.employees);
  const departments = useOffice((s) => s.departments);
  const furniture = useOffice((s) => s.furniture);
  const hire = useOffice((s) => s.hireEmployee);
  const update = useOffice((s) => s.updateEmployee);
  const assignWs = useOffice((s) => s.assignWorkstation);

  const open = dialog === "hire" || dialog === "edit-employee";
  const editing = dialog === "edit-employee" ? employees.find((e) => e.id === editId) : undefined;
  const [form, setForm] = useState(blankEmployee());
  const [respText, setRespText] = useState("");
  const [dates, setDates] = useState<{ birthday?: string; joinedOn?: string }>({});
  const saveDates = (id: string) => {
    const s = useOffice.getState();
    const all = s.settings.staffDates ?? {};
    const cur = all[id] ?? {};
    if (cur.birthday === dates.birthday && cur.joinedOn === dates.joinedOn) return;
    s.updateSettings({ staffDates: { ...all, [id]: { birthday: dates.birthday, joinedOn: dates.joinedOn } } });
  };

  useEffect(() => {
    if (!open) return;
    const base = editing ? { ...editing } : blankEmployee();
    setForm(base);
    setRespText(base.responsibilities.join("\n"));
    setDates((editing && useOffice.getState().settings.staffDates?.[editing.id]) || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId]);

  const workstations = useMemo(() => {
    const taken = new Set(employees.filter((e) => e.active && e.id !== editing?.id && e.workstationId).map((e) => e.workstationId));
    return furniture
      .flatMap(seatsFor)
      .filter((s) => s.kind === "workstation" && !taken.has(s.id))
      .map((s) => ({ id: s.id, room: s.roomId }));
  }, [furniture, employees, editing?.id]);

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const save = () => {
    const responsibilities = respText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    const dept = departments.find((d) => d.id === form.departmentId);
    const data = { ...form, responsibilities, companyId: dept?.companyId ?? null };
    if (editing) {
      const { workstationId, ...rest } = data;
      const r = update(editing.id, rest);
      if (!r.ok) return toast("error", r.error);
      if (workstationId !== editing.workstationId) {
        const w = assignWs(editing.id, workstationId);
        if (!w.ok) return toast("error", w.error);
      }
      saveDates(editing.id);
      toast("success", `${data.name} updated`);
      setUI({ dialog: null, editEmployeeId: null });
    } else {
      const r = hire(data);
      if (!r.ok) return toast("error", r.error);
      if (r.id) saveDates(r.id);
      toast("success", `${data.name} hired — walking to their desk`);
      setUI({ dialog: null, selectedEmployeeId: r.id ?? null });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setUI({ dialog: null, editEmployeeId: null })}>
      <DialogContent
        title={editing ? `Edit ${editing.name}` : "Hire an AI employee"}
        description="Configure identity, role, workstation, AI model and data permissions."
        className="max-w-2xl"
      >
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} maxLength={60} placeholder="e.g. Nadia Rahim" />
            </div>
            <div>
              <Label>Job title</Label>
              <Input value={form.title} onChange={(e) => patch({ title: e.target.value })} maxLength={80} placeholder="e.g. Translation Project Manager" />
            </div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onChange={(e) => patch({ gender: e.target.value as Employee["gender"] })}>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="unspecified">Unspecified</option>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.departmentId} onChange={(e) => patch({ departmentId: e.target.value })}>
                {departments
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <Label>Workstation</Label>
              <Select value={form.workstationId ?? ""} onChange={(e) => patch({ workstationId: e.target.value || null })}>
                <option value="">Unassigned (hot-desk in lounge)</option>
                {workstations.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} · {w.room}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Starts</Label>
                <Input type="time" value={form.workingHours.start} onChange={(e) => patch({ workingHours: { ...form.workingHours, start: e.target.value } })} />
              </div>
              <div>
                <Label>Ends</Label>
                <Input type="time" value={form.workingHours.end} onChange={(e) => patch({ workingHours: { ...form.workingHours, end: e.target.value } })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Birthday</Label>
                <Input
                  type="date"
                  value={dates.birthday ? `2000-${dates.birthday}` : ""}
                  onChange={(e) => setDates((d) => ({ ...d, birthday: e.target.value ? e.target.value.slice(5) : undefined }))}
                  title="Only the day and month are used — cake and balloons at their desk"
                />
              </div>
              <div>
                <Label>Joined on</Label>
                <Input type="date" value={dates.joinedOn ?? ""} onChange={(e) => setDates((d) => ({ ...d, joinedOn: e.target.value || undefined }))} title="For work anniversaries" />
              </div>
            </div>
          </div>

          <AppearanceEditor value={form.appearance} onChange={(appearance) => patch({ appearance })} />

          <div>
            <Label>Personality</Label>
            <Textarea value={form.personality} onChange={(e) => patch({ personality: e.target.value })} maxLength={500} placeholder="Tone, working style, how they report…" />
          </div>
          <div>
            <Label>Responsibilities (one per line)</Label>
            <Textarea value={respText} onChange={(e) => setRespText(e.target.value)} className="min-h-[96px]" maxLength={4000} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>AI provider</Label>
              <Select value={form.ai.provider} onChange={(e) => patch({ ai: { ...form.ai, provider: e.target.value as Employee["ai"]["provider"] } })}>
                <option value="anthropic">Anthropic</option>
                <option value="openai" disabled>OpenAI (not supported yet)</option>
                <option value="none">None</option>
              </Select>
            </div>
            <div>
              <Label>Model</Label>
              <Select value={form.ai.model} onChange={(e) => patch({ ai: { ...form.ai, model: e.target.value } })}>
                <option value="default">Default (Claude Opus 5.5)</option>
                <option value="claude-opus-5-5">Claude Opus 5.5 — most capable</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 — balanced, ~half the cost</option>
                <option value="claude-haiku-5-5">Claude Haiku 5.5 — fastest, cheapest</option>
              </Select>
            </div>
            <div>
              <Label>Reporting schedule</Label>
              <Input value={form.reportingSchedule} onChange={(e) => patch({ reportingSchedule: e.target.value })} maxLength={80} />
            </div>
          </div>
          <div>
            <Label>Data access permissions</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_PERMS.map((p) => {
                const on = form.permissions.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => patch({ permissions: on ? form.permissions.filter((x) => x !== p) : [...form.permissions, p] })}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${on ? "border-navy bg-navy text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Read-only by default. Write access is limited to drafts and reports — external actions always require your approval.</p>
          </div>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-panel px-5 py-3">
          <Button variant="ghost" onClick={() => setUI({ dialog: null, editEmployeeId: null })}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!form.name.trim() || !form.title.trim()}>
            {editing ? "Save changes" : "Hire employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
