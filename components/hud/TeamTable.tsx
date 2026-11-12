"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "./Avatar";
import { StatusBadge } from "./EmployeePanel";

export function TeamTable() {
  const employees = useOffice((s) => s.employees);
  const departments = useOffice((s) => s.departments);
  const companies = useOffice((s) => s.companies);
  const setActive = useOffice((s) => s.setEmployeeActive);
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [showInactive, setShowInactive] = useState(false);

  const list = employees.filter(
    (e) =>
      (showInactive || e.active) &&
      (dept === "all" || e.departmentId === dept) &&
      (!q || `${e.name} ${e.title}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or role" className="w-56" />
        <Select className="w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show deactivated
        </label>
        <Button className="ml-auto" onClick={() => set({ dialog: "hire" })}>
          <UserPlus /> Hire AI employee
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Desk</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const co = companies.find((c) => c.id === e.companyId);
              return (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <button className="flex items-center gap-2 text-left" onClick={() => e.active && set({ dialog: null, selectedEmployeeId: e.id })}>
                      <Avatar appearance={e.appearance} size={28} />
                      <span>
                        <span className="block font-medium text-slate-800">{e.name}</span>
                        <span className="block text-slate-500">{e.title}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{departments.find((d) => d.id === e.departmentId)?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{co ? co.name : <span className="text-slate-400">Shared</span>}</td>
                  <td className="px-3 py-2">{e.active ? <StatusBadge status={e.status} /> : <Badge variant="secondary">Deactivated</Badge>}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{e.workstationId ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => set({ dialog: "edit-employee", editEmployeeId: e.id })}>
                        <Pencil /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={e.active ? "text-red-600 hover:text-red-700" : ""}
                        disabled={e.status === "in_meeting"}
                        onClick={() => {
                          const r = setActive(e.id, !e.active);
                          if (!r.ok) toast("error", r.error);
                          else toast("success", `${e.name} ${e.active ? "deactivated" : "reactivated"}`);
                        }}
                      >
                        {e.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
