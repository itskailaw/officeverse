"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw, Search } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Plat = "shopee" | "lazada";
interface Purchase {
  platform: Plat;
  id: string;
  at: string;
  items: { name: string; model: string | null; qty: number }[];
}
const NAME: Record<Plat, string> = { shopee: "Shopee", lazada: "Lazada" };
const DOT: Record<Plat, string> = { shopee: "#eb6834", lazada: "#2a78d6" };
const RANGES = [
  { v: 1, label: "Today" },
  { v: 7, label: "Last 7 days" },
  { v: 30, label: "Last 30 days" },
  { v: 90, label: "Last 90 days" },
];
const itemText = (i: Purchase["items"][number]) => `${i.name}${i.model ? ` (${i.model})` : ""} × ${i.qty}`;
const klDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));

/** Purchase list: platform · order ID · what was bought. Owner only. */
export function Purchases() {
  const open = useUI((s) => s.dialog === "purchases");
  const set = useUI((s) => s.set);
  const role = useLive((s) => s.status?.role);
  const [days, setDays] = useState(30);
  const [plat, setPlat] = useState<Plat | "all">("all");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<Purchase[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setOrders(null);
    try {
      const r = await fetch(`/api/purchases?days=${days}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setOrders(j.orders);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [days]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // "Today" means today in Malaysia, not the last 24 hours
    const today = klDay(new Date().toISOString());
    return (orders ?? []).filter(
      (o) =>
        (plat === "all" || o.platform === plat) &&
        (days !== 1 || klDay(o.at) === today) &&
        (!needle || o.id.toLowerCase().includes(needle) || o.items.some((i) => itemText(i).toLowerCase().includes(needle))),
    );
  }, [orders, plat, q, days]);
  const count = (p: Plat | "all") => (orders ?? []).filter((o) => p === "all" || o.platform === p).length;

  const download = () => {
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ["Platform,Order ID,What they bought", ...list.map((o) => [NAME[o.platform], o.id, o.items.map(itemText).join("; ")].map(cell).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchases-${klDay(new Date().toISOString())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "purchases" : null })}>
      <DialogContent title="Purchase list" description="What each order bought — Shopee and Lazada, newest first." className="h-[85vh] max-w-3xl">
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can see the purchase list.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["all", "shopee", "lazada"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlat(p)}
                    className={cn("flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium", plat === p ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}
                  >
                    {p !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />}
                    {p === "all" ? "All" : NAME[p]} {orders && days !== 1 ? `(${count(p)})` : ""}
                  </button>
                ))}
              </div>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-7 rounded-md border border-slate-200 bg-panel px-1.5 text-[11px] font-medium text-slate-700"
                aria-label="Date range"
              >
                {RANGES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>
              <label className="relative min-w-[10rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search product or order ID"
                  className="h-7 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px] text-slate-800"
                />
              </label>
              <Button size="sm" variant="ghost" onClick={() => void load()} title="Refresh">
                <RefreshCw />
              </Button>
              <Button size="sm" variant="outline" onClick={download} disabled={!list.length} title="Download as CSV (opens in Excel)">
                <Download /> CSV
              </Button>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {err && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{err}</div>}
              {!orders && !err && (
                <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
                </div>
              )}
              {orders && !list.length && <p className="p-10 text-center text-xs text-slate-500">No orders match.</p>}
              {list.length > 0 && (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-panel text-[11px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
                    <tr>
                      <th className="px-5 py-2 font-medium">Platform</th>
                      <th className="px-3 py-2 font-medium">Order ID</th>
                      <th className="px-3 py-2 pr-5 font-medium">What they bought</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {list.map((o) => (
                      <tr key={`${o.platform}:${o.id}`} className="align-top hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-5 py-2">
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
                        <td className="px-3 py-2 pr-5 text-slate-700">
                          {o.items.length ? (
                            <ul className="space-y-0.5">
                              {o.items.map((i, n) => (
                                <li key={n}>
                                  <span className="font-semibold text-slate-900">{i.qty}×</span> {i.name}
                                  {i.model && <span className="text-slate-500"> · {i.model}</span>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-slate-400">Items not synced yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {list.length > 0 && (
              <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
                {list.length} order{list.length === 1 ? "" : "s"} · {list.reduce((n, o) => n + o.items.reduce((m, i) => m + i.qty, 0), 0)} items · cancelled & unpaid orders hidden
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
