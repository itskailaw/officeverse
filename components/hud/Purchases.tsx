"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { displayOf, shortProduct, variationOf } from "@/lib/data/product-names";

type Plat = "shopee" | "lazada";
interface Item {
  name: string;
  model: string | null;
  sku?: string | null;
  qty: number;
}
interface Purchase {
  platform: Plat;
  id: string;
  status: string;
  at: string;
  items: Item[];
}
const NAME: Record<Plat, string> = { shopee: "Shopee", lazada: "Lazada" };
const DOT: Record<Plat, string> = { shopee: "#eb6834", lazada: "#2a78d6" };
type Range = "today" | "7" | "30" | "90" | "month" | "lastmonth" | "farid" | "all" | "custom";

/** What the buyer picked: the variation, or a short product name if there's none. */
export const variantOf = (i: { name: string; model: string | null }) => variationOf(i.model) || shortProduct(i.name, 60);
const klDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
const klDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const shiftDays = (d: string, n: number) => klDay(new Date(Date.parse(`${d}T12:00:00+08:00`) + n * 86400000).toISOString());
const STATUS_LABEL = (s: string) => {
  const u = s.toUpperCase();
  if (/SHIPPED|TO_CONFIRM_RECEIVE|DELIVERED|COMPLETED|CONFIRMED/.test(u)) return { text: "Shipped", tone: "text-emerald-700" };
  if (/RETURN|REFUND/.test(u)) return { text: "Returned", tone: "text-amber-700" };
  if (/READY_TO_SHIP|PROCESSED|PACKED|PENDING/.test(u)) return { text: "To ship", tone: "text-sky-700" };
  return { text: s.replace(/_/g, " ").toLowerCase(), tone: "text-slate-500" };
};

