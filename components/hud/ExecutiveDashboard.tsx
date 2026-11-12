"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
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
import { cn, timeAgo } from "@/lib/utils";
import { CompaniesManager } from "./CompaniesManager";
import { TeamTable } from "./TeamTable";
import { StatusBadge, TaskRow } from "./EmployeePanel";

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

      {demo ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <b>{DEMO_LABEL}.</b> Business metrics below are generated samples for testing the interface. Turn demo mode off in Settings to hide them.
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <PlugZap className="h-4 w-4 shrink-0" />
          No marketplace or business integrations are connected. Metrics show <b>Data Unavailable</b> until Shopee / Lazada APIs or CSV imports are set up (Phase 3).
          <span className="ml-auto whitespace-nowrap text-slate-400">Last successful sync: never</span>
        </div>
      )}

      {showWgs && <EcommerceSection demo={demo} />}

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
                <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
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
                <div key={n.id} className={cn("rounded-lg border p-2.5", n.read ? "border-slate-100 bg-white" : "border-sky-200 bg-sky-50/60")}>
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
    <div className={cn("rounded-xl border bg-white p-3.5 shadow-sm", warn ? "border-amber-300" : "border-slate-200")}>
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
          <div className="rounded-xl border border-slate-200 bg-white p-3 lg:col-span-2">
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
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
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
          <div className="rounded-xl border border-slate-200 bg-white p-3">
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
