"use client";

import type { LiveSummary } from "@/lib/integrations/client";
import { formatMYR } from "@/lib/data/demo";
import { CountUp } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

export type DetailKind = "revenue" | "orders" | "profit" | "ads";
const SHOPEE = "#eb6834";
const LAZADA = "#2a78d6";
const RM = (n: number) => formatMYR(n);

interface Props {
  kind: DetailKind;
  s: LiveSummary;
  range: "today" | "7" | "30" | "month";
  cur: { revenue: number; orders: number };
  deltaText?: string | null;
  ads: { total: number; rows: { label: string; value: number; color: string }[] };
  onAddAds: () => void;
}

/** What a dashboard tile opens into: the big number, day by day, Shopee vs Lazada, and the details behind it. */
export function KpiDetail({ kind, s, range, cur, deltaText, ads, onAddAds }: Props) {
  const n = range === "30" ? 30 : range === "month" ? Math.max(1, Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(8, 10))) : 14;
  const days = (s.days ?? []).slice(-n);
  const profit = s.profit?.total ?? null;
  const period = range === "today" ? "today" : "monthToDate";
  const periodLabel = range === "today" ? "today" : "this month";

  const head: Record<DetailKind, { title: string; value: number; fmt: (n: number) => string; sub: string }> = {
    revenue: { title: "Revenue", value: cur.revenue, fmt: RM, sub: deltaText ?? `${range === "today" ? "today" : range === "month" ? "this month" : `last ${range} days`}` },
    orders: { title: "Orders", value: cur.orders, fmt: (x) => String(Math.round(x)), sub: cur.orders ? `average order ${RM(cur.revenue / cur.orders)}` : "no orders yet" },
    profit: { title: "Net profit · month", value: profit?.estProfit ?? 0, fmt: RM, sub: profit?.margin != null ? `${profit.margin.toFixed(1)}% margin · ${profit.ordersWithFees} of ${profit.ordersTotal} orders settled` : "needs payout data" },
    ads: { title: "Ad spend · month", value: ads.total, fmt: RM, sub: "keyed in + Lazada synced" },
  };
  const h = head[kind];

  const bars =
    kind === "revenue" || kind === "orders"
      ? days.map((d) => ({ label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7), v: kind === "orders" ? d.orders : d.revenue }))
      : kind === "ads"
        ? null
        : null;
  const mx = Math.max(1, ...(bars ?? []).map((b) => b.v));

  const split =
    kind === "revenue"
      ? { a: days.reduce((x, d) => x + (d.shopee ?? d.revenue), 0), b: days.reduce((x, d) => x + (d.lazada ?? 0), 0), label: `last ${days.length} days`, fmt: RM }
      : kind === "orders"
        ? { a: s.byPlatform?.shopee?.[period].orders ?? 0, b: s.byPlatform?.lazada?.[period].orders ?? 0, label: periodLabel, fmt: (x: number) => String(x) }
        : kind === "profit"
          ? { a: s.profit?.byPlatform?.shopee?.estProfit ?? 0, b: s.profit?.byPlatform?.lazada?.estProfit ?? 0, label: "profit by platform", fmt: RM }
          : null;
  const tot = split ? Math.max(1, split.a + split.b) : 1;

  const rows: [string, string][] =
    kind === "revenue"
      ? (s.bestSellers30d ?? []).slice(0, 5).map((b) => [b.name, RM(b.revenue)])
      : kind === "orders"
        ? [
            ["Today", String(s.today.orders)],
            ["Yesterday", String(s.yesterday.orders)],
            ["This month", String(s.monthToDate.orders)],
            ["Cancelled today", String(s.cancelledToday)],
            ["To ship now", String(s.toPack.total)],
          ]
        : kind === "profit" && profit
          ? [
              ["Sales (settled orders)", RM(profit.gross)],
              ["Marketplace fees", `− ${RM(profit.fees < 0 ? -profit.fees : profit.fees)}`],
              ["Product cost", `− ${RM(profit.productCost)}`],
              ["Ads", `− ${RM(profit.adSpend)}`],
              ["Net profit", RM(profit.estProfit)],
            ]
          : kind === "ads"
            ? ads.rows.map((r) => [r.label, RM(r.value)])
            : [];

  return (
    <div className="pr-8">
      <div className="text-[13px] font-semibold text-slate-500">{h.title}</div>
      <div className="mt-1 text-[38px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">
        <CountUp value={h.value} format={h.fmt} ms={900} />
      </div>
      <div className="mt-1.5 text-xs text-slate-500">{h.sub}</div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          {bars ? (
            <>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">Day by day</div>
              <div className="flex h-40 items-end gap-1 border-b border-slate-200">
                {bars.map((b, i) => (
                  <div
                    key={b.label}
                    title={`${b.label}: ${kind === "orders" ? b.v : RM(b.v)}`}
                    className={cn("flex-1 origin-bottom scale-y-0 rounded-t-md transition-transform duration-500 ease-[cubic-bezier(.2,.9,.3,1.15)] group-data-[open=1]:scale-y-100", i === bars.length - 1 ? "bg-emerald-500" : "bg-navy dark:bg-sky-400")}
                    style={{ height: `${Math.max(3, (b.v / mx) * 100)}%`, transitionDelay: `${i * 22}ms` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-1 text-[9.5px] text-slate-400">
                {bars.map((b, i) => (
                  <span key={b.label} className="flex-1 text-center">
                    {bars.length <= 14 || i % 3 === 0 ? b.label.slice(0, 2) : ""}
                  </span>
                ))}
              </div>
            </>
          ) : kind === "ads" ? (
            <>
              <div className="mb-2 text-xs font-semibold text-slate-700">By channel</div>
              <div className="space-y-2.5">
                {ads.rows.map((r, i) => (
                  <div key={r.label} className="grid grid-cols-[9rem_1fr_5rem] items-center gap-2 text-xs">
                    <span className="truncate text-slate-700">{r.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full origin-left scale-x-0 rounded-full transition-transform duration-700 group-data-[open=1]:scale-x-100" style={{ width: `${(r.value / Math.max(1, ads.total)) * 100}%`, background: r.color, transitionDelay: `${200 + i * 90}ms` }} />
                    </span>
                    <b className="text-right tabular-nums text-slate-900">{RM(r.value)}</b>
                  </div>
                ))}
                {!ads.rows.length && <p className="text-xs text-slate-500">Nothing keyed in this month yet.</p>}
              </div>
              <button type="button" onClick={onAddAds} className="mt-4 h-8 rounded-lg bg-navy px-3 text-xs font-semibold text-white hover:bg-navy/90">
                ＋ Key in ad spend
              </button>
            </>
          ) : (
            <>
              <div className="mb-2 text-xs font-semibold text-slate-700">Where the money went</div>
              {profit ? (
                <div className="space-y-2">
                  {(
                    [
                      ["Sales", profit.gross, "bg-navy dark:bg-sky-400", 0],
                      ["Fees", -Math.abs(profit.fees), "bg-red-400", profit.gross - Math.abs(profit.fees)],
                      ["Product cost", -profit.productCost, "bg-orange-400", profit.gross - Math.abs(profit.fees) - profit.productCost],
                      ["Ads", -profit.adSpend, "bg-amber-400", profit.estProfit],
                      ["Net profit", profit.estProfit, "bg-emerald-500", 0],
                    ] as const
                  ).map(([label, v, color, start], i) => (
                    <div key={label} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs">
                      <span className="text-slate-600">{label}</span>
                      <span className="relative h-3">
                        <span
                          className={cn("absolute h-3 origin-left scale-x-0 rounded transition-transform duration-700 group-data-[open=1]:scale-x-100", color)}
                          style={{ left: `${v < 0 ? (Math.max(0, start) / (profit.gross || 1)) * 100 : 0}%`, width: `${Math.max(0.8, (Math.abs(v) / (profit.gross || 1)) * 100)}%`, transitionDelay: `${150 + i * 160}ms` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Profit appears once payout data has synced.</p>
              )}
            </>
          )}
        </div>
        <div className="min-w-0">
          {split && (
            <>
              <div className="text-xs font-semibold text-slate-700">Shopee vs Lazada · {split.label}</div>
              <div className="my-2 flex h-3.5 overflow-hidden rounded-full bg-slate-100">
                <span className="h-full origin-left scale-x-0 transition-transform duration-700 group-data-[open=1]:scale-x-100" style={{ width: `${(Math.max(0, split.a) / tot) * 100}%`, background: SHOPEE, transitionDelay: "250ms" }} />
                <span className="h-full origin-left scale-x-0 transition-transform duration-700 group-data-[open=1]:scale-x-100" style={{ width: `${(Math.max(0, split.b) / tot) * 100}%`, background: LAZADA, transitionDelay: "450ms" }} />
              </div>
              <div className="flex justify-between text-[11.5px] text-slate-600">
                <span>Shopee {split.fmt(split.a)}</span>
                <span>Lazada {split.fmt(split.b)}</span>
              </div>
            </>
          )}
          <div className="mt-4">
            {kind === "revenue" && <div className="mb-1 text-xs font-semibold text-slate-700">Best sellers · 30 days</div>}
            {rows.map(([k, v], i) => (
              <div
                key={k}
                className="flex translate-x-[-8px] justify-between gap-3 border-b border-slate-100 py-1.5 text-[12.5px] opacity-0 transition-[opacity,transform] duration-300 group-data-[open=1]:translate-x-0 group-data-[open=1]:opacity-100"
                style={{ transitionDelay: `${300 + i * 60}ms` }}
              >
                <span className="truncate text-slate-700">{k}</span>
                <b className="shrink-0 tabular-nums text-slate-900">{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
