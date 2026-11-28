"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Plus, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { EmptyState, useSlider } from "@/components/ui/motion";
import {
  amareSummary,
  artidesSummary,
  importRows,
  jobAmount,
  JOB_LABEL,
  JOB_STATUSES,
  parseCsv,
  PROJECT_STAGES,
  QUOTE_STATUSES,
  STAGE_LABEL,
  type AmareJob,
  type ArtProject,
  type ArtQuote,
  type ImportKind,
  type JobStatus,
  type ProjectStage,
  type QuoteStatus,
} from "@/lib/data/business";
import { cn } from "@/lib/utils";

type Tab = "projects" | "quotes" | "jobs";
const klDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const RM = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const uid = () => Math.random().toString(36).slice(2, 10);
const inp = "h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-xs text-slate-800 hover:border-slate-200 focus:border-slate-300 focus:bg-panel focus:outline-none";
const STAGE_TONE: Record<ProjectStage, string> = {
  measure: "bg-slate-100 text-slate-700",
  design: "bg-indigo-50 text-indigo-700",
  quoted: "bg-amber-50 text-amber-800",
  confirmed: "bg-sky-50 text-sky-700",
  production: "bg-orange-50 text-orange-700",
  installation: "bg-purple-50 text-purple-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-400",
};
const JOB_TONE: Record<JobStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  translating: "bg-sky-50 text-sky-700",
  qa: "bg-amber-50 text-amber-800",
  delivered: "bg-emerald-50 text-emerald-700",
  invoiced: "bg-indigo-50 text-indigo-700",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-400",
};

/** Open the tracker on a tab. */
export function openTracker(tab: Tab) {
  try {
    sessionStorage.setItem("ov:tracker-tab", tab);
  } catch {}
  useUI.getState().set({ dialog: "business" });
}