function csvDownload(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Order history for stock checking: any date range (incl. since Farid started), product totals, CSV downloads. Owner only. */
export function Purchases() {
  const open = useUI((s) => s.dialog === "purchases");
  const set = useUI((s) => s.set);
  const role = useLive((s) => s.status?.role);
  const today = klDay(new Date().toISOString());
  const [range, setRange] = useState<Range>("30");
  const [from, setFrom] = useState(shiftDays(today, -29));
  const [to, setTo] = useState(today);
  const [view, setView] = useState<"orders" | "totals">("orders");
  const [plat, setPlat] = useState<Plat | "all">("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ orders: Purchase[]; stock: { name: string; keys: string[] }[]; oldest: string | null; faridStart: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [farid, setFarid] = useState<string | null>(null);
  const [oldest, setOldest] = useState<string | null>(null);

  /** The date span a range means (Malaysia days, inclusive). */
  const span = useCallback(
    (r: Range): [string, string] => {
      const month = today.slice(0, 7);
      const prev = klDay(new Date(Date.parse(`${month}-01T12:00:00+08:00`) - 5 * 86400000).toISOString()).slice(0, 7);
      switch (r) {
        case "today":
          return [today, today];
        case "7":
        case "30":
        case "90":
          return [shiftDays(today, -(Number(r) - 1)), today];
        case "month":
          return [`${month}-01`, today];
        case "lastmonth":
          return [`${prev}-01`, shiftDays(`${month}-01`, -1)];
        case "farid":
          return [farid ? klDay(farid) : shiftDays(today, -29), today];
        case "all":
          return [oldest ? klDay(oldest) : shiftDays(today, -365), today];
        default:
          return [from, to];
      }
    },
    [today, farid, oldest, from, to],
  );

  const load = useCallback(async () => {
    setErr(null);
    setData(null);
    const [f, t] = span(range);
    try {
      const r = await fetch(`/api/purchases?from=${f}&to=${t}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setData(j);
      setFarid(j.faridStart ?? null);
      setOldest(j.oldest ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [range, span]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data?.stock ?? []) for (const k of s.keys) if (s.name.trim()) m.set(k, s.name.trim());
    return m;
  }, [data]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.orders ?? []).filter(
      (o) => (plat === "all" || o.platform === plat) && (!needle || o.id.toLowerCase().includes(needle) || o.items.some((i) => `${i.name} ${i.model ?? ""} ${i.sku ?? ""}`.toLowerCase().includes(needle))),
    );
  }, [data, plat, q]);
  const count = (p: Plat | "all") => (data?.orders ?? []).filter((o) => p === "all" || o.platform === p).length;
  const units = list.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0);

  /** Units per product variation (your Stock pack names where set), biggest first. */
  const totals = useMemo(() => {
    const m = new Map<string, { label: string; product: string; sku: string; shopee: number; lazada: number; orders: number }>();
    for (const o of list)
      for (const i of o.items) {
        const d = displayOf(i, names);
        const key = d.pack ? `pack:${d.main}` : `${d.sub}|${d.main}`;
        const row = m.get(key) ?? { label: d.main, product: d.pack ? "" : d.sub, sku: i.sku ?? "", shopee: 0, lazada: 0, orders: 0 };
        row[o.platform] += i.qty;
        row.orders += 1;
        m.set(key, row);
      }
    return [...m.values()].sort((a, b) => b.shopee + b.lazada - (a.shopee + a.lazada));
  }, [list, names]);

  const [f, t] = span(range);
  const file = (kind: string) => `orders-${kind}-${f}_to_${t}.csv`;
  const downloadOrders = () =>
    csvDownload(file("detail"), [
      ["Date (Malaysia)", "Platform", "Order ID", "Status", "Product", "Variation", "Pack name", "SKU", "Qty"],
      ...list.flatMap((o) =>
        o.items.map((i) => {
          const d = displayOf(i, names);
          return [klDateTime(o.at), NAME[o.platform], o.id, STATUS_LABEL(o.status).text, i.name, variationOf(i.model), d.pack ? d.main : "", i.sku ?? "", i.qty];
        }),
      ),
    ]);
  const downloadTotals = () =>
    csvDownload(file("totals"), [
      ["Item", "Product", "SKU", "Shopee units", "Lazada units", "Total units", "Orders"],
      ...totals.map((r) => [r.label, r.product, r.sku, r.shopee, r.lazada, r.shopee + r.lazada, r.orders]),
    ]);

  const RANGES: { v: Range; label: string }[] = [
    { v: "today", label: "Today" },
    { v: "7", label: "Last 7 days" },
    { v: "30", label: "Last 30 days" },
    { v: "90", label: "Last 90 days" },
    { v: "month", label: "This month" },
    { v: "lastmonth", label: "Last month" },
    { v: "farid", label: farid ? `Since Farid started (${new Date(farid).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })})` : "Since Farid started" },
    { v: "all", label: "Everything on record" },
    { v: "custom", label: "Custom dates…" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "purchases" : null })}>
      <DialogContent title="Order history" description="Every paid Shopee & Lazada order and what it took from stock — pick any dates, see product totals, download for Excel." className="h-[88vh] max-w-4xl" onBack={() => set({ dialog: "dashboard" })} backLabel="Dashboard">
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can see the order history.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
              <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="h-7 rounded-md border border-slate-200 bg-panel px-1.5 text-[11px] font-medium text-slate-700" aria-label="Date range">
                {RANGES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>
              {range === "custom" && (
                <span className="flex items-center gap-1 text-[11px] text-slate-500">
                  <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" />
                  to
                  <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" />
                </span>
              )}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["all", "shopee", "lazada"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlat(p)}
                    className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", plat === p ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}
                  >
                    {p !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />}
                    {p === "all" ? "All" : NAME[p]} {data ? `(${count(p)})` : ""}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    ["orders", "Orders"],
                    ["totals", "Product totals"],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", view === v ? "bg-navy text-white" : "text-slate-500")}>
                    {l}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[9rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, SKU or order ID" className="h-7 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px] text-slate-800" />
              </label>
              <Button size="sm" variant="ghost" onClick={() => void load()} title="Refresh">
                <RefreshCw />
              </Button>
              <Button size="sm" variant="outline" onClick={view === "orders" ? downloadOrders : downloadTotals} disabled={!list.length} title="Download as CSV (opens in Excel)">
                <Download /> {view === "orders" ? "Orders CSV" : "Totals CSV"}
              </Button>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {err && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{err}</div>}
              {!data && !err && (
                <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
                </div>
              )}
              {data && !list.length && <p className="p-10 text-center text-xs text-slate-500">No orders in this range.</p>}
              {list.length > 0 && view === "orders" && (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
                    <tr>
                      <th className="px-5 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Platform</th>
                      <th className="px-3 py-2 font-medium">Order ID</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 pr-5 font-medium">What they bought</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((o) => {
                      const st = STATUS_LABEL(o.status);
                      return (
                        <tr key={`${o.platform}:${o.id}`} className="align-top hover:bg-slate-50/70">
                          <td className="whitespace-nowrap px-5 py-2 tabular-nums text-slate-600">{klDateTime(o.at)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                              <span className="h-2 w-2 rounded-full" style={{ background: DOT[o.platform] }} />
                              {NAME[o.platform]}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <button
                              className="font-mono text-[11px] text-slate-800 hover:underline"
                              title="Copy order ID"
                              onClick={() => {
                                void navigator.clipboard?.writeText(o.id);
                                useUI.getState().toast("success", `Copied ${o.id}`);
                              }}
                            >
                              {o.id}
                            </button>
                          </td>
                          <td className={cn("whitespace-nowrap px-3 py-2 font-medium", st.tone)}>{st.text}</td>
                          <td className="px-3 py-2 pr-5 text-slate-700">
                            {o.items.length ? (
                              <ul className="space-y-0.5">
                                {o.items.map((i, n) => (
                                  <li key={n} title={i.model ? `${i.name} — ${i.model}` : i.name}>
                                    <span className="font-semibold text-slate-900">{i.qty}×</span> {displayOf(i, names).main}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-400">Items not synced yet</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {list.length > 0 && view === "totals" && (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
                    <tr>
                      <th className="px-5 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Shopee</th>
                      <th className="px-3 py-2 text-right font-medium">Lazada</th>
                      <th className="px-3 py-2 text-right font-medium">Total units</th>
                      <th className="px-3 py-2 pr-5 text-right font-medium">Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {totals.map((r) => (
                      <tr key={`${r.product}|${r.label}`} className="hover:bg-slate-50/70">
                        <td className="px-5 py-2">
                          <div className="font-medium text-slate-900">{r.label}</div>
                          {r.product && <div className="text-[11px] text-slate-500">{r.product}</div>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.shopee || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.lazada || "—"}</td>
                        <td className="px-3 py-2 text-right text-sm font-bold tabular-nums text-slate-900">{r.shopee + r.lazada}</td>
                        <td className="px-3 py-2 pr-5 text-right tabular-nums text-slate-500">{r.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
              {f === t ? new Date(`${f}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : `${new Date(`${f}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(`${t}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`}
              {data && ` · ${list.length} order${list.length === 1 ? "" : "s"} · ${units} item${units === 1 ? "" : "s"}`} · cancelled & unpaid orders aren&apos;t counted
              {oldest && ` · records start ${new Date(oldest).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
