"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckSquare,
  Loader2,
  RefreshCw,
  Bell,
  Building2,
  CalendarClock,
  ClipboardList,
  DatabaseZap,
  FileClock,
  LayoutDashboard,
  Megaphone,
  Package,
  PlugZap,
  ScrollText,
  Users,
  Wallet,
} from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { DEMO_LABEL, demoAmare, demoArtides, demoEcommerce, formatMYR } from "@/lib/data/demo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, klHour, klTime, timeAgo } from "@/lib/utils";
import { CompaniesManager } from "./CompaniesManager";
import { TeamTable } from "./TeamTable";
import { StatusBadge, TaskRow } from "./EmployeePanel";
import { ApprovalCard } from "./AIWork";
import { liveSources, useLive, type LiveSummary, type PlatformFigures } from "@/lib/integrations/client";

const SERIES = { lazada: "#2a78d6", shopee: "#eb6834" };

export function ExecutiveDashboard() {
  const open = useUI((s) => s.dialog === "dashboard");
  const tab = useUI((s) => s.dashboardTab);
  const set = useUI((s) => s.set);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "dashboard" : null })}>
      <DialogContent
        title="Executive Dashboard"
        description="Company overview, team activity and approvals — all times in Malaysia time (MYT)."
        className="h-[92vh] max-w-6xl"
      >
        <Tabs value={tab} onValueChange={(v) => set({ dashboardTab: v })} className="flex h-full flex-col">
          <div className="scrollbar-thin overflow-x-auto border-b border-slate-100 px-5 py-2">
            <TabsList>
              <TabsTrigger value="overview">
                <LayoutDashboard /> Overview
              </TabsTrigger>
              <TabsTrigger value="companies">
                <Building2 /> Companies
              </TabsTrigger>
              <TabsTrigger value="team">
                <Users /> Team
              </TabsTrigger>
              <TabsTrigger value="approvals">
                <CheckSquare /> Approvals
                <PendingCount />
              </TabsTrigger>
              <TabsTrigger value="tasks">
                <ClipboardList /> Tasks
              </TabsTrigger>
              <TabsTrigger value="meetings">
                <CalendarClock /> Meetings
              </TabsTrigger>
              <TabsTrigger value="audit">
                <ScrollText /> Audit log
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-5">
            <TabsContent value="overview">
              <Overview />
            </TabsContent>
            <TabsContent value="companies">
              <CompaniesManager />
            </TabsContent>
            <TabsContent value="team">
              <TeamTable />
            </TabsContent>
            <TabsContent value="approvals">
              <ApprovalsInbox />
            </TabsContent>
            <TabsContent value="tasks">
              <AllTasks />
            </TabsContent>
            <TabsContent value="meetings">
              <MeetingsHistory />
            </TabsContent>
            <TabsContent value="audit">
              <AuditLog />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- overview
