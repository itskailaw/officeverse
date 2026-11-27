"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, ClipboardList, Download, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useLive, type LiveSummary } from "@/lib/integrations/client";
import { formatMYR } from "@/lib/data/demo";
import { upcomingEvents } from "@/lib/marketing/calendar";
import { emptyInventory, monthStatement } from "@/lib/data/inventory";
import { timeAgo, cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { openMarketing } from "./MarketingStudio";

type Range = "today" | "7" | "30" | "month";
const SHOPEE = "#eb6834";
const LAZADA = "#2a78d6";
const RM = (n: number) => formatMYR(n);
const klDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);

function Card({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-panel p-4 shadow-sm ring-1 ring-slate-200/80", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
const Muted = ({ children }: { children: React.ReactNode }) => <span className="text-[11px] text-slate-400">{children}</span>;
const Chip = ({ tone, children }: { tone: "green" | "amber" | "red" | "slate"; children: React.ReactNode }) => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
      tone === "green" && "bg-emerald-50 text-emerald-700",
      tone === "amber" && "bg-amber-50 text-amber-800",
      tone === "red" && "bg-red-50 text-red-700",
      tone === "slate" && "bg-slate-100 text-slate-600",
    )}
  >
    {children}
  </span>
);

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 88 + 1).toFixed(1)},${(25 - ((v - mn) / (mx - mn || 1)) * 22).toFixed(1)}`).join(" ");
  return (
    <svg width="60" height="20" viewBox="0 0 90 28" preserveAspectRatio="none" className="shrink-0 text-navy dark:text-sky-300" aria-hidden>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts} />
    </svg>
  );
}

function Kpi({ label, value, delta, note, spark, tone }: { label: string; value: string; delta?: { pct: number | null; text?: string } | null; note?: string; spark?: number[]; tone?: "red" | "green" }) {
  const up = (delta?.pct ?? 0) >= 0;
  return (
    <div className="rounded-2xl bg-panel p-4 shadow-sm ring-1 ring-slate-200/80">
      <div className="flex h-5 items-center justify-between gap-2">
        <div className="truncate text-[11px] font-semibold text-slate-500">{label}</div>
        {spark && <Spark values={spark} />}
      </div>
      <div className="mt-1 whitespace-nowrap text-[26px] font-bold leading-tight tracking-tight text-slate-900 tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug">
        {delta && delta.pct !== null && (
          <span className={cn("whitespace-nowrap font-semibold", up ? "text-emerald-600" : "text-red-600")}>
            {up ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(1)}%{" "}
          </span>
        )}
        {delta?.text && <span className="text-slate-400">{delta.text}</span>}
        {note && <span className={cn("font-semibold", tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "text-slate-500")}>{note}</span>}
      </div>
    </div>
  );
}

type PackSide = { label: string; sub: string; n: number; urgent: number; split: { p: "shopee" | "lazada"; n: number }[]; action: string; go?: () => void };
/** Packing at a glance: orders still to accept / arrange drop-off, and parcels waiting to be handed over. */
function PackTile({ sides }: { sides: PackSide[] }) {
  return (
    <div className="col-span-2 grid grid-cols-2 divide-x divide-slate-100 rounded-2xl bg-panel shadow-sm ring-1 ring-slate-200/80">
      {sides.map((x) => (
        <div key={x.label} className="flex min-w-0 flex-col p-4">
          <div className="text-[11px] font-semibold text-slate-500">{x.label}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn("text-[26px] font-bold leading-tight tracking-tight tabular-nums", x.urgent ? "text-red-600" : "text-slate-900")}>{x.n}</span>
            <span className="truncate text-[11.5px] text-slate-500">{x.sub}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
            {x.split.map((sp) => (
              <span key={sp.p} className="inline-flex items-center gap-1 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: sp.p === "shopee" ? SHOPEE : LAZADA }} />
                {sp.p === "shopee" ? "Shopee" : "Lazada"} <b className="text-slate-700">{sp.n}</b>
              </span>
            ))}
          </div>
          {x.urgent > 0 && <div className="mt-0.5 text-[11.5px] font-semibold text-red-600">{x.urgent} due within 24h</div>}
          {x.go && (
            <button type="button" onClick={x.go} className="mt-auto inline-flex w-fit items-center gap-1 pt-2 text-xs font-semibold text-navy hover:underline dark:text-sky-300">
              {x.action} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** The redesigned Overview for live marketplace data: header, key numbers, chart, to-dos, money, stock and dates. */
export function DashboardHQ({ s, quickRefresh }: { s: LiveSummary; quickRefresh: React.ReactNode }) {
  const { t } = useT();
  const set = useUI((x) => x.set);
  const toast = useUI((x) => x.toast);
  const syncing = useLive((x) => x.syncing);
  const syncAll = useLive((x) => x.syncAll);
  const companies = useOffice((x) => x.companies);
  const companyFilter = useUI((x) => x.companyFilter);
  const ceoName = useOffice((x) => x.settings.ceoName);
  const approvals = useOffice((x) => x.approvals);
  const target = useOffice((x) => x.settings.salesTarget);
  const update = useOffice((x) => x.updateSettings);
  const inventory = useOffice((x) => x.settings.inventory);
  const staffDates = useOffice((x) => x.settings.staffDates);
  const employees = useOffice((x) => x.employees);
  const [range, setRange] = useState<Range>(() => {
    try {
      return (localStorage.getItem("ov:dash-range") as Range) || "7";
    } catch {
      return "7";
    }
  });
  const pick = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem("ov:dash-range", r);
    } catch {}
  };
  // stock levels for the to-do list and runway card
  const [levels, setLevels] = useState<{ name: string; left: number; daysLeft: number | null; level: string }[] | null>(null);
  useEffect(() => {
    fetch("/api/stock", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setLevels(j.levels ?? []))
      .catch(() => {});
  }, []);

  // ── numbers for the chosen range ──
  const days = s.days ?? [];
  const sum = (list: typeof days) => list.reduce((a, d) => ({ revenue: a.revenue + d.revenue, orders: a.orders + d.orders }), { revenue: 0, orders: 0 });
  const cur = range === "today" ? s.today : range === "month" ? s.monthToDate : sum(days.slice(-Number(range)));
  const prev = range === "today" ? s.yesterday : range === "7" ? sum(days.slice(-14, -7)) : null;
  const pct = (a: number, b: number | undefined) => (b && b > 0 ? ((a - b) / b) * 100 : null);
  const vs = range === "today" ? "vs yesterday" : range === "7" ? "vs prev. 7 days" : "";
  const spark = days.slice(-14).map((d) => d.revenue);
  const sparkOrders = days.slice(-14).map((d) => d.orders);
  const chartDays = days.slice(range === "30" || range === "month" ? -30 : -14);
  const chart = chartDays.map((d) => ({ date: d.date.slice(5).replace("-", "/"), Shopee: d.shopee ?? d.revenue, Lazada: d.lazada ?? 0 }));
  const profit = s.profit?.total ?? null;
  const lz = s.ads.lazada;
  const adSpend = range === "month" ? (lz?.monthToDate?.spend ?? null) : range === "today" ? (lz?.today?.spend ?? null) : (lz?.monthToDate?.spend ?? null);
  const toShip = s.toPack.processed;
  const toAccept = s.toPack.readyToShip;
  const isOwner = useLive((x) => x.status?.role) === "owner";
  const openCosts = () => {
    try {
      sessionStorage.setItem("ov:stock-section", "costs");
    } catch {}
    set({ dialog: "stock" });
  };
  const plats = (["shopee", "lazada"] as const).filter((p) => s.platforms?.[p]?.connected);

  // ── needs attention ──
  const low = (levels ?? []).filter((l) => l.level === "low" || l.level === "out");
  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;
  const todos = [
    { n: s.toPack.urgent, icon: "📦", bg: "bg-red-50", text: "parcels must ship within 24h", go: () => set({ dialog: "fulfil", fulfilStage: "ship" }) },
    { n: toAccept, icon: "🧾", bg: "bg-sky-50", text: "new orders to accept", go: () => set({ dialog: "fulfil", fulfilStage: "process" }) },
    { n: s.returns?.open ?? 0, icon: "↩️", bg: "bg-amber-50", text: "returns to handle", go: () => set({ dialog: "dashboard", dashboardTab: "overview" }) },
    { n: low.length, icon: "📉", bg: "bg-indigo-50", text: "items low or out of stock", go: () => set({ dialog: "stock" }) },
    { n: pendingApprovals, icon: "✋", bg: "bg-emerald-50", text: "approvals waiting", go: () => set({ dialog: "dashboard", dashboardTab: "approvals" }) },
  ];
  const active = todos.filter((x) => x.n > 0);

  // ── target ──
  const monthRev = s.monthToDate.revenue;
  const now = new Date();
  const dayOfMonth = Number(klDay(now).slice(8, 10));
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = target ? (target * dayOfMonth) / daysInMonth : 0;
  const tPct = target ? Math.min(1, monthRev / target) : 0;
  const perDay = target && daysInMonth - dayOfMonth > 0 ? Math.max(0, (target - monthRev) / (daysInMonth - dayOfMonth)) : 0;
  const [editTarget, setEditTarget] = useState(false);

  // ── coming up ──
  const coming = useMemo(() => {
    const items: { icon: string; title: string; sub?: string; when: string; sortKey: number; go?: () => void }[] = [];
    for (const e of upcomingEvents(new Date(), 45).filter((e) => e.kind === "mega" || e.kind === "festival").slice(0, 2))
      items.push({ icon: "🛍️", title: e.name, sub: "Marketing Studio → Campaigns", when: e.daysLeft === 0 ? "today" : e.daysLeft === 1 ? "tomorrow" : `${e.daysLeft} days`, sortKey: e.daysLeft, go: () => openMarketing("campaign") });
    const inv = inventory ?? emptyInventory();
    const month = klDay().slice(0, 7);
    for (const sup of new Set(inv.receipts.filter((r) => r.date.startsWith(month)).map((r) => r.supplier))) {
      if (inv.paid?.[`${sup}|${month}`]) continue;
      const st = monthStatement(inv, sup, month);
      items.push({ icon: "🧾", title: `Pay ${sup}`, sub: `${RM(st.total)} · ${new Date(`${month}-15`).toLocaleDateString("en-MY", { month: "long" })}`, when: "month end", sortKey: daysInMonth - dayOfMonth, go: () => set({ dialog: "stock" }) });
    }
    const md = klDay().slice(5);
    for (const e of employees.filter((x) => x.active)) {
      const b = staffDates?.[e.id]?.birthday;
      if (!b) continue;
      const y = now.getFullYear() + (b < md ? 1 : 0);
      const d = Math.round((Date.parse(`${y}-${b}T00:00:00+08:00`) - Date.parse(`${klDay()}T00:00:00+08:00`)) / 86400000);
      if (d <= 30) items.push({ icon: "🎂", title: `${e.name.split(" ")[0]}'s birthday`, when: d === 0 ? "today" : new Date(`${y}-${b}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short" }), sortKey: d });
    }
    items.push({ icon: "📊", title: "Monthly profit check", sub: "Dashboard → Profit", when: `1 ${new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-MY", { month: "short" })}`, sortKey: daysInMonth - dayOfMonth + 1 });
    return items.sort((a, b) => a.sortKey - b.sortKey).slice(0, 5);
  }, [inventory, staffDates, employees, daysInMonth, dayOfMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(now));
  const greet = t(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  const lastSync = (["shopee", "lazada"] as const)
    .filter((p) => s.platforms[p].connected)
    .map((p) => (s.platforms[p] as { lastSync?: string | null }).lastSync)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const sellers = (s.bestSellers30d ?? []).slice(0, 5);
  const maxUnits = Math.max(1, ...sellers.map((x) => x.units));
  const recentReturns = (s.returns?.recent ?? []).slice(0, 3);
  const runway = (levels ?? []).filter((l) => l.daysLeft !== null || l.level === "out").sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)).slice(0, 4);

  return (
    <div id="ov-dash" className="space-y-3.5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="mr-2">
          <div className="text-lg font-bold text-slate-900">
            {greet}, {ceoName?.split(" ")[0] || t("Boss")}
          </div>
          <div className="text-xs text-slate-500">{now.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kuala_Lumpur" })} · Malaysia time</div>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-0.5 print:hidden">
          {[{ id: "all", name: "All" }, ...companies.filter((c) => c.active)].map((c) => (
            <button
              key={c.id}
              onClick={() => set({ companyFilter: c.id })}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", companyFilter === c.id ? "bg-panel text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            >
              {c.name.replace(" Solution", "").replace(" Localization", "")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 print:hidden">
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.2)]" />
            Live{lastSync ? ` · synced ${timeAgo(lastSync)}` : ""}
          </span>
          <div className="inline-flex overflow-hidden rounded-xl bg-panel ring-1 ring-slate-200">
            {(
              [
                ["today", "Today"],
                ["7", "7 days"],
                ["30", "30 days"],
                ["month", "Month"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} onClick={() => pick(v)} className={cn("px-3 py-1.5 text-xs font-semibold", range === v ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-50")}>
                {l}
              </button>
            ))}
          </div>
          {quickRefresh}
          <button
            disabled={syncing}
            onClick={async () => {
              const r = await syncAll();
              toast(r.ok ? "success" : "error", r.message);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            title="Full sync: orders, ads, fees, payouts and returns (slower)"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Full sync
          </button>
          {isOwner && (
            <button type="button" onClick={() => set({ dialog: "purchases" })} className="inline-flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              <ClipboardList className="h-3.5 w-3.5" /> Order history
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex h-8 items-center gap-1 rounded-xl bg-panel px-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* key numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Revenue" value={RM(cur.revenue)} delta={prev ? { pct: pct(cur.revenue, prev.revenue), text: vs } : null} spark={spark} />
        <Kpi label="Orders" value={String(cur.orders)} delta={prev ? { pct: pct(cur.orders, prev.orders), text: vs } : null} note={cur.orders ? `${prev ? " · " : ""}AOV ${RM(cur.revenue / cur.orders)}` : undefined} spark={sparkOrders} />
        <PackTile
          sides={[
            {
              label: "To process",
              sub: "not accepted yet",
              n: toAccept,
              urgent: s.toPack.urgentToProcess ?? 0,
              split: plats.map((p) => ({ p, n: s.byPlatform?.[p]?.toPack.readyToShip ?? 0 })),
              action: "Arrange drop-off",
              go: isOwner ? () => set({ dialog: "fulfil", fulfilStage: "process" }) : undefined,
            },
            {
              label: "To ship",
              sub: "awaiting drop-off",
              n: toShip,
              urgent: s.toPack.urgentToShip ?? 0,
              split: plats.map((p) => ({ p, n: s.byPlatform?.[p]?.toPack.processed ?? 0 })),
              action: "Print labels",
              go: isOwner ? () => set({ dialog: "fulfil", fulfilStage: "ship" }) : undefined,
            },
          ]}
        />
        <Kpi
          label="Net profit (month)"
          value={profit ? RM(profit.estProfit) : "—"}
          note={profit ? (profit.margin !== null ? `${profit.margin.toFixed(1)}% margin${!s.profit?.costsEntered ? " · add product costs" : profit.costCoverage < 0.95 ? ` · ${Math.round(profit.costCoverage * 100)}% costed` : ""}` : "after fees & ads") : "needs payout data"}
          tone={profit && profit.estProfit > 0 ? "green" : undefined}
        />
        <Kpi
          label={range === "today" ? "Ad spend (today)" : "Ad spend (month)"}
          value={adSpend !== null ? RM(adSpend) : "—"}
          note={[lz?.monthToDate?.roi != null ? `ROI ${lz.monthToDate.roi.toFixed(1)}×` : "", s.ads.shopee ? `Shopee balance ${RM(s.ads.shopee.balance)}` : ""].filter(Boolean).join(" · ") || "Lazada ads only"}
          tone={s.ads.shopee && s.ads.shopee.balance < 30 ? "red" : undefined}
        />
      </div>

      {/* chart + to-dos */}
      <div className="grid gap-3.5 lg:grid-cols-[1.7fr_1fr]">
        <Card
          title={`Sales · last ${chartDays.length} days`}
          right={
            <span className="flex gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: SHOPEE }} />
                Shopee
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: LAZADA }} />
                Lazada
              </span>
            </span>
          }
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="hqS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={SHOPEE} stopOpacity={0.3} />
                    <stop offset="1" stopColor={SHOPEE} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="hqL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={LAZADA} stopOpacity={0.35} />
                    <stop offset="1" stopColor={LAZADA} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
                <Tooltip formatter={(v) => RM(Number(v))} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="Lazada" stackId="1" stroke={LAZADA} strokeWidth={2} fill="url(#hqL)" />
                <Area type="monotone" dataKey="Shopee" stackId="1" stroke={SHOPEE} strokeWidth={2} fill="url(#hqS)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Needs your attention" right={<Muted>{active.length ? `${active.length} item${active.length > 1 ? "s" : ""}` : ""}</Muted>}>
          {!active.length ? (
            <div className="grid h-44 place-items-center text-center text-sm text-slate-500">
              <div>
                <div className="text-3xl">✅</div>
                All clear — nothing waiting.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {active.map((x) => (
                <button key={x.text} onClick={x.go} className="flex w-full items-center gap-3 py-2.5 text-left text-[13px] hover:bg-slate-50/60">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base", x.bg)}>{x.icon}</span>
                  <span className="w-6 text-[15px] font-bold tabular-nums text-slate-900">{x.n}</span>
                  <span className="flex-1 text-slate-700">{x.text}</span>
                  <span className="flex items-center gap-0.5 text-xs font-bold text-navy dark:text-sky-300">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* profit · best sellers · returns */}
      <div className="grid gap-3.5 md:grid-cols-3">
        <Card
          title="Profit · month to date"
          right={
            <button type="button" onClick={openCosts} className="text-[11px] font-semibold text-navy hover:underline dark:text-sky-300">
              Product costs
            </button>
          }
        >
          {!profit ? (
            <p className="py-6 text-center text-xs text-slate-500">Profit appears once Shopee / Lazada payout data has synced.</p>
          ) : (
            <div className="space-y-2 text-[12.5px]">
              {(
                [
                  ["Sales", profit.gross, "bg-navy dark:bg-sky-400", 0],
                  ["Marketplace fees", -profit.fees, "bg-red-400", profit.gross - profit.fees],
                  ["Product cost", -profit.productCost, "bg-orange-400", profit.gross - profit.fees - profit.productCost],
                  ["Ads", -profit.adSpend, "bg-amber-400", profit.estProfit],
                ] as const
              ).map(([label, v, color, start]) => {
                const w = Math.max(0.6, (Math.abs(v) / (profit.gross || 1)) * 100);
                const left = label === "Sales" ? 0 : (Math.max(0, start) / (profit.gross || 1)) * 100;
                return (
                  <div key={label} className="grid grid-cols-[110px_1fr_72px] items-center gap-2">
                    <span className="text-slate-600">{label}</span>
                    <div className="relative h-3">
                      <div className={cn("absolute h-3 rounded", color)} style={{ left: `${left}%`, width: `${Math.min(w, 100 - left)}%` }} />
                    </div>
                    <span className={cn("text-right tabular-nums", v < 0 ? "text-red-600" : "font-semibold text-slate-900")}>{v < 0 ? `−${Math.abs(v).toLocaleString("en-MY", { maximumFractionDigits: 0 })}` : v.toLocaleString("en-MY", { maximumFractionDigits: 0 })}</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[110px_1fr_72px] items-center gap-2 border-t border-slate-100 pt-2">
                <b className="text-slate-900">Net profit</b>
                <div className="relative h-3">
                  <div className="absolute h-3 rounded bg-emerald-500" style={{ width: `${Math.max(0.6, Math.min(100, (Math.max(0, profit.estProfit) / (profit.gross || 1)) * 100))}%` }} />
                </div>
                <b className={cn("text-right tabular-nums", profit.estProfit >= 0 ? "text-emerald-600" : "text-red-600")}>{profit.estProfit.toLocaleString("en-MY", { maximumFractionDigits: 0 })}</b>
              </div>
              {!s.profit?.costsEntered ? (
                <button type="button" onClick={openCosts} className="text-[11px] font-semibold text-navy hover:underline dark:text-sky-300">
                  Add product costs for a true profit →
                </button>
              ) : profit.costCoverage < 0.95 ? (
                <button type="button" onClick={openCosts} className="block text-left text-[11px] font-semibold text-amber-700 hover:underline">
                  {Math.round(profit.costCoverage * 100)}% of units have a cost{s.profit?.uncosted?.length ? ` · missing: ${s.profit.uncosted.slice(0, 3).map((u) => u.variation || u.name).join(", ")}` : ""} →
                </button>
              ) : null}
              {profit.ordersWithFees < profit.ordersTotal && (
                <p className="text-[10.5px] text-slate-400">
                  {profit.ordersWithFees} of {profit.ordersTotal} orders have payout data · Full sync fetches the rest
                </p>
              )}
            </div>
          )}
        </Card>
        <Card title="Best sellers · 30 days" right={<Muted>units</Muted>}>
          {!sellers.length ? (
            <p className="py-6 text-center text-xs text-slate-500">No sales in the last 30 days yet.</p>
          ) : (
            <div className="space-y-2.5">
              {sellers.map((p) => (
                <div key={p.name} className="text-[12.5px]">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-slate-800" title={p.name}>
                      {p.name}
                    </span>
                    <span className="tabular-nums text-slate-500">{p.units}</span>
                    <span className="w-20 text-right font-medium tabular-nums text-slate-900">{RM(p.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-navy dark:bg-sky-400" style={{ width: `${(p.units / maxUnits) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Returns & cancellations" right={s.returns?.open ? <Chip tone="amber">{s.returns.open} open</Chip> : <Chip tone="green">none open</Chip>}>
          <div className="divide-y divide-slate-100 text-[12.5px]">
            {recentReturns.map((r) => (
              <div key={`${r.platform}${r.id}`} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-800" title={r.items}>
                    {r.items || "Return"}
                    {r.reason ? ` · ${r.reason.replace(/_/g, " ").toLowerCase()}` : ""}
                  </div>
                  <Muted>
                    {r.platform === "shopee" ? "Shopee" : "Lazada"}
                    {r.dueAt && r.open ? ` · respond by ${new Date(r.dueAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}` : r.requestedAt ? ` · ${timeAgo(r.requestedAt)}` : ""}
                  </Muted>
                </div>
                <Chip tone={r.open ? "amber" : "green"}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
              </div>
            ))}
            <div className="flex items-center py-2">
              <div className="flex-1">
                <div className="text-slate-800">Cancelled today</div>
                <Muted>
                  {(["shopee", "lazada"] as const)
                    .filter((p) => s.byPlatform?.[p])
                    .map((p) => `${p === "shopee" ? "Shopee" : "Lazada"} ${s.byPlatform?.[p]?.cancelledToday ?? 0}`)
                    .join(" · ")}
                </Muted>
              </div>
              <b className="tabular-nums text-slate-900">{s.cancelledToday}</b>
            </div>
          </div>
        </Card>
      </div>

      {/* target · payouts · stock · coming up */}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1.15fr]">
        <Card
          title={`${now.toLocaleDateString("en-MY", { month: "long", timeZone: "Asia/Kuala_Lumpur" })} target`}
          right={
            target ? (
              <Chip tone={monthRev >= target ? "green" : monthRev >= expected * 0.97 ? "green" : monthRev >= expected * 0.85 ? "amber" : "red"}>
                {monthRev >= target ? "achieved 🎉" : monthRev >= expected * 0.97 ? "on track" : monthRev >= expected * 0.85 ? "slightly behind" : "behind"}
              </Chip>
            ) : null
          }
        >
          {!target || editTarget ? (
            <form
              className="flex flex-wrap items-center gap-2 py-4 text-xs text-slate-600"
              onSubmit={(e) => {
                e.preventDefault();
                const v = Number(new FormData(e.currentTarget).get("t"));
                if (v > 0) update({ salesTarget: Math.round(v) });
                setEditTarget(false);
              }}
            >
              Monthly sales goal RM
              <input name="t" type="number" min={1} defaultValue={target ?? ""} placeholder="30000" className="h-8 w-28 rounded-lg border border-slate-200 bg-panel px-2 text-sm text-slate-900" autoFocus={editTarget} />
              <button className="h-8 rounded-lg bg-navy px-3 text-xs font-semibold text-white">Save</button>
            </form>
          ) : (
            <div className="flex items-center gap-4">
              <svg width="96" height="96" viewBox="0 0 100 100" className="shrink-0" aria-hidden>
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="11" className="text-slate-100" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" className="text-navy dark:text-sky-400" strokeDasharray={`${tPct * 238.8} 238.8`} transform="rotate(-90 50 50)" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#93c5fd" strokeWidth="4" strokeDasharray={`1.6 238.8`} strokeDashoffset={-(Math.min(1, expected / target) * 238.8)} transform="rotate(-90 50 50)" />
                <text x="50" y="56" textAnchor="middle" fontSize="19" fontWeight="800" fill="currentColor" className="text-slate-900">
                  {Math.round((monthRev / target) * 100)}%
                </text>
              </svg>
              <div className="min-w-0 text-[12.5px] leading-relaxed">
                <div className="text-xl font-bold tabular-nums text-slate-900">{RM(monthRev)}</div>
                <div className="text-slate-500">
                  of {RM(target)}{" "}
                  <button onClick={() => setEditTarget(true)} className="align-middle text-slate-400 hover:text-slate-700" aria-label="Change target">
                    <Pencil className="inline h-3 w-3" />
                  </button>
                </div>
                {monthRev < target && daysInMonth > dayOfMonth && (
                  <div className="mt-1 text-slate-700">
                    Need <b>{RM(perDay)}/day</b> for {daysInMonth - dayOfMonth} day{daysInMonth - dayOfMonth === 1 ? "" : "s"}
                  </div>
                )}
                <Muted>light mark = where you should be today ({Math.round((expected / target) * 100)}%)</Muted>
              </div>
            </div>
          )}
        </Card>
        <Card title="Payouts · month to date" right={<Muted>after fees</Muted>}>
          {!s.profit ? (
            <p className="py-6 text-center text-xs text-slate-500">Payouts appear once payout data has synced.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-[12.5px]">
              {(["shopee", "lazada"] as const)
                .filter((p) => s.profit?.byPlatform?.[p])
                .map((p) => {
                  const f = s.profit!.byPlatform[p]!;
                  return (
                    <div key={p} className="flex items-center gap-2 py-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: p === "shopee" ? SHOPEE : LAZADA }} />
                      <div className="flex-1">
                        <div className="text-slate-800">{p === "shopee" ? "Shopee" : "Lazada"}</div>
                        <Muted>
                          {f.ordersWithFees}/{f.ordersTotal} orders settled
                        </Muted>
                      </div>
                      <b className="tabular-nums text-slate-900">{RM(f.net)}</b>
                    </div>
                  );
                })}
              <div className="flex items-center py-2">
                <div className="flex-1 text-slate-800">
                  Still to be paid out
                  <div>
                    <Muted>orders without payout data yet</Muted>
                  </div>
                </div>
                <Chip tone={s.profit.total.ordersTotal - s.profit.total.ordersWithFees > 0 ? "slate" : "green"}>
                  {s.profit.total.ordersTotal - s.profit.total.ordersWithFees > 0 ? `${s.profit.total.ordersTotal - s.profit.total.ordersWithFees} orders` : "all settled ✓"}
                </Chip>
              </div>
            </div>
          )}
        </Card>
        <Card title="Stock runway" right={<Muted>days left</Muted>}>
          {levels === null ? (
            <p className="py-6 text-center text-xs text-slate-500">Loading…</p>
          ) : !runway.length ? (
            <div className="py-5 text-center text-xs text-slate-500">
              Count your stock once to see how many days it lasts.
              <div>
                <button onClick={() => set({ dialog: "stock" })} className="mt-2 font-semibold text-navy hover:underline dark:text-sky-300">
                  Set up stock →
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-[12.5px]">
              {runway.map((l) => {
                const d = l.level === "out" ? 0 : (l.daysLeft ?? 0);
                const tone = d < 7 ? "text-red-600" : d < 14 ? "text-amber-700" : "text-slate-900";
                const bar = d < 7 ? "bg-red-500" : d < 14 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={l.name} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-slate-800">{l.name}</div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(100, (d / 30) * 100)}%` }} />
                      </div>
                    </div>
                    <b className={cn("w-10 text-right tabular-nums", tone)}>{l.level === "out" ? "out" : `${Math.round(d)} d`}</b>
                    {d < 14 && (
                      <button
                        onClick={() => {
                          try {
                            sessionStorage.setItem("ov:stock-section", "in");
                          } catch {}
                          set({ dialog: "stock" });
                        }}
                        className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", d < 7 ? "bg-navy text-white" : "bg-slate-100 text-slate-700")}
                      >
                        Reorder
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Coming up">
          <div className="divide-y divide-slate-100 text-[12.5px]">
            {coming.map((c) => (
              <button key={c.title} onClick={c.go} disabled={!c.go} className="flex w-full items-center gap-2 py-2 text-left disabled:cursor-default">
                <span className="text-base">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800">{c.title}</div>
                  {c.sub && <Muted>{c.sub}</Muted>}
                </div>
                <span className="whitespace-nowrap font-semibold tabular-nums text-slate-700">{c.when}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
