"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { STATUS_META, type Employee } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Avatar } from "./Avatar";

// The chart is a light "document" in both day and night mode (and in print), so colours are fixed here.
const INK = "#0f172a";
const SUB = "#64748b";
const LINE = "#cbd5e1";
const SHARED = "#475569";

/** How senior a title sounds — picks the lead of each team. */
function seniority(title: string) {
  const t = title.toLowerCase();
  if (/\b(chief|director|head)\b/.test(t)) return 5;
  if (/\b(operations|general) manager\b/.test(t)) return 4;
  if (/\bmanager\b/.test(t)) return 3;
  if (/\b(lead|senior)\b/.test(t)) return 2;
  if (/\b(coordinator|supervisor)\b/.test(t)) return 1;
  return 0;
}

function Card({ e, accent, lead, delay = 0 }: { e: Employee; accent: string; lead?: boolean; delay?: number }) {
  const set = useUI((s) => s.set);
  return (
    <button
      onClick={() => set({ dialog: null, selectedEmployeeId: e.id })}
      className="org-card relative flex w-full items-center gap-2.5 rounded-2xl bg-white text-left transition hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        padding: lead ? "10px 12px" : "8px 10px",
        border: `1px solid ${lead ? accent : "#e2e8f0"}`,
        boxShadow: lead ? `0 6px 16px ${accent}33` : "0 2px 6px rgba(15,23,42,0.06)",
        animation: `ov-pop .45s ${delay}s cubic-bezier(.3,1.4,.5,1) both`,
      }}
      title={`Open ${e.name}'s profile`}
    >
      {lead && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: accent }} />}
      <Avatar id={e.id} appearance={e.appearance} size={lead ? 46 : 38} ring={accent} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold" style={{ color: INK, fontSize: lead ? 14 : 13 }}>
          {e.name}
        </div>
        <div className="truncate text-[11px]" style={{ color: SUB }}>
          {e.title}
        </div>
      </div>
      <span className="org-dot h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_META[e.status].color }} title={STATUS_META[e.status].label} />
    </button>
  );
}