/** Artides Home projects & quotations, and Amare Localization jobs — the real data behind their dashboard cards. */
export function BusinessTracker() {
  const open = useUI((s) => s.dialog === "business");
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const artides = useOffice((s) => s.settings.artides);
  const amare = useOffice((s) => s.settings.amare);
  const update = useOffice((s) => s.updateSettings);
  const [tab, setTab] = useState<Tab>("projects");
  const slider = useSlider<HTMLDivElement>(tab);
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ kind: ImportKind; records: (ArtProject | ArtQuote | AmareJob)[]; skipped: number; dupes: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    try {
      const t = sessionStorage.getItem("ov:tracker-tab") as Tab | null;
      if (t) setTab(t);
      sessionStorage.removeItem("ov:tracker-tab");
    } catch {}
  }, [open]);

  const today = klDay();
  const projects = useMemo(() => artides?.projects ?? [], [artides]);
  const quotes = useMemo(() => artides?.quotes ?? [], [artides]);
  const jobs = useMemo(() => amare?.jobs ?? [], [amare]);
  const as = useMemo(() => artidesSummary(artides, today), [artides, today]);
  const ms = useMemo(() => amareSummary(amare, today), [amare, today]);

  const saveProjects = (p: ArtProject[]) => update({ artides: { projects: p, quotes } });
  const saveQuotes = (x: ArtQuote[]) => update({ artides: { projects, quotes: x } });
  const saveJobs = (j: AmareJob[]) => update({ amare: { jobs: j } });
  const now = () => new Date().toISOString();
  const patchProject = (id: string, p: Partial<ArtProject>) => saveProjects(projects.map((x) => (x.id === id ? { ...x, ...p, updatedAt: now() } : x)));
  const patchQuote = (id: string, p: Partial<ArtQuote>) => saveQuotes(quotes.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const patchJob = (id: string, p: Partial<AmareJob>) =>
    saveJobs(jobs.map((x) => (x.id === id ? { ...x, ...p, ...(p.status && ["delivered", "invoiced", "paid"].includes(p.status) && !x.deliveredAt ? { deliveredAt: today } : {}) } : x)));

  const add = () => {
    if (tab === "projects") {
      const p: ArtProject = { id: `pj-${uid()}`, client: "", value: 0, paid: 0, stage: "measure", createdAt: now(), updatedAt: now() };
      saveProjects([p, ...projects]);
      setExpanded(p.id);
    } else if (tab === "quotes") saveQuotes([{ id: `qt-${uid()}`, client: "", title: "", amount: 0, status: "draft", createdAt: now() }, ...quotes]);
    else saveJobs([{ id: `jb-${uid()}`, client: "", title: "", source: "EN", target: "ZH", words: 0, rate: 0.12, status: "new", createdAt: now() }, ...jobs]);
    setShowDone(false);
  };
  const remove = (id: string) => {
    if (tab === "projects") saveProjects(projects.filter((x) => x.id !== id));
    else if (tab === "quotes") saveQuotes(quotes.filter((x) => x.id !== id));
    else saveJobs(jobs.filter((x) => x.id !== id));
    setConfirmDel(null);
  };

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) return toast("error", "Save the sheet as CSV first (Excel/Google Sheets: File → Download / Save as → CSV), then import it.");
    const kind: ImportKind = tab;
    const r = importRows(kind, parseCsv(await f.text()));
    const key = (x: { client: string } & Record<string, unknown>) => `${x.client.toLowerCase()}|${String(x.title ?? x.type ?? "").toLowerCase()}|${x.value ?? x.amount ?? x.words ?? ""}`;
    const existing = new Set((kind === "projects" ? projects : kind === "quotes" ? quotes : jobs).map((x) => key(x as never)));
    const fresh = r.records.filter((x) => !existing.has(key(x as never)));
    setPreview({ kind, records: fresh, skipped: r.skipped, dupes: r.records.length - fresh.length });
  };
  const commitImport = () => {
    if (!preview) return;
    if (preview.kind === "projects") saveProjects([...(preview.records as ArtProject[]), ...projects]);
    else if (preview.kind === "quotes") saveQuotes([...(preview.records as ArtQuote[]), ...quotes]);
    else saveJobs([...(preview.records as AmareJob[]), ...jobs]);
    toast("success", `${preview.records.length} added`);
    setPreview(null);
  };
  const exportCsv = () => {
    const rows: (string | number)[][] =
      tab === "projects"
        ? [["Client", "Type", "Site", "Phone", "Value", "Paid", "Stage", "Install date", "Notes"], ...projects.map((p) => [p.client, p.type ?? "", p.site ?? "", p.phone ?? "", p.value, p.paid, STAGE_LABEL[p.stage], p.installDate ?? "", p.notes ?? ""])]
        : tab === "quotes"
          ? [["Client", "Title", "Amount", "Status", "Sent", "Follow up"], ...quotes.map((x) => [x.client, x.title, x.amount, x.status, x.sentAt ?? "", x.followUp ?? ""])]
          : [["Client", "Title", "Source", "Target", "Words", "Rate", "Fee", "Amount", "Due", "Status", "Delivered"], ...jobs.map((j) => [j.client, j.title, j.source, j.target, j.words, j.rate, j.fee ?? "", jobAmount(j), j.due ?? "", JOB_LABEL[j.status], j.deliveredAt ?? ""])];
    const text = rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `${tab === "jobs" ? "amare-jobs" : `artides-${tab}`}.csv`;
    a.click();
  };

  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  const shownProjects = projects.filter((p) => (showDone || !["completed", "cancelled"].includes(p.stage)) && match(`${p.client} ${p.type ?? ""} ${p.site ?? ""}`));
  const shownQuotes = quotes.filter((x) => (showDone || ["draft", "sent"].includes(x.status)) && match(`${x.client} ${x.title}`));
  const shownJobs = jobs.filter((j) => (showDone || !["paid", "cancelled"].includes(j.status)) && match(`${j.client} ${j.title} ${j.source} ${j.target}`));

  const stats =
    tab === "projects"
      ? [
          ["Active projects", String(as.activeProjects), RM(as.activeValue)],
          ["Still to collect", RM(as.outstanding), "contract − paid"],
          ["Overdue milestones", String(as.overdueMilestones), as.overdue[0] ? `${as.overdue[0].project}: ${as.overdue[0].milestone}` : "none"],
          ["Installs this week", String(as.installationsThisWeek), as.installs.map((i) => i.client).join(", ") || "none"],
        ]
      : tab === "quotes"
        ? [
            ["Quotations pending", String(as.quotationsPending), RM(as.pipelineValue)],
            ["Follow-ups due", String(as.followUpsDue.length), as.followUpsDue.map((f) => f.client).slice(0, 3).join(", ") || "none"],
            ["Won this month", RM(as.wonThisMonth), ""],
            ["Win rate", as.winRate == null ? "—" : `${Math.round(as.winRate * 100)}%`, "won ÷ decided"],
          ]
        : [
            ["Jobs in progress", String(ms.jobsInProgress), `${ms.wordsInProgress.toLocaleString("en-MY")} words`],
            ["Due this week", String(ms.dueThisWeek), ms.overdue.length ? `${ms.overdue.length} overdue` : "none overdue"],
            ["Words this month", ms.wordsThisMonth.toLocaleString("en-MY"), `RM ${ms.revenueThisMonth.toLocaleString("en-MY")} delivered`],
            ["To invoice / unpaid", RM(ms.toInvoice), `${RM(ms.unpaid)} invoiced, not paid`],
          ];
  const warnStat = (i: number) => (tab === "projects" && i === 2 && as.overdueMilestones > 0) || (tab === "quotes" && i === 1 && as.followUpsDue.length > 0) || (tab === "jobs" && i === 1 && ms.overdue.length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "business" : null })}>
      <DialogContent title="Artides & Amare" description="Projects, quotations and translation jobs — your staff and the dashboard use these, so keep them up to date (or import your spreadsheet)." className="h-[90vh] max-w-6xl" onBack={() => set({ dialog: "dashboard" })} backLabel="Dashboard">
        <div className="flex h-full min-h-0 flex-col">
          <div ref={slider.ref} className="relative flex gap-1 border-b border-slate-100 px-5 pt-2">
            {slider.box && <span aria-hidden className="pointer-events-none absolute h-0.5 rounded-full bg-navy transition-[left,width] duration-300 dark:bg-sky-400" style={{ left: slider.box.left, width: slider.box.width, top: slider.box.top + slider.box.height - 2 }} />}
            {(
              [
                ["projects", "🪑 Artides · Projects", projects.length],
                ["quotes", "🧾 Artides · Quotations", quotes.length],
                ["jobs", "🌐 Amare · Jobs", jobs.length],
              ] as const
            ).map(([v, l, n]) => (
              <button key={v} type="button" data-active={tab === v} onClick={() => (setTab(v), setExpanded(null))} className={cn("-mb-px px-3 py-2 text-xs font-semibold transition-colors", tab === v ? "text-slate-900" : "text-slate-500 hover:text-slate-800")}>
                {l} <span className="text-slate-400">{n}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-4">
            {stats.map(([label, value, sub], i) => (
              <div key={label} className={cn("rounded-xl px-3 py-2 ring-1", warnStat(i) ? "bg-red-50 ring-red-200" : "bg-slate-50 ring-slate-200")}>
                <div className="text-[10.5px] font-semibold text-slate-500">{label}</div>
                <div className={cn("text-lg font-bold tabular-nums", warnStat(i) ? "text-red-700" : "text-slate-900")}>{value}</div>
                <div className="truncate text-[10.5px] text-slate-400" title={sub}>
                  {sub}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-5 py-2 text-xs">
            <Button size="sm" onClick={add}>
              <Plus /> Add {tab === "projects" ? "project" : tab === "quotes" ? "quotation" : "job"}
            </Button>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 min-w-[9rem] flex-1 rounded-md border border-slate-200 bg-panel px-2 text-[11px] text-slate-800" />
            <label className="flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished
            </label>
            <Button size="sm" variant="outline" onClick={() => file.current?.click()} title="Import from your Excel / Google Sheets (save as CSV)">
              <Upload /> Import sheet
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCsv}>
              <Download /> CSV
            </Button>
            <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ""))} />
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
            {tab === "projects" &&
              (!shownProjects.length ? (
                <EmptyState kind="boxes" text={projects.length ? "Nothing here — tick Show finished" : "No projects yet"} sub={projects.length ? undefined : "Add one, or Import sheet from your current Excel / Google Sheet"} />
              ) : (
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="sticky top-0 z-10 bg-panel text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="w-6" />
                      <th className="font-semibold">Client</th>
                      <th className="font-semibold">Type</th>
                      <th className="w-28 font-semibold">Stage</th>
                      <th className="w-24 text-right font-semibold">Value RM</th>
                      <th className="w-24 text-right font-semibold">Paid RM</th>
                      <th className="w-32 pl-3 font-semibold">Install</th>
                      <th className="w-28 font-semibold">Next milestone</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {shownProjects.map((p) => {
                      const next = (p.milestones ?? []).filter((m) => !m.done).sort((a, b) => a.due.localeCompare(b.due))[0];
                      const late = next && next.due < today;
                      return (
                        <ProjectRows key={p.id} p={p} next={next} late={!!late} open={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} onPatch={(x) => patchProject(p.id, x)} confirm={confirmDel === p.id} onDelete={() => (confirmDel === p.id ? remove(p.id) : setConfirmDel(p.id))} today={today} />
                      );
                    })}
                  </tbody>
                </table>
              ))}

            {tab === "quotes" &&
              (!shownQuotes.length ? (
                <EmptyState kind="sparkle" text={quotes.length ? "No open quotations — tick Show finished" : "No quotations yet"} sub={quotes.length ? undefined : "Hannah and Zara use these for follow-ups"} />
              ) : (
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="sticky top-0 z-10 bg-panel text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="font-semibold">Client</th>
                      <th className="font-semibold">What</th>
                      <th className="w-24 text-right font-semibold">Amount RM</th>
                      <th className="w-24 font-semibold">Status</th>
                      <th className="w-32 font-semibold">Sent</th>
                      <th className="w-32 font-semibold">Follow up</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {shownQuotes.map((x) => (
                      <tr key={x.id} className="border-b border-slate-100">
                        <td className="py-1">
                          <input className={inp} value={x.client} placeholder="Client name" onChange={(e) => patchQuote(x.id, { client: e.target.value })} />
                        </td>
                        <td>
                          <input className={inp} value={x.title} placeholder="Kitchen cabinet L-shape…" onChange={(e) => patchQuote(x.id, { title: e.target.value })} />
                        </td>
                        <td>
                          <input className={cn(inp, "text-right tabular-nums")} inputMode="decimal" value={x.amount || ""} placeholder="0" onChange={(e) => patchQuote(x.id, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                        </td>
                        <td>
                          <select value={x.status} onChange={(e) => patchQuote(x.id, { status: e.target.value as QuoteStatus, ...(e.target.value === "sent" && !x.sentAt ? { sentAt: today } : {}) })} className={cn("h-7 rounded-full px-2 text-[11px] font-semibold", x.status === "won" ? "bg-emerald-50 text-emerald-700" : x.status === "lost" ? "bg-slate-100 text-slate-400" : x.status === "sent" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>
                            {QUOTE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s[0].toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="date" className={inp} value={x.sentAt ?? ""} onChange={(e) => patchQuote(x.id, { sentAt: e.target.value || undefined })} />
                        </td>
                        <td>
                          <input type="date" className={cn(inp, x.followUp && x.followUp <= today && ["draft", "sent"].includes(x.status) && "font-semibold text-red-700")} value={x.followUp ?? ""} onChange={(e) => patchQuote(x.id, { followUp: e.target.value || undefined })} />
                        </td>
                        <td>
                          <DelButton confirm={confirmDel === x.id} onClick={() => (confirmDel === x.id ? remove(x.id) : setConfirmDel(x.id))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}

            {tab === "jobs" &&
              (!shownJobs.length ? (
                <EmptyState kind="sparkle" text={jobs.length ? "No open jobs — tick Show finished" : "No translation jobs yet"} sub={jobs.length ? undefined : "Lina and Adam use these for deadlines and QA"} />
              ) : (
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 bg-panel text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="font-semibold">Client</th>
                      <th className="font-semibold">Job</th>
                      <th className="w-24 font-semibold">Languages</th>
                      <th className="w-20 text-right font-semibold">Words</th>
                      <th className="w-20 text-right font-semibold">RM/word</th>
                      <th className="w-20 text-right font-semibold">Fixed RM</th>
                      <th className="w-20 text-right font-semibold">Amount</th>
                      <th className="w-32 pl-3 font-semibold">Due</th>
                      <th className="w-28 font-semibold">Status</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {shownJobs.map((j) => (
                      <tr key={j.id} className="border-b border-slate-100">
                        <td className="py-1">
                          <input className={inp} value={j.client} placeholder="Client" onChange={(e) => patchJob(j.id, { client: e.target.value })} />
                        </td>
                        <td>
                          <input className={inp} value={j.title} placeholder="User manual v2" onChange={(e) => patchJob(j.id, { title: e.target.value })} />
                        </td>
                        <td>
                          <span className="flex items-center gap-0.5">
                            <input className={cn(inp, "w-11 px-1 text-center uppercase")} value={j.source} maxLength={6} onChange={(e) => patchJob(j.id, { source: e.target.value.toUpperCase() })} aria-label="Source language" />→
                            <input className={cn(inp, "w-11 px-1 text-center uppercase")} value={j.target} maxLength={6} onChange={(e) => patchJob(j.id, { target: e.target.value.toUpperCase() })} aria-label="Target language" />
                          </span>
                        </td>
                        <td>
                          <input className={cn(inp, "text-right tabular-nums")} inputMode="numeric" value={j.words || ""} placeholder="0" onChange={(e) => patchJob(j.id, { words: Math.round(Number(e.target.value.replace(/[^0-9]/g, ""))) || 0 })} />
                        </td>
                        <td>
                          <input className={cn(inp, "text-right tabular-nums")} inputMode="decimal" value={j.rate || ""} placeholder="0.12" onChange={(e) => patchJob(j.id, { rate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                        </td>
                        <td>
                          <input className={cn(inp, "text-right tabular-nums")} inputMode="decimal" value={j.fee || ""} placeholder="—" onChange={(e) => patchJob(j.id, { fee: Number(e.target.value.replace(/[^0-9.]/g, "")) || undefined })} />
                        </td>
                        <td className="text-right font-semibold tabular-nums text-slate-900">{jobAmount(j).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                        <td className="pl-3">
                          <input type="date" className={cn(inp, j.due && j.due < today && ["new", "translating", "qa"].includes(j.status) && "font-semibold text-red-700")} value={j.due ?? ""} onChange={(e) => patchJob(j.id, { due: e.target.value || undefined })} />
                        </td>
                        <td>
                          <select value={j.status} onChange={(e) => patchJob(j.id, { status: e.target.value as JobStatus })} className={cn("h-7 rounded-full px-2 text-[11px] font-semibold", JOB_TONE[j.status])}>
                            {JOB_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {JOB_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <DelButton confirm={confirmDel === j.id} onClick={() => (confirmDel === j.id ? remove(j.id) : setConfirmDel(j.id))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </div>

          {preview && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/30 p-4" onClick={() => setPreview(null)}>
              <div className="ov-pop w-full max-w-lg rounded-2xl bg-panel p-5 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
                <div className="text-base font-semibold text-slate-900">
                  Add {preview.records.length} {preview.kind === "projects" ? "project" : preview.kind === "quotes" ? "quotation" : "job"}
                  {preview.records.length === 1 ? "" : "s"}?
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Columns are matched by their names (client / customer, amount / value, status, due / deadline, words, rate…).
                  {preview.dupes ? ` ${preview.dupes} already here — skipped.` : ""}
                  {preview.skipped ? ` ${preview.skipped} row${preview.skipped > 1 ? "s" : ""} without a client name — skipped.` : ""}
                </p>
                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2 text-xs ring-1 ring-slate-200">
                  {preview.records.slice(0, 50).map((r) => (
                    <div key={r.id} className="flex justify-between gap-2">
                      <span className="truncate text-slate-700">
                        {r.client}
                        {"title" in r && r.title ? ` · ${r.title}` : "type" in r && r.type ? ` · ${r.type}` : ""}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        {"stage" in r ? `${STAGE_LABEL[r.stage]} · ${RM(r.value)}` : "amount" in r ? `${r.status} · ${RM(r.amount)}` : `${(r as AmareJob).words} words · ${JOB_LABEL[(r as AmareJob).status]}`}
                      </span>
                    </div>
                  ))}
                  {!preview.records.length && <p className="text-slate-500">Nothing new to add.</p>}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPreview(null)}>
                    Cancel
                  </Button>
                  <Button disabled={!preview.records.length} onClick={commitImport}>
                    Add {preview.records.length}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DelButton({ confirm, onClick }: { confirm: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md px-1.5 py-1 text-[10.5px] font-semibold", confirm ? "bg-red-600 text-white" : "text-slate-400 hover:text-red-600")} aria-label="Delete">
      {confirm ? "Delete?" : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

function ProjectRows({
  p,
  next,
  late,
  open,
  onToggle,
  onPatch,
  confirm,
  onDelete,
  today,
}: {
  p: ArtProject;
  next?: { name: string; due: string };
  late: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (x: Partial<ArtProject>) => void;
  confirm: boolean;
  onDelete: () => void;
  today: string;
}) {
  const ms = p.milestones ?? [];
  const setMs = (m: NonNullable<ArtProject["milestones"]>) => onPatch({ milestones: m });
  return (
    <>
      <tr className={cn("border-b border-slate-100", open && "bg-slate-50/70")}>
        <td>
          <button type="button" onClick={onToggle} className="grid h-6 w-6 place-items-center text-slate-400 hover:text-slate-700" aria-label="Details">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="py-1">
          <input className={inp} value={p.client} placeholder="Client name" onChange={(e) => onPatch({ client: e.target.value })} autoFocus={!p.client && open} />
        </td>
        <td>
          <input className={inp} value={p.type ?? ""} placeholder="Kitchen cabinet…" onChange={(e) => onPatch({ type: e.target.value })} />
        </td>
        <td>
          <select value={p.stage} onChange={(e) => onPatch({ stage: e.target.value as ProjectStage })} className={cn("h-7 w-full rounded-full px-2 text-[11px] font-semibold", STAGE_TONE[p.stage])}>
            {PROJECT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <input className={cn(inp, "text-right tabular-nums")} inputMode="decimal" value={p.value || ""} placeholder="0" onChange={(e) => onPatch({ value: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
        </td>
        <td>
          <input className={cn(inp, "text-right tabular-nums", p.value > 0 && p.paid >= p.value && "text-emerald-700")} inputMode="decimal" value={p.paid || ""} placeholder="0" onChange={(e) => onPatch({ paid: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
        </td>
        <td className="pl-3">
          <input type="date" className={inp} value={p.installDate ?? ""} onChange={(e) => onPatch({ installDate: e.target.value || undefined })} />
        </td>
        <td className={cn("truncate text-[11px]", late ? "font-semibold text-red-700" : "text-slate-500")} title={next ? `${next.name} · ${next.due}` : ""}>
          {next ? `${next.name} · ${next.due.slice(8)}/${next.due.slice(5, 7)}` : "—"}
        </td>
        <td>
          <DelButton confirm={confirm} onClick={onDelete} />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50/70">
          <td />
          <td colSpan={8} className="pb-3 pt-1">
            <div className="grid gap-3 md:grid-cols-[1fr_1.3fr]">
              <div className="space-y-1.5">
                <input className={cn(inp, "border-slate-200 bg-panel")} value={p.phone ?? ""} placeholder="Phone" onChange={(e) => onPatch({ phone: e.target.value })} />
                <input className={cn(inp, "border-slate-200 bg-panel")} value={p.site ?? ""} placeholder="Site address" onChange={(e) => onPatch({ site: e.target.value })} />
                <textarea className="min-h-16 w-full rounded-md border border-slate-200 bg-panel p-1.5 text-xs text-slate-800" value={p.notes ?? ""} placeholder="Notes (materials, colours, special requests…)" onChange={(e) => onPatch({ notes: e.target.value })} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                  Milestones
                  <button type="button" onClick={() => setMs([...ms, { id: Math.random().toString(36).slice(2, 8), name: "", due: today }])} className="text-navy hover:underline dark:text-sky-300">
                    ＋ Add milestone
                  </button>
                </div>
                {!ms.length && <p className="text-[11px] text-slate-400">e.g. Deposit received · Design approved · Carcass delivered · Installation · Handover</p>}
                {ms.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                    <input type="checkbox" checked={!!m.done} onChange={(e) => setMs(ms.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)))} aria-label="Done" />
                    <input className={cn(inp, "flex-1 border-slate-200 bg-panel", m.done && "text-slate-400 line-through")} value={m.name} placeholder="Milestone" onChange={(e) => setMs(ms.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} />
                    <input type="date" className={cn(inp, "w-36 border-slate-200 bg-panel", !m.done && m.due < today && "font-semibold text-red-700")} value={m.due} onChange={(e) => setMs(ms.map((x) => (x.id === m.id ? { ...x, due: e.target.value || x.due } : x)))} />
                    <button type="button" onClick={() => setMs(ms.filter((x) => x.id !== m.id))} className="text-slate-400 hover:text-red-600" aria-label="Remove milestone">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