function Overview() {
  const companies = useOffice((s) => s.companies);
  const departments = useOffice((s) => s.departments);
  const employees = useOffice((s) => s.employees);
  const tasks = useOffice((s) => s.tasks);
  const meetings = useOffice((s) => s.meetings);
  const notifications = useOffice((s) => s.notifications);
  const activity = useOffice((s) => s.activity);
  const demo = useOffice((s) => s.settings.demoMode);
  const liveData = useLive((s) => s.summary);
  const companyFilter = useUI((s) => s.companyFilter);
  const set = useUI((s) => s.set);
  const [deptFilter, setDeptFilter] = useState("all");

  const scopedEmployees = employees.filter(
    (e) => e.active && (companyFilter === "all" || e.companyId === companyFilter || e.companyId === null) && (deptFilter === "all" || e.departmentId === deptFilter),
  );
  const scopedIds = new Set(scopedEmployees.map((e) => e.id));
  const pending = tasks.filter((t) => scopedIds.has(t.employeeId) && ["queued", "validating", "running", "waiting_data", "waiting_approval"].includes(t.status));
  const completed = tasks.filter((t) => scopedIds.has(t.employeeId) && t.status === "completed");
  const showWgs = companyFilter === "all" || companyFilter === "co-wgs";
  const showArtides = companyFilter === "all" || companyFilter === "co-artides";
  const showAmare = companyFilter === "all" || companyFilter === "co-amare";

  return (
    <div className="space-y-4">
      <Hero />
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={companyFilter} onChange={(e) => set({ companyFilter: e.target.value })} aria-label="Company filter">
          <option value="all">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (inactive)"}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Department filter">
          <option value="all">All departments</option>
          {departments
            .filter((d) => companyFilter === "all" || d.companyId === companyFilter || d.companyId === null)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </Select>
        <div className="ml-auto">
          <DataSourceBadge demo={demo} />
        </div>
      </div>

      {liveData ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <b>Live data</b> from {liveSources(liveData)}.
          {!liveData.platforms.lazada.connected && " Lazada isn't connected yet."}
          {!liveData.platforms.shopee.connected && " Shopee isn't connected."}
          <span className="ml-auto whitespace-nowrap text-emerald-700">
            Last sync:{" "}
            {(["shopee", "lazada"] as const)
              .filter((p) => liveData.platforms[p].connected)
              .map((p) => `${p === "shopee" ? "Shopee" : "Lazada"} ${liveData.platforms[p].lastSync ? timeAgo(liveData.platforms[p].lastSync!) : "never"}`)
              .join(" · ")}
          </span>
        </div>
      ) : demo ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{DEMO_LABEL}.</b> Business metrics below are generated samples for testing the interface. Turn demo mode off in Settings to hide them.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-panel px-3 py-2 text-xs text-slate-600">
          <PlugZap className="h-4 w-4 shrink-0" />
          No marketplace or business integrations are connected. Metrics show <b>Data Unavailable</b> until Shopee / Lazada APIs or CSV imports are set up (Phase 3).
          <span className="ml-auto whitespace-nowrap text-slate-400">Last successful sync: never</span>
        </div>
      )}

      {showWgs && (liveData ? <LiveEcommerceSection s={liveData} /> : <EcommerceSection demo={demo} />)}

      {(showArtides || showAmare) && (
        <div className="grid gap-4 md:grid-cols-2">
          {showArtides && <ArtidesCard demo={demo} />}
          {showAmare && <AmareCard demo={demo} />}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Pending employee tasks</CardTitle>
            <Badge variant="secondary">{pending.length}</Badge>
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto">
            {pending.length ? pending.slice(0, 12).map((t) => <TaskRow key={t.id} t={t} showEmployee />) : <Empty text="No pending tasks. Click an employee to delegate work." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Meetings</CardTitle>
            <Button size="sm" variant="outline" onClick={() => set({ dialog: "meeting-call" })}>
              Call meeting
            </Button>
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto">
            {meetings.length ? (
              meetings.slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 bg-panel p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{m.topic}</span>
                    <Badge variant={m.status === "in_progress" ? "success" : "secondary"}>{m.status === "in_progress" ? "In progress" : m.status === "ended" ? "Ended" : "Scheduled"}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {m.attendeeIds.length} attendees · {timeAgo(m.createdAt)}
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No meetings yet." />
            )}
            <div className="pt-1 text-[11px] text-slate-400">Completed reports: {completed.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <Bell className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-72 space-y-2 overflow-y-auto">
            {notifications.length ? (
              notifications.slice(0, 10).map((n) => (
                <div key={n.id} className={cn("rounded-lg border p-2.5", n.read ? "border-slate-100 bg-panel" : "border-sky-200 bg-sky-50/60")}>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <PriorityDot p={n.priority} />
                    {n.title}
                    {n.demo && <Badge variant="demo">DEMO</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{n.body}</p>
                </div>
              ))
            ) : (
              <Empty text="All caught up." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Team status</CardTitle>
            <span className="text-[11px] text-slate-400">{scopedEmployees.length} employees</span>
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-72 space-y-1 overflow-y-auto">
            {scopedEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => set({ dialog: null, selectedEmployeeId: e.id })}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="min-w-0 truncate text-xs">
                  <b className="text-slate-800">{e.name}</b> <span className="text-slate-500">· {e.title}</span>
                </span>
                <StatusBadge status={e.status} />
              </button>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Employee activity</CardTitle>
            <FileClock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="scrollbar-thin max-h-72 space-y-1.5 overflow-y-auto">
            {activity.length ? (
              activity.slice(0, 30).map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <span className="w-14 shrink-0 text-slate-400">{timeAgo(a.at)}</span>
                  <span className="text-slate-700">{a.text}</span>
                </div>
              ))
            ) : (
              <Empty text="Activity appears here as your team moves around and receives work." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function greeting() {
  const h = klHour();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Top-of-dashboard summary: what actually needs the CEO today. */
function Hero() {
  const ceoName = useOffice((s) => s.settings.ceoName);
  const demo = useOffice((s) => s.settings.demoMode);
  const tasks = useOffice((s) => s.tasks);
  const notifications = useOffice((s) => s.notifications);
  const live = useOffice((s) => s.meetings.find((m) => m.status === "in_progress"));
  const set = useUI((s) => s.set);
  const d = useMemo(() => (demo ? demoEcommerce() : null), [demo]);
  const shopeeLive = useLive((s) => s.summary);

  const items: { label: string; demo?: boolean; tone: "red" | "amber" | "sky"; onClick?: () => void }[] = [];
  const approvalsWaiting = useOffice((s) => s.approvals.filter((a) => a.status === "pending").length);
  if (approvalsWaiting)
    items.push({ label: `${approvalsWaiting} approval${approvalsWaiting > 1 ? "s" : ""} waiting for you`, tone: "red", onClick: () => set({ dashboardTab: "approvals" }) });
  const urgent = notifications.filter((n) => !n.read && n.priority !== "info").length;
  if (urgent) items.push({ label: `${urgent} unread important alert${urgent > 1 ? "s" : ""}`, tone: "red", onClick: () => set({ dialog: null, notificationsOpen: true }) });
  if (live) items.push({ label: `Meeting in progress: ${live.topic}`, tone: "sky", onClick: () => set({ dialog: null }) });
  const queued = tasks.filter((t) => t.status === "queued").length;
  if (queued) items.push({ label: `${queued} task${queued > 1 ? "s" : ""} queued for the AI engine`, tone: "sky", onClick: () => set({ dashboardTab: "tasks" }) });
  if (shopeeLive) {
    if (shopeeLive.toPack.urgent) items.push({ label: `${shopeeLive.toPack.urgent} parcel${shopeeLive.toPack.urgent > 1 ? "s" : ""} due to ship within 24h`, tone: "red" });
    if (shopeeLive.toPack.readyToShip) items.push({ label: `${shopeeLive.toPack.readyToShip} new orders to process`, tone: "amber" });
    if (shopeeLive.toPack.processed) items.push({ label: `${shopeeLive.toPack.processed} accepted orders to ship`, tone: "amber" });
  } else if (d) {
    if (d.parcels.priority) items.push({ label: `${d.parcels.priority} priority parcels to ship`, tone: "amber", demo: true });
    const low = d.ads.find((a) => a.daysLeft < 4);
    if (low) items.push({ label: `${low.platform} Ads credit ~${low.daysLeft.toFixed(1)} days left`, tone: "amber", demo: true });
    if (d.lowStock.length) items.push({ label: `${d.lowStock.length} products low on stock`, tone: "amber", demo: true });
  }
  const tone = { red: "bg-red-500/20 text-red-50 ring-red-300/40", amber: "bg-amber-400/20 text-amber-50 ring-amber-200/40", sky: "bg-sky-400/20 text-sky-50 ring-sky-200/40" };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#13263f] via-[#1e3a5f] to-[#2b5a8f] p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 right-32 h-40 w-40 rounded-full bg-amber-300/10 blur-2xl" />
      <div className="text-xs text-sky-200">{klTime(new Date(), { weekday: "long", day: "numeric", month: "long" })} · Malaysia time</div>
      <div className="mt-1 text-xl font-semibold">
        {greeting()}, {ceoName}
      </div>
      <div className="mt-0.5 text-sm text-sky-100/90">
        {items.length ? `${items.length} thing${items.length > 1 ? "s" : ""} need${items.length > 1 ? "" : "s"} your attention today.` : "Nothing needs you right now — the office is running smoothly."}
      </div>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((it, i) => (
            <button
              key={i}
              onClick={it.onClick}
              disabled={!it.onClick}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition enabled:hover:brightness-125", tone[it.tone])}
            >
              {it.label}
              {it.demo && <span className="rounded bg-amber-300 px-1 text-[9px] font-bold text-amber-950">DEMO</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DataSourceBadge({ demo }: { demo: boolean }) {
  return demo ? (
    <Badge variant="demo">
      <DatabaseZap className="h-3 w-3" /> Demo mode
    </Badge>
  ) : (
    <Badge variant="outline">
      <PlugZap className="h-3 w-3" /> Live mode · 0 integrations connected
    </Badge>
  );
}

function Kpi({ icon, label, value, sub, warn, demo }: { icon: React.ReactNode; label: string; value: string | null; sub?: string; warn?: boolean; demo: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-panel p-3.5 shadow-sm", warn ? "border-amber-300" : "border-slate-200")}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {demo && value !== null && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">DEMO</span>}
      </div>
      {value === null ? (
        <div className="mt-1.5 text-sm font-semibold text-slate-400">Data Unavailable</div>
      ) : (
        <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</div>
      )}
      <div className={cn("mt-0.5 text-[11px]", warn ? "font-medium text-amber-700" : "text-slate-500")}>{value === null ? "No integration connected" : sub}</div>
    </div>
  );
}

type View = "all" | "shopee" | "lazada";
type Plat = "shopee" | "lazada";
const PLAT_NAME: Record<Plat, string> = { shopee: "Shopee", lazada: "Lazada" };

function usePersisted<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [v, setV] = useState<T>(() => {
    try {
      const x = localStorage.getItem(key) as T | null;
      return x && allowed.includes(x) ? x : initial;
    } catch {
      return initial;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set] as const;
}

function Dot({ p }: { p: Plat }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES[p] }} />;
}

/** All / Shopee / Lazada switch. */
function PlatformSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { v: View; label: string }[] = [
    { v: "all", label: "All" },
    { v: "shopee", label: "Shopee" },
    { v: "lazada", label: "Lazada" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label="Marketplace">
      {opts.map((o) => (
        <button
          key={o.v}
          role="tab"
          aria-selected={view === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition",
            view === o.v ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.v !== "all" && <Dot p={o.v} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Row {
  p: Plat;
  value: string;
  note?: string | null;
  warn?: boolean;
  muted?: boolean;
}

/** KPI card: headline figure, optionally followed by one row per marketplace. */
function SplitKpi({
  icon,
  label,
  value,
  sub,
  warn,
  rows,
  control,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  sub?: string | null;
  warn?: boolean;
  rows?: Row[];
  control?: React.ReactNode;
  accent?: Plat;
}) {
  return (
    <div className={cn("flex flex-col rounded-xl border bg-panel p-3.5 shadow-sm", warn ? "border-amber-300" : "border-slate-200")}>
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {icon}
          {label}
        </span>
        {accent ? (
          <span className="flex items-center gap-1 normal-case tracking-normal text-slate-500">
            <Dot p={accent} /> {PLAT_NAME[accent]}
          </span>
        ) : (
          <span className="rounded bg-emerald-100 px-1 text-[9px] font-bold text-emerald-800">LIVE</span>
        )}
      </div>
      {control}
      {value === null ? (
        <div className="mt-1.5 text-sm font-semibold text-slate-400">Not available</div>
      ) : value !== undefined ? (
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      ) : null}
      {sub && <div className={cn("mt-0.5 text-[11px]", warn && !rows?.length ? "font-medium text-amber-700" : "text-slate-500")}>{sub}</div>}
      {!!rows?.length && (
        <div className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
          {rows.map((r) => (
            <div key={r.p} className="flex items-center gap-2 text-xs">
              <Dot p={r.p} />
              <span className="text-slate-600">{PLAT_NAME[r.p]}</span>
              {r.note && <span className={cn("truncate text-[10px]", r.warn ? "font-medium text-amber-700" : "text-slate-400")}>{r.note}</span>}
              <span className={cn("ml-auto font-semibold tabular-nums", r.muted ? "text-slate-400" : "text-slate-800")}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Period = "today" | "yesterday" | "monthToDate";
const PERIOD_LABEL: Record<Period, string> = { today: "Today", yesterday: "Yesterday", monthToDate: "Month to date" };
const PERIODS = Object.keys(PERIOD_LABEL) as Period[];

const hasLz = (s: LiveSummary) => s.platforms.lazada.connected;

function LiveEcommerceSection({ s }: { s: LiveSummary }) {
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const syncing = useLive((x) => x.syncing);
  const syncAll = useLive((x) => x.syncAll);
  const toast = useUI((x) => x.toast);
  const [period, setPeriod] = usePersisted<Period>("ov:revenue-period", "today", PERIODS);
  const [viewPref, setView] = usePersisted<View>("ov:platform-view", "all", ["all", "shopee", "lazada"]);
  const connected = (["shopee", "lazada"] as Plat[]).filter((p) => s.platforms[p].connected);
  const both = connected.length > 1;
  const view: View = both ? viewPref : "all";
  const bp = s.byPlatform ?? {};
  const one = view === "all" ? null : view;
  const f = one ? bp[one] : null;
  /** per-platform rows only in the combined view with both marketplaces */
  const rows = (make: (p: Plat, fig: PlatformFigures) => Row) =>
    both && view === "all" ? connected.filter((p) => bp[p]).map((p) => make(p, bp[p]!)) : undefined;

  const rev = f ? f[period] : s[period];
  const pack = f ? f.toPack : s.toPack;
  const cancelled = f ? f.cancelledToday : s.cancelledToday;
  const sellers = (f ? f.bestSellers30d : s.bestSellers30d) ?? [];
  const series = (one ? [one] : connected) as Plat[];
  const chart = s.days.slice(-range).map((x) => ({ date: x.date.slice(5), Shopee: x.shopee ?? x.revenue, Lazada: x.lazada ?? 0 }));
  const urgent = (n?: number) => ((n ?? 0) > 0 ? `${n} due in 24h` : null);

  const lz = s.ads.lazada ?? null;
  const lzPeriod = lz ? (period === "monthToDate" ? lz.monthToDate : period === "yesterday" ? lz.yesterday : lz.today) : null;
  const roi = (m: { roi: number | null } | null | undefined) => (m?.roi != null ? `ROI ${m.roi.toFixed(1)}x` : null);
  const topUp = lz?.autoTopUp
    ? lz.autoTopUp.enabled
      ? `Auto top-up on${lz.autoTopUp.amount ? ` (adds ${formatMYR(lz.autoTopUp.amount)}${lz.autoTopUp.whenBelow ? ` when below ${formatMYR(lz.autoTopUp.whenBelow)}` : ""})` : ""}`
      : "Auto top-up off"
    : null;
  const ads: Row[] = [
    { p: "shopee", value: s.ads.shopee ? formatMYR(s.ads.shopee.balance, 2) : "—", note: s.ads.shopee ? null : "no permission", muted: !s.ads.shopee },
    lzPeriod
      ? { p: "lazada", value: formatMYR(lzPeriod.spend, 2), note: roi(lzPeriod) }
      : { p: "lazada", value: "—", note: hasLz(s) ? "re-connect for ads" : "not connected", muted: true },
  ];

  return (
    <Card>
      <CardHeader className="flex-wrap gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle>Water Guardian Solution — E-commerce</CardTitle>
          <p className="text-[11px] text-slate-500" title={s.definition}>
            Gross order value in MYR (before fees, refunds and payouts) · Malaysia time
          </p>
        </div>
        <div className="flex items-center gap-2">
          {both && <PlatformSwitch view={view} onChange={setView} />}
          <Button
            size="sm"
            variant="outline"
            disabled={syncing}
            onClick={async () => {
              const r = await syncAll();
              toast(r.ok ? "success" : "error", r.message);
            }}
          >
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SplitKpi
            icon={<Wallet />}
            label="Revenue"
            accent={one ?? undefined}
            control={
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="mt-1 h-6 w-fit rounded-md border border-slate-200 bg-panel px-1 text-[11px] font-medium text-slate-700"
                aria-label="Revenue period"
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </option>
                ))}
              </select>
            }
            value={formatMYR(rev.revenue)}
            sub={`${rev.orders} order${rev.orders === 1 ? "" : "s"} · AOV ${formatMYR(rev.orders ? rev.revenue / rev.orders : 0, 2)}`}
            rows={rows((p, x) => ({ p, value: formatMYR(x[period].revenue), note: `${x[period].orders} orders` }))}
          />
          <SplitKpi
            icon={<ClipboardList />}
            label="To process"
            accent={one ?? undefined}
            value={String(pack.readyToShip)}
            sub={["Not accepted yet", urgent(pack.urgentToProcess)].filter(Boolean).join(" · ")}
            warn={(pack.urgentToProcess ?? 0) > 0}
            rows={rows((p, x) => ({ p, value: String(x.toPack.readyToShip), note: urgent(x.toPack.urgentToProcess), warn: (x.toPack.urgentToProcess ?? 0) > 0 }))}
          />
          <SplitKpi
            icon={<Package />}
            label="To ship"
            accent={one ?? undefined}
            value={String(pack.processed)}
            sub={["Accepted, awaiting pickup", urgent(pack.urgentToShip)].filter(Boolean).join(" · ")}
            warn={(pack.urgentToShip ?? 0) > 0}
            rows={rows((p, x) => ({ p, value: String(x.toPack.processed), note: urgent(x.toPack.urgentToShip), warn: (x.toPack.urgentToShip ?? 0) > 0 }))}
          />
          {one === "lazada" || (!both && connected[0] === "lazada") ? (
            <SplitKpi
              icon={<Megaphone />}
              label={`Ads spend · ${PERIOD_LABEL[period]}`}
              accent="lazada"
              value={lzPeriod ? formatMYR(lzPeriod.spend, 2) : null}
              sub={
                lzPeriod
                  ? [roi(lzPeriod), `${formatMYR(lzPeriod.revenue)} ad sales`, topUp].filter(Boolean).join(" · ")
                  : "Turn on Sponsor Solution, then Re-connect Lazada"
              }
            />
          ) : one === "shopee" ? (
            <SplitKpi
              icon={<Megaphone />}
              label="Ads balance"
              accent="shopee"
              value={s.ads.shopee ? formatMYR(s.ads.shopee.balance, 2) : null}
              sub={s.ads.shopee ? `Shopee Ads · as of ${timeAgo(s.ads.shopee.at)}` : "Shopee Ads permission not granted"}
            />
          ) : both ? (
            <SplitKpi icon={<Megaphone />} label="Ads" sub={`Shopee: balance left · Lazada: spent ${PERIOD_LABEL[period].toLowerCase()}`} rows={ads} />
          ) : (
            <SplitKpi
              icon={<Megaphone />}
              label="Ads balance"
              value={s.ads.shopee ? formatMYR(s.ads.shopee.balance, 2) : null}
              sub={s.ads.shopee ? `Shopee Ads · as of ${timeAgo(s.ads.shopee.at)}` : "Shopee Ads permission not granted"}
            />
          )}
          <SplitKpi
            icon={<AlertTriangle />}
            label="Cancelled today"
            accent={one ?? undefined}
            value={String(cancelled)}
            sub={cancelled ? "Check the reason in Seller Centre" : "No cancellations"}
            warn={cancelled > 0}
            rows={rows((p, x) => ({ p, value: String(x.cancelledToday), warn: x.cancelledToday > 0 }))}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-panel p-3 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">Revenue by day (MYR){one ? ` — ${PLAT_NAME[one]}` : ""}</div>
              <div className="flex gap-1">
                {[7, 14, 30].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r as 7 | 14 | 30)}
                    className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", range === r ? "bg-navy text-white" : "text-slate-500 hover:bg-slate-100")}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>
            {series.length > 1 && (
              <div className="mb-1 flex gap-3 text-[11px] text-slate-600">
                {series.map((p) => (
                  <span key={p} className="flex items-center gap-1">
                    <Dot p={p} /> {PLAT_NAME[p]}
                  </span>
                ))}
              </div>
            )}
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
                  <YAxis domain={[0, "auto"]} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v) => formatMYR(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
                  {series.includes("lazada") && <Area type="monotone" dataKey="Lazada" stackId="1" stroke={SERIES.lazada} strokeWidth={2} fill={SERIES.lazada} fillOpacity={0.18} isAnimationActive={false} />}
                  {series.includes("shopee") && <Area type="monotone" dataKey="Shopee" stackId="1" stroke={SERIES.shopee} strokeWidth={2} fill={SERIES.shopee} fillOpacity={0.18} isAnimationActive={false} />}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-panel p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">Best sellers — last 30 days{one ? ` · ${PLAT_NAME[one]}` : ""}</div>
            {sellers.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pb-1 font-medium">Product</th>
                    <th className="pb-1 text-right font-medium">Units</th>
                    <th className="pb-1 text-right font-medium">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((p) => (
                    <tr key={p.name} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.units}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMYR(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="No sales in the last 30 days yet." />
            )}
            <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">Profit estimates need product costs and fees — coming with the finance module.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EcommerceSection({ demo }: { demo: boolean }) {
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const d = useMemo(() => (demo ? demoEcommerce() : null), [demo]);
  const chart = d?.days.slice(-range).map((x) => ({ date: x.date.slice(5), Shopee: x.shopee, Lazada: x.lazada }));
  const total = (x?: { shopee: number; lazada: number }) => (x ? x.shopee + x.lazada : 0);
  const lowAd = d?.ads.filter((a) => a.daysLeft < 4) ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <div>
          <CardTitle>Water Guardian Solution — E-commerce</CardTitle>
          <p className="text-[11px] text-slate-500">Shopee Malaysia · Lazada Malaysia · Gross sales in MYR (before fees & refunds)</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi demo={demo} icon={<Wallet />} label="Today" value={d ? formatMYR(total(d.today)) : null} sub={d ? `${d.today.orders} orders` : undefined} />
          <Kpi demo={demo} icon={<Wallet />} label="Yesterday" value={d ? formatMYR(total(d.yesterday)) : null} sub={d ? `AOV ${formatMYR(total(d.yesterday) / d.yesterday.orders, 2)}` : undefined} />
          <Kpi demo={demo} icon={<Wallet />} label="Month to date" value={d ? formatMYR(d.mtd) : null} sub="Gross sales" />
          <Kpi
            demo={demo}
            icon={<Package />}
            label="To pack"
            value={d ? String(d.parcels.shopee + d.parcels.lazada) : null}
            sub={d ? `Shopee ${d.parcels.shopee} · Lazada ${d.parcels.lazada} · ${d.parcels.priority} priority` : undefined}
            warn={!!d && d.parcels.priority > 0}
          />
          <Kpi
            demo={demo}
            icon={<Megaphone />}
            label="Ad balance alerts"
            value={d ? String(lowAd.length) : null}
            sub={lowAd.length ? `${lowAd[0].platform} ~${lowAd[0].daysLeft.toFixed(1)} days left` : "All balances healthy"}
            warn={lowAd.length > 0}
          />
          <Kpi
            demo={demo}
            icon={<AlertTriangle />}
            label="Low stock"
            value={d ? String(d.lowStock.length) : null}
            sub={d?.lowStock[0] ? `${d.lowStock[0].name}: ${d.lowStock[0].qty} left` : undefined}
            warn={!!d && d.lowStock.length > 0}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-panel p-3 lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-700">Revenue trend by platform (MYR)</div>
              <div className="flex gap-1">
                {[7, 14, 30].map((r) => (
                  <button
                    key={r}
                    disabled={!d}
                    onClick={() => setRange(r as 7 | 14 | 30)}
                    className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", range === r ? "bg-navy text-white" : "text-slate-500 hover:bg-slate-100")}
                  >
                    {r}d
                  </button>
                ))}
              </div>
            </div>
            {chart ? (
              <>
                <div className="mb-1 flex gap-3 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.shopee }} /> Shopee
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SERIES.lazada }} /> Lazada
                  </span>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
                      <YAxis domain={[0, "auto"]} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip
                        formatter={(v) => formatMYR(Number(v))}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                      />
                      <Area type="monotone" dataKey="Lazada" stackId="1" stroke={SERIES.lazada} strokeWidth={2} fill={SERIES.lazada} fillOpacity={0.18} isAnimationActive={false} />
                      <Area type="monotone" dataKey="Shopee" stackId="1" stroke={SERIES.shopee} strokeWidth={2} fill={SERIES.shopee} fillOpacity={0.18} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center gap-1 text-center text-xs text-slate-500">
                <PlugZap className="h-5 w-5 text-slate-300" />
                <b className="text-slate-600">Data Unavailable</b>
                Connect Shopee / Lazada or import a CSV to see revenue trends.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-panel p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">Best-selling products</div>
            {d ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pb-1 font-medium">Product</th>
                    <th className="pb-1 text-right font-medium">Units</th>
                    <th className="pb-1 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {d.bestSellers.map((p) => (
                    <tr key={p.name} className="border-t border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.units}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMYR(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text="Data Unavailable" />
            )}
            {d && (
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                <div className="flex justify-between">
                  <span>Est. gross profit (30d)</span>
                  <b className="tabular-nums">{formatMYR(d.grossProfitEst)}</b>
                </div>
                <div className="flex justify-between">
                  <span>Est. net profit after ads & fees (30d)</span>
                  <b className="tabular-nums">{formatMYR(d.netProfitEst)}</b>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArtidesCard({ demo }: { demo: boolean }) {
  const d = demo ? demoArtides() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Artides Home — Projects</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Kpi demo={demo} icon={<Building2 />} label="Active projects" value={d ? String(d.activeProjects) : null} sub={d ? `${d.overdueMilestones} overdue milestone` : undefined} warn={!!d?.overdueMilestones} />
        <Kpi demo={demo} icon={<ClipboardList />} label="Quotations pending" value={d ? String(d.quotationsPending) : null} sub={d ? `Pipeline ${formatMYR(d.pipelineValue)}` : undefined} />
      </CardContent>
    </Card>
  );
}

function AmareCard({ demo }: { demo: boolean }) {
  const d = demo ? demoAmare() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Amare Localization — Jobs</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Kpi demo={demo} icon={<ClipboardList />} label="Jobs in progress" value={d ? String(d.jobsInProgress) : null} sub={d ? `${d.dueThisWeek} due this week` : undefined} />
        <Kpi demo={demo} icon={<ScrollText />} label="Words this month" value={d ? d.wordsThisMonth.toLocaleString("en-MY") : null} sub={d ? `${d.qaPending} awaiting QA` : undefined} />
      </CardContent>
    </Card>
  );
}

export function PriorityDot({ p }: { p: "critical" | "important" | "info" }) {
  const c = p === "critical" ? "#dc2626" : p === "important" ? "#f59e0b" : "#64748b";
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c }} title={p} />;
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-xs text-slate-400">{text}</p>;
}

function PendingCount() {
  const n = useOffice((s) => s.approvals.filter((a) => a.status === "pending").length);
  return n ? <span className="ml-0.5 rounded-full bg-purple-600 px-1.5 text-[10px] font-bold text-white">{n}</span> : null;
}

function ApprovalsInbox() {
  const approvals = useOffice((s) => s.approvals);
  const pending = approvals.filter((a) => a.status === "pending");
  const decided = approvals.filter((a) => a.status !== "pending").slice(0, 30);
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-900">
        Employees never pay, change campaigns, edit listings, message customers or delete records on their own. They prepare a draft and wait here for
        you. External integrations arrive in Phase 3, so an approved draft is for you to copy and use.
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Waiting for you ({pending.length})</div>
        <div className="grid gap-2 md:grid-cols-2">
          {pending.length ? pending.map((a) => <ApprovalCard key={a.id} a={a} showEmployee />) : <Empty text="Nothing needs your approval." />}
        </div>
      </div>
      {decided.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Decided</div>
          <div className="grid gap-2 md:grid-cols-2">
            {decided.map((a) => (
              <ApprovalCard key={a.id} a={a} showEmployee />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- other tabs
function AllTasks() {
  const tasks = useOffice((s) => s.tasks);
  const [status, setStatus] = useState("open");
  const list = tasks.filter((t) => (status === "all" ? true : status === "open" ? !["completed", "cancelled", "failed"].includes(t.status) : t.status === status));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <span className="text-xs text-slate-500">{list.length} task(s) · persisted records</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">{list.length ? list.map((t) => <TaskRow key={t.id} t={t} showEmployee />) : <Empty text="No tasks match." />}</div>
    </div>
  );
}

function MeetingsHistory() {
  const meetings = useOffice((s) => s.meetings);
  if (!meetings.length) return <Empty text="No meetings yet. Click the meeting table in the office or use Call meeting." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {meetings.map((m) => (
        <Card key={m.id}>
          <CardHeader>
            <div>
              <CardTitle>{m.topic}</CardTitle>
              <p className="text-[11px] text-slate-500">{new Date(m.createdAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT</p>
            </div>
            <Badge variant={m.status === "in_progress" ? "success" : "secondary"}>{m.status === "in_progress" ? "In progress" : "Ended"}</Badge>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs text-slate-700">{m.summary ?? `${m.items.length} item(s) recorded so far.`}</pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AuditLog() {
  const audit = useOffice((s) => s.audit);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <span className="text-[11px] text-slate-400">Every configuration change made by the CEO account</span>
      </CardHeader>
      <CardContent>
        {audit.length ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="pb-1 font-medium">When</th>
                <th className="pb-1 font-medium">Action</th>
                <th className="pb-1 font-medium">Entity</th>
                <th className="pb-1 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 200).map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-500">{timeAgo(a.at)}</td>
                  <td className="py-1.5 pr-2 font-medium text-slate-700">{a.action}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{a.entity}</td>
                  <td className="py-1.5 text-slate-600">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text="No changes recorded yet." />
        )}
      </CardContent>
    </Card>
  );
}