/** A team: department name, its lead, and members hanging off a tree line. */
function Team({ name, lead, members, accent, delay = 0 }: { name: string; lead: Employee; members: Employee[]; accent: string; delay?: number }) {
  return (
    <div className="w-[250px]">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: accent }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        {name}
      </div>
      <Card e={lead} accent={accent} lead delay={delay} />
      {members.length > 0 && (
        <div className="relative ml-5 mt-1 pl-4">
          {/* vertical spine */}
          <span className="absolute left-0 top-0 w-0.5 origin-top" style={{ background: `${accent}66`, bottom: 22, animation: `ov-line-y .5s ${delay + 0.2}s ease-out both` }} />
          {members.map((e, i) => (
            <div key={e.id} className="relative pt-2">
              {/* tick from the spine */}
              <span className="absolute -left-4 top-[30px] h-0.5 w-4 origin-left" style={{ background: `${accent}66`, animation: `ov-line-x .25s ${delay + 0.35 + i * 0.08}s ease-out both` }} />
              <Card e={e} accent={accent} delay={delay + 0.4 + i * 0.08} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Organisation chart: CEO → executive office → each company and the shared teams, with photos. */
export function OrgChart() {
  const employees = useOffice((s) => s.employees);
  const departments = useOffice((s) => s.departments);
  const companies = useOffice((s) => s.companies);
  const ceoName = useOffice((s) => s.settings.ceoName);
  const ceoPhoto = useOffice((s) => s.settings.staffPhotos?.ceo);

  const { exec, branches, total } = useMemo(() => {
    const active = employees.filter((e) => e.active);
    const team = (deptId: string) => {
      const list = active.filter((e) => e.departmentId === deptId);
      const lead = [...list].sort((a, b) => seniority(b.title) - seniority(a.title))[0];
      return { lead, members: list.filter((e) => e !== lead) };
    };
    const exec = active.filter((e) => e.departmentId === "dept-exec");
    const groups = [
      ...companies.filter((c) => c.active).map((c) => ({ key: c.id, name: c.name, color: c.color, depts: departments.filter((d) => d.active && d.companyId === c.id) })),
      { key: "shared", name: "Shared services", color: SHARED, depts: departments.filter((d) => d.active && !d.companyId && d.id !== "dept-exec") },
    ];
    const branches = groups
      .map((g) => ({ ...g, teams: g.depts.map((d) => ({ dept: d, ...team(d.id) })).filter((t) => t.lead) }))
      .filter((g) => g.teams.length);
    return { exec, branches, total: active.length };
  }, [employees, departments, companies]);

  const today = new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <p className="text-xs text-slate-500">Tap anyone to open their profile (tap the portrait there to add a photo). Updates automatically.</p>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
      </div>
      <div id="ov-orgchart" className="overflow-x-auto rounded-3xl p-8" style={{ background: "linear-gradient(180deg,#f8fafc,#eef2f7)", color: INK }}>
        <div className="mx-auto flex min-w-max flex-col items-center">
          {/* title */}
          <div className="mb-6 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: SUB }}>
              Organisation chart
            </div>
            <div className="text-2xl font-extrabold" style={{ color: INK }}>
              Our Team
            </div>
            <div className="text-xs" style={{ color: SUB }}>
              {total} people · as of {today}
            </div>
          </div>

          {/* CEO */}
          <div className="flex items-center gap-3 rounded-3xl bg-white px-5 py-3" style={{ border: "2px solid #f59e0b", boxShadow: "0 10px 24px rgba(245,158,11,0.25)", animation: "ov-pop .5s cubic-bezier(.3,1.4,.5,1) both" }}>
            {ceoPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ceoPhoto} alt="" className="h-16 w-16 rounded-full object-cover" style={{ boxShadow: "0 0 0 3px #f59e0b" }} />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full text-3xl" style={{ background: "#fef3c7", boxShadow: "0 0 0 3px #f59e0b" }}>
                👑
              </span>
            )}
            <div>
              <div className="text-lg font-extrabold" style={{ color: INK }}>
                {ceoName || "CEO"}
              </div>
              <div className="text-xs font-semibold" style={{ color: "#b45309" }}>
                Chief Executive Officer
              </div>
            </div>
          </div>
          <span className="h-6 w-0.5 origin-top" style={{ background: LINE, animation: "ov-line-y .3s .3s ease-out both" }} />

          {/* executive office */}
          {exec.length > 0 && (
            <>
              <div className="rounded-3xl bg-white/70 px-4 pb-3 pt-2" style={{ border: "1px dashed #d4a017", animation: "ov-rise .4s .45s both" }}>
                <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#b45309" }}>
                  Executive office
                </div>
                <div className="flex gap-3">
                  {exec.map((e, i) => (
                    <div key={e.id} className="w-[250px]">
                      <Card e={e} accent="#d4a017" delay={0.5 + i * 0.08} />
                    </div>
                  ))}
                </div>
              </div>
              <span className="h-6 w-0.5 origin-top" style={{ background: LINE, animation: "ov-line-y .3s .7s ease-out both" }} />
            </>
          )}

          {/* branches */}
          <div className="flex items-start">
            {branches.map((g, i) => (
              <div key={g.key} className="relative flex flex-col items-center px-4 pt-6">
                <span className="absolute top-0 h-0.5" style={{ background: LINE, left: i === 0 ? "50%" : 0, right: i === branches.length - 1 ? "50%" : 0, animation: "ov-line-x .5s .85s ease-out both" }} />
                <span className="absolute left-1/2 top-0 h-6 w-0.5 -translate-x-1/2 origin-top" style={{ background: LINE, animation: `ov-line-y .3s ${1.1 + i * 0.08}s ease-out both` }} />
                <div className="mb-4 rounded-full px-4 py-1.5 text-xs font-bold text-white" style={{ background: g.color, boxShadow: `0 4px 12px ${g.color}55`, animation: `ov-pop .45s ${1.25 + i * 0.08}s cubic-bezier(.3,1.4,.5,1) both` }}>
                  {g.name}
                </div>
                {/* shared services: teams side by side; companies: stacked */}
                <div className={g.key === "shared" ? "flex items-start gap-5" : "flex flex-col gap-5"}>
                  {g.teams.map((t, j) => (
                    <Team key={t.dept.id} name={t.dept.name} lead={t.lead!} members={t.members} accent={g.color} delay={1.45 + i * 0.08 + j * 0.12} />
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
