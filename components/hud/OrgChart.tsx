"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { STATUS_META, type Employee } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Avatar } from "./Avatar";

const HEAD = /\b(manager|director|head|lead|chief|coordinator)\b/i;
const SHARED = "#475569";

/** Person card: photo (or drawn portrait), name, title and a status dot. Click opens their profile. */
function Person({ e, accent, head }: { e: Employee; accent: string; head?: boolean }) {
  const set = useUI((s) => s.set);
  return (
    <button
      onClick={() => set({ dialog: null, selectedEmployeeId: e.id })}
      className={`relative flex w-full items-center gap-2 rounded-xl border bg-panel p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${head ? "border-2" : "border-slate-200"}`}
      style={head ? { borderColor: accent } : undefined}
      title={`Open ${e.name}'s profile`}
    >
      <Avatar id={e.id} appearance={e.appearance} size={head ? 44 : 36} ring={accent} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-slate-900">{e.name}</div>
        <div className="truncate text-[11px] text-slate-500">{e.title}</div>
      </div>
      <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: STATUS_META[e.status].color }} title={STATUS_META[e.status].label} />
    </button>
  );
}

/** Organisation chart: CEO → executive office → each company and the shared teams, with photos. */
export function OrgChart() {
  const employees = useOffice((s) => s.employees);
  const departments = useOffice((s) => s.departments);
  const companies = useOffice((s) => s.companies);
  const ceoName = useOffice((s) => s.settings.ceoName);
  const ceoPhoto = useOffice((s) => s.settings.staffPhotos?.ceo);

  const { exec, branches } = useMemo(() => {
    const active = employees.filter((e) => e.active);
    const byDept = (deptId: string) => {
      const list = active.filter((e) => e.departmentId === deptId);
      const head = list.find((e) => HEAD.test(e.title)) ?? list[0];
      return { head, team: list.filter((e) => e !== head) };
    };
    const execDept = departments.find((d) => d.id === "dept-exec");
    const exec = execDept ? active.filter((e) => e.departmentId === execDept.id) : [];
    const groups = [
      ...companies
        .filter((c) => c.active)
        .map((c) => ({ key: c.id, name: c.name, color: c.color, depts: departments.filter((d) => d.active && d.companyId === c.id) })),
      { key: "shared", name: "Shared services", color: SHARED, depts: departments.filter((d) => d.active && !d.companyId && d.id !== "dept-exec") },
    ];
    const branches = groups
      .map((g) => ({ ...g, units: g.depts.map((d) => ({ dept: d, ...byDept(d.id) })).filter((u) => u.head) }))
      .filter((g) => g.units.length);
    return { exec, branches };
  }, [employees, departments, companies]);

  const total = employees.filter((e) => e.active).length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <p className="text-xs text-slate-500">
          {total} people across {branches.length} groups. Photos come from each profile (tap a portrait to add one). Tap anyone to open their profile.
        </p>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
      </div>
      <div id="ov-orgchart" className="overflow-x-auto rounded-2xl border border-slate-200 bg-panel p-5">
        <div className="mx-auto flex min-w-max flex-col items-center">
          {/* CEO */}
          <div className="flex w-64 items-center gap-3 rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-panel p-3 shadow-md">
            {ceoPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ceoPhoto} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-400" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-2xl ring-2 ring-amber-400">👑</span>
            )}
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-slate-900">{ceoName || "CEO"}</div>
              <div className="text-xs font-medium text-amber-700">Chief Executive Officer</div>
            </div>
          </div>
          <div className="h-5 w-0.5 bg-slate-300" />
          {/* executive office */}
          {exec.length > 0 && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">Executive office</div>
                <div className="flex gap-2">
                  {exec.map((e) => (
                    <div key={e.id} className="w-56">
                      <Person e={e} accent="#d4a017" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-5 w-0.5 bg-slate-300" />
            </>
          )}
          {/* branches */}
          <div className="flex items-start">
            {branches.map((g, i) => (
              <div key={g.key} className="relative flex flex-col items-center px-3 pt-5">
                {/* connector: horizontal bar across the branches, stub down into each */}
                <span className="absolute top-0 h-0.5 bg-slate-300" style={{ left: i === 0 ? "50%" : 0, right: i === branches.length - 1 ? "50%" : 0 }} />
                <span className="absolute left-1/2 top-0 h-5 w-0.5 -translate-x-1/2 bg-slate-300" />
                <div className="mb-2 rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm" style={{ background: g.color }}>
                  {g.name}
                </div>
                <div className="flex flex-col gap-3">
                  {g.units.map((u) => (
                    <div key={u.dept.id} className="w-60 rounded-2xl border-t-4 bg-slate-50 p-2" style={{ borderTopColor: g.color }}>
                      <div className="mb-1.5 text-[11px] font-semibold text-slate-600">{u.dept.name}</div>
                      <Person e={u.head!} accent={g.color} head />
                      {u.team.length > 0 && (
                        <div className="ml-4 mt-1.5 space-y-1.5 border-l-2 pl-2.5" style={{ borderColor: `${g.color}55` }}>
                          {u.team.map((e) => (
                            <Person key={e.id} e={e} accent={g.color} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
