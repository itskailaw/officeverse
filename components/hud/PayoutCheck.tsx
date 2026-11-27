"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { payoutCsv, payoutTotals, STATE_LABEL, type PayoutRow, type PayoutState } from "@/lib/data/payouts";
import { cn } from "@/lib/utils";

const DOT = { shopee: "#eb6834", lazada: "#2a78d6" } as const;
const RM = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const klMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(0, 7);
const day = (iso: string) => new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short" }).format(new Date(iso));
const TONE: Record<PayoutState, string> = {
  final: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  estimate: "bg-sky-50 text-sky-700 ring-sky-200",
  waiting: "bg-amber-50 text-amber-800 ring-amber-200",
  unshipped: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Per-order payouts for a month, to compare with Shopee My Income and Lazada Account Statements. */
export function PayoutCheck() {
  const open = useUI((s) => s.dialog === "payouts");
  const set = useUI((s) => s.set);
  const role = useLive((s) => s.status?.role);
  const [month, setMonth] = useState(klMonth);
  const [plat, setPlat] = useState<"all" | "shopee" | "lazada">("all");
  const [state, setState] = useState<PayoutState | "all">("all");
  const [data, setData] = useState<{ rows: PayoutRow[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/payouts?month=${month}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const inPlat = useMemo(() => (data?.rows ?? []).filter((r) => plat === "all" || r.platform === plat), [data, plat]);
  const rows = useMemo(() => inPlat.filter((r) => state === "all" || r.state === state), [inPlat, state]);
  const t = useMemo(() => payoutTotals(inPlat), [inPlat]);

  const download = () => {
    const blob = new Blob(["﻿" + payoutCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payout-check-${month}${plat === "all" ? "" : `-${plat}`}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "payouts" : null })}>
      <DialogContent
        title="Payout check"
        description="Every paid order this month: what the buyer paid, the marketplace fees and what you're paid. Compare with Shopee → My Income and Lazada → Account Statements."
        className="h-[88vh] max-w-5xl"
        onBack={() => set({ dialog: "dashboard" })}
        backLabel="Dashboard"
      >
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can see payouts.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
              <input type="month" value={month} max={klMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-panel px-1.5 text-xs text-slate-800" aria-label="Month" />
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["all", "shopee", "lazada"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlat(p)}
                    className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium", plat === p ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}
                  >
                    {p !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />}
                    {p === "all" ? "All" : p === "shopee" ? "Shopee" : "Lazada"}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reload
                </button>
                <button type="button" onClick={download} disabled={!rows.length} className="inline-flex h-8 items-center gap-1 rounded-lg bg-navy px-2.5 text-xs font-semibold text-white hover:bg-navy/90 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> Download CSV
                </button>
              </div>
            </div>

            {/* totals */}
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-5">
              {(
                [
                  ["Sales (settled orders)", t.grossWithPayout, `of RM ${RM(t.gross)} total sales`],
                  ["Marketplace fees", t.fees, t.grossWithPayout ? `${((-t.fees / t.grossWithPayout) * 100).toFixed(1)}% of sales` : ""],
                  ["Payout", t.net, "what you're paid"],
                  ["Product cost", -t.cost, "settled orders"],
                  ["Profit before ads", t.net - t.cost, "payout − product cost"],
                ] as const
              ).map(([label, v, sub]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                  <div className="text-[10.5px] font-semibold text-slate-500">{label}</div>
                  <div className={cn("text-base font-bold tabular-nums", v < 0 ? "text-red-600" : "text-slate-900")}>RM {RM(v)}</div>
                  <div className="text-[10px] text-slate-400">{sub}</div>
                </div>
              ))}
            </div>

            {/* states */}
            <div className="flex flex-wrap items-center gap-1.5 px-5 py-2 text-[11px]">
              <button type="button" onClick={() => setState("all")} className={cn("rounded-full px-2 py-0.5 font-semibold ring-1", state === "all" ? "bg-navy text-white ring-navy" : "bg-panel text-slate-600 ring-slate-200")}>
                All {t.orders}
              </button>
              {(Object.keys(STATE_LABEL) as PayoutState[]).map((s) => (
                <button key={s} type="button" onClick={() => setState(s)} className={cn("rounded-full px-2 py-0.5 font-semibold ring-1", state === s ? "bg-navy text-white ring-navy" : TONE[s])}>
                  {STATE_LABEL[s]} {t.byState[s]}
                </button>
              ))}
              <span className="ml-auto text-slate-400">Estimate = Shopee&apos;s figure before the order completes · Lazada posts payouts a few days after delivery</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              {err ? (
                <p className="py-8 text-center text-xs text-red-600">{err}</p>
              ) : !data ? (
                <p className="py-8 text-center text-xs text-slate-500">Loading…</p>
              ) : !rows.length ? (
                <p className="py-8 text-center text-xs text-slate-500">No orders here.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-panel text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="py-1.5 font-semibold">Date</th>
                      <th className="font-semibold">Order</th>
                      <th className="font-semibold">Items</th>
                      <th className="text-right font-semibold">Sales</th>
                      <th className="text-right font-semibold">Fees</th>
                      <th className="text-right font-semibold">Payout</th>
                      <th className="pl-3 font-semibold">Payout data</th>
                      <th className="text-right font-semibold">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = `${r.platform}-${r.id}`;
                      const fees = Object.entries(r.fees);
                      return (
                        <Fragment key={k}>
                          <tr onClick={() => setOpenRow(openRow === k ? null : k)} className={cn("cursor-pointer border-b border-slate-100 hover:bg-slate-50", openRow === k && "bg-slate-50")}>
                            <td className="py-1.5 whitespace-nowrap text-slate-500">{day(r.at)}</td>
                            <td className="whitespace-nowrap font-mono text-[11px] text-slate-700">
                              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOT[r.platform] }} />
                              {r.id}
                            </td>
                            <td className="max-w-[16rem] truncate text-slate-700" title={r.items}>
                              {r.items}
                            </td>
                            <td className="text-right tabular-nums text-slate-900">{RM(r.gross)}</td>
                            <td className="text-right tabular-nums text-red-600">{r.net != null ? RM(r.net - r.gross) : ""}</td>
                            <td className="text-right font-semibold tabular-nums text-slate-900">{r.net != null ? RM(r.net) : "—"}</td>
                            <td className="pl-3">
                              <span className={cn("whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1", TONE[r.state])}>{STATE_LABEL[r.state]}</span>
                            </td>
                            <td className="text-right tabular-nums text-slate-500">{r.cost != null ? RM(r.cost) : "?"}</td>
                          </tr>
                          {openRow === k && (
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <td colSpan={8} className="px-3 pb-2 pt-1 text-[11px] text-slate-600">
                                <div>
                                  {r.items} · status {r.status}
                                </div>
                                {fees.length ? (
                                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                                    {fees.map(([n, v]) => (
                                      <span key={n}>
                                        {n}: <b className={v < 0 ? "text-red-600" : "text-emerald-700"}>RM {RM(v)}</b>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-slate-400">No fee breakdown yet.</div>
                                )}
                                {r.cost == null && <div className="mt-1 text-amber-700">Some items have no product cost — set them in Stock → Product costs.</div>}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
