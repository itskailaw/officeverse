"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import type { Department } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function InlineEdit({ value, onSave, className }: { value: string; onSave: (v: string) => boolean; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing)
    return (
      <span className={`group inline-flex items-center gap-1.5 ${className ?? ""}`}>
        {value}
        <button onClick={() => (setV(value), setEditing(true))} className="text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-slate-600" aria-label="Rename">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Input
        autoFocus
        value={v}
        maxLength={80}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSave(v)) setEditing(false);
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-56"
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(v) && setEditing(false)} aria-label="Save">
        <Check />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)} aria-label="Cancel">
        <X />
      </Button>
    </span>
  );
}

/** Two-step confirmation for destructive actions. */
function ConfirmDelete({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="destructive" onClick={() => (onConfirm(), setArmed(false))}>
        Delete {label}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => setArmed(true)} aria-label={`Delete ${label}`}>
      <Trash2 />
    </Button>
  );
}

function DeptRow({ d }: { d: Department }) {
  const s = useOffice();
  const toast = useUI((u) => u.toast);
  const count = s.employees.filter((e) => e.active && e.departmentId === d.id).length;
  const run = (r: { ok: boolean; error?: string }) => {
    if (!r.ok) toast("error", r.error ?? "Failed");
    return r.ok;
  };
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-panel px-3 py-2">
      <div className="min-w-0">
        <InlineEdit value={d.name} className="text-sm font-medium text-slate-800" onSave={(v) => run(s.updateDepartment(d.id, { name: v }))} />
        <div className="text-[11px] text-slate-500">
          {count} employee(s) · {d.description}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] text-slate-500">{d.active ? "Active" : "Inactive"}</span>
        <Switch checked={d.active} onCheckedChange={(v) => run(s.updateDepartment(d.id, { active: v }))} aria-label="Active" />
        <ConfirmDelete label="department" onConfirm={() => run(s.deleteDepartment(d.id)) && toast("success", `${d.name} deleted`)} />
      </div>
    </div>
  );
}

function AddDept({ companyId }: { companyId: string | null }) {
  const add = useOffice((s) => s.addDepartment);
  const toast = useUI((u) => u.toast);
  const [name, setName] = useState("");
  return (
    <div className="flex gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department name" maxLength={80} className="h-8" />
      <Button
        size="sm"
        variant="outline"
        disabled={!name.trim()}
        onClick={() => {
          const r = add({ name, description: "", companyId });
          if (!r.ok) return toast("error", r.error);
          setName("");
          toast("success", "Department created");
        }}
      >
        <Plus /> Add
      </Button>
    </div>
  );
}

export function CompaniesManager() {
  const s = useOffice();
  const toast = useUI((u) => u.toast);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0ea5e9");
  const run = (r: { ok: boolean; error?: string }) => {
    if (!r.ok) toast("error", r.error ?? "Failed");
    return r.ok;
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-4">
          <div className="min-w-60 flex-1">
            <div className="mb-1 text-xs font-medium text-slate-600">New company</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" maxLength={80} />
          </div>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-slate-200" aria-label="Brand colour" />
          <Button
            disabled={!name.trim()}
            onClick={() => {
              if (run(s.addCompany({ name, description: "", color }))) {
                setName("");
                toast("success", "Company created");
              }
            }}
          >
            <Plus /> Create company
          </Button>
        </CardContent>
      </Card>

      {s.companies.map((c) => (
        <Card key={c.id} className={c.active ? "" : "opacity-70"}>
          <CardHeader>
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="color"
                value={c.color}
                onChange={(e) => s.updateCompany(c.id, { color: e.target.value })}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label="Brand colour"
              />
              <div className="min-w-0">
                <InlineEdit value={c.name} className="text-sm font-semibold text-slate-900" onSave={(v) => run(s.updateCompany(c.id, { name: v }))} />
                <p className="truncate text-[11px] text-slate-500">{c.description}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!c.active && <Badge variant="secondary">Deactivated</Badge>}
              <Switch checked={c.active} onCheckedChange={(v) => run(s.updateCompany(c.id, { active: v }))} aria-label="Active" />
              <ConfirmDelete label="company" onConfirm={() => run(s.deleteCompany(c.id)) && toast("success", `${c.name} deleted`)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.departments
              .filter((d) => d.companyId === c.id)
              .map((d) => (
                <DeptRow key={d.id} d={d} />
              ))}
            <AddDept companyId={c.id} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <div>
            <div className="text-sm font-semibold text-slate-900">Shared service departments</div>
            <p className="text-[11px] text-slate-500">Serve every company (finance, marketing, IT, executive office).</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {s.departments
            .filter((d) => d.companyId === null)
            .map((d) => (
              <DeptRow key={d.id} d={d} />
            ))}
          <AddDept companyId={null} />
        </CardContent>
      </Card>
    </div>
  );
}
