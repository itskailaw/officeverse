"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { enqueueTask } from "@/lib/ai/runner";
import { applyChange, economics, monthlyImpact, priceForMargin, priceForNewMargin, roundPrice, type Change, type Rounding } from "@/lib/data/pricing";
import { CountUp, EmptyState, SkeletonRows } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

type Plat = "shopee" | "lazada";
interface Row {
  platform: Plat;
  itemId: string;
  variantId: string;
  name: string;
  variation: string;
  sku: string | null;
  price: number;
  current: number;
  key: string;
  cost: number | null;
  costMissing: string[];
  units30: number;
}
interface Data {
  rows: Row[];
  fee: Record<Plat, { rate: number | null; orders: number }>;
  adsMonth: number;
  unitsMonth: number;
  warnings: string[];
}
const DOT: Record<Plat, string> = { shopee: "#eb6834", lazada: "#2a78d6" };
const RM = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (m: number | null) => (m == null ? "—" : `${(m * 100).toFixed(1)}%`);
const rid = (r: Pick<Row, "platform" | "itemId" | "variantId">) => `${r.platform}:${r.itemId}:${r.variantId}`;
/** Used when a platform has no settled orders yet to learn its real fees from. */
const FALLBACK_FEE: Record<Plat, number> = { shopee: 0.2, lazada: 0.18 };

/** Prices: see the profit on every variation, work out the price for your target margin, and update Shopee / Lazada. */
export function PriceStudio() {
  const open = useUI((s) => s.dialog === "prices");
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const role = useLive((s) => s.status?.role);
  const pricing = useOffice((s) => s.settings.pricing);
  const update = useOffice((s) => s.updateSettings);
  const target = (pricing?.targetMargin ?? 25) / 100;
  const includeAds = pricing?.includeAds ?? true;
  const rounding: Rounding = pricing?.rounding ?? "90";
  const setP = (patch: Partial<{ targetMargin: number; includeAds: boolean; rounding: Rounding }>) => update({ pricing: { targetMargin: pricing?.targetMargin ?? 25, includeAds, rounding, ...patch } });

  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [plat, setPlat] = useState<"all" | Plat>("all");
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; message?: string }>>({});
  const [bulk, setBulk] = useState<{ kind: Change["kind"]; value: string }>({ kind: "pct", value: "5" });

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/prices", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open && !data) void load();
  }, [open, data, load]);

  const adPerUnit = includeAds && data && data.unitsMonth > 0 ? data.adsMonth / data.unitsMonth : 0;
  const rate = (p: Plat) => data?.fee[p].rate ?? FALLBACK_FEE[p];

  const calc = useMemo(
    () =>
      (data?.rows ?? []).map((r) => {
        const fr = rate(r.platform);
        const now = economics(r.current, r.cost, fr, adPerUnit);
        const suggested = r.cost == null ? null : priceForMargin(r.cost, fr, target, adPerUnit);
        const goal = suggested == null ? null : roundPrice(suggested, rounding);
        // a discount / promotion is running: buyers pay the promo price, which a normal-price change doesn't touch
        const promo = r.current < r.price - 0.005;
        const next = draft[rid(r)];
        const after = next != null ? economics(promo ? Math.min(next, r.current) : next, r.cost, fr, adPerUnit) : null;
        return { r, fr, now, goal, next, after, promo, low: now.margin != null && now.margin < target };
      }),
    [data, draft, target, rounding, adPerUnit], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const shown = calc.filter(({ r, low }) => (plat === "all" || r.platform === plat) && (!onlyLow || low) && (!q.trim() || `${r.name} ${r.variation} ${r.sku ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  // summary (weighted by units sold in the last 30 days)
  const sum = useMemo(() => {
    let rev = 0, prof = 0, profNew = 0, costed = 0, below = 0, unc = 0, promos = 0;
    for (const c of calc) {
      if (c.r.cost == null) {
        unc++;
        continue;
      }
      costed++;
      if (c.low) below++;
      if (c.promo) promos++;
      rev += c.r.units30 * c.r.current;
      prof += c.r.units30 * c.now.profit;
      profNew += c.r.units30 * (c.after?.profit ?? c.now.profit);
    }
    return { margin: rev > 0 ? prof / rev : null, prof, profNew, below, costed, unc, promos };
  }, [calc]);
  const changes = calc.filter((c) => c.next != null && Math.abs(c.next - c.r.price) >= 0.01);

  const setDraftFor = (ids: string[], fn: (c: (typeof calc)[number]) => number | null) => {
    setDraft((d) => {
      const n = { ...d };
      for (const c of calc) {
        const k = rid(c.r);
        if (!ids.includes(k)) continue;
        const v = fn(c);
        if (v != null && v > 0) n[k] = Math.round(v * 100) / 100;
      }
      return n;
    });
  };
  const selected = [...sel];
  const useTarget = (ids: string[]) => {
    const promos = calc.filter((c) => ids.includes(rid(c.r)) && c.promo).length;
    // only raise prices that are below target; never cut a price that already meets it
    setDraftFor(ids, (c) => (c.promo || c.goal == null || c.goal <= c.r.price ? null : c.goal));
    if (promos) toast("info", `${promos} item${promos > 1 ? "s are" : " is"} on discount — raise the discount price in ${"Seller Centre"} instead (the normal price doesn't change what buyers pay)`);
  };
  const applyBulk = () => {
    const v = Number(bulk.value);
    if (!Number.isFinite(v)) return toast("error", "Enter a number");
    setDraftFor(selected, (c) => c.promo ? null : roundPrice(applyChange(c.next ?? c.r.price, { kind: bulk.kind, value: v } as Change), bulk.kind === "set" ? "none" : rounding));
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { changes: changes.map((c) => ({ platform: c.r.platform, itemId: c.r.itemId, variantId: c.r.variantId, sku: c.r.sku, price: c.next!, old: c.r.price })) };
      const r = await fetch("/api/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { results?: { platform: Plat; itemId: string; variantId: string; ok: boolean; message?: string }[]; error?: string };
      if (!r.ok || !j.results) throw new Error(j.error ?? `Update failed (${r.status})`);
      const res: Record<string, { ok: boolean; message?: string }> = {};
      for (const x of j.results) res[`${x.platform}:${x.itemId}:${x.variantId}`] = { ok: x.ok, message: x.message };
      setResults(res);
      const ok = changes.filter((c) => res[rid(c.r)]?.ok);
      const bad = changes.length - ok.length;
      if (ok.length) {
        useOffice.getState().recordAudit("update_prices", "listing", null, ok.map((c) => `${c.r.platform === "shopee" ? "Shopee" : "Lazada"} ${c.r.name}${c.r.variation ? ` (${c.r.variation})` : ""}: ${RM(c.r.price)} → ${RM(c.next!)}`).join("; "));
        // reflect the new prices here
        setData((d) => (d ? { ...d, rows: d.rows.map((x) => (ok.some((c) => rid(c.r) === rid(x)) ? { ...x, price: draft[rid(x)], current: x.current === x.price ? draft[rid(x)] : x.current } : x)) } : d));
        setDraft((d) => {
          const n = { ...d };
          for (const c of ok) delete n[rid(c.r)];
          return n;
        });
      }
      toast(bad ? "error" : "success", bad ? `${ok.length} updated · ${bad} refused — see the rows marked in red` : `${ok.length} price${ok.length > 1 ? "s" : ""} updated on the marketplace`);
      if (!bad) setReview(false);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const csv = () => {
    const head = ["Platform", "Product", "Variation", "SKU", "Sold 30d", "Cost", "Price", "Buyer pays", "Fees", "Profit", "Margin", `Price for ${Math.round(target * 100)}%`, "New price", "New profit", "New margin"];
    const lines = calc.map(({ r, now, goal, next, after }) => [r.platform, r.name, r.variation, r.sku ?? "", r.units30, r.cost ?? "", r.price, r.current, now.fees, now.profit, now.margin == null ? "" : (now.margin * 100).toFixed(1) + "%", goal ?? "", next ?? "", after?.profit ?? "", after?.margin == null ? "" : (after.margin * 100).toFixed(1) + "%"]);
    const text = [head, ...lines].map((l) => l.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = "prices.csv";
    a.click();
  };

  const askDaniel = () => {
    const emp = useOffice.getState().employees.find((e) => e.id === "emp-ads" && e.active) ?? useOffice.getState().employees.find((e) => e.id === "emp-strat" && e.active);
    if (!emp) return toast("error", "No pricing person on the team");
    const lines = calc
      .filter((c) => c.r.cost != null)
      .slice(0, 40)
      .map((c) => `${c.r.platform} | ${c.r.name}${c.r.variation ? ` (${c.r.variation})` : ""} | sold30 ${c.r.units30} | cost ${c.r.cost} | price ${c.r.price} | buyer pays ${c.r.current} | fee ${(c.fr * 100).toFixed(1)}% | profit ${c.now.profit} | margin ${pct(c.now.margin)} | price for target ${c.goal ?? "n/a"}`)
      .join("\n");
    const res = useOffice.getState().assignTask({
      employeeId: emp.id,
      title: `Pricing review: reach ${Math.round(target * 100)}% margin`,
      instructions: `The CEO wants at least ${Math.round(target * 100)}% margin after marketplace fees, product cost${includeAds ? " and ads" : ""}. Current weighted margin: ${pct(sum.margin)}. Ad cost per unit used: RM ${adPerUnit.toFixed(2)}. Fee rates: Shopee ${(rate("shopee") * 100).toFixed(1)}%, Lazada ${(rate("lazada") * 100).toFixed(1)}%.\n\nVariations (best sellers first):\n${lines}\n\nRecommend a new price for each variation that is below target, keeping best sellers competitive (consider raising slow sellers more and best sellers less, bundling, or cutting ad spend instead). Flag items that can't reach the target at any sensible price (cost too high) and suggest what to do (supplier price, bundle, discontinue). Give a table: product, variation, platform, current price, recommended price, new margin, and a one-line reason. Also estimate the monthly profit change if volumes hold. Do not change any prices yourself.`,
      priority: "high",
    });
    if (res.ok && res.id) {
      enqueueTask(res.id);
      toast("success", `${emp.name.split(" ")[0]} is reviewing your prices — the report will appear in Tasks`);
    }
  };

  const allShown = shown.length > 0 && shown.every((c) => sel.has(rid(c.r)));
  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "prices" : null })}>
      <DialogContent
        title="Prices & margin"
        description="Your profit on every variation after marketplace fees, product cost and ads — and the price you need to hit your target margin. Changes go to Shopee / Lazada only after you confirm."
        className="h-[90vh] max-w-6xl"
        onBack={() => set({ dialog: "dashboard" })}
        backLabel="Dashboard"
      >
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can see and change prices.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <QuickCalc defaultFee={Math.round(rate("shopee") * 1000) / 10} rounding={rounding} />
            {/* settings */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-2.5 text-xs">
              <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                Target margin
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={Math.round(target * 100)}
                  onChange={(e) => setP({ targetMargin: Math.max(1, Math.min(80, Number(e.target.value) || 25)) })}
                  className="h-8 w-16 rounded-md border border-slate-200 bg-panel px-2 text-right text-sm text-slate-900"
                />
                %
              </label>
              <label className="flex items-center gap-1.5 text-slate-600" title="Spread this month's ad spend over the units sold this month">
                <input type="checkbox" checked={includeAds} onChange={(e) => setP({ includeAds: e.target.checked })} />
                Count ads ({data ? `RM ${(data.unitsMonth > 0 ? data.adsMonth / data.unitsMonth : 0).toFixed(2)} per unit` : "…"})
              </label>
              <label className="flex items-center gap-1.5 text-slate-600">
                Round to
                <select value={rounding} onChange={(e) => setP({ rounding: e.target.value as Rounding })} className="h-8 rounded-md border border-slate-200 bg-panel px-1.5 text-xs text-slate-800">
                  <option value="90">RM xx.90</option>
                  <option value="99">RM xx.99</option>
                  <option value="whole">Whole ringgit</option>
                  <option value="none">Exact</option>
                </select>
              </label>
              <span className="text-slate-500">
                Fees (real, last 45 days):{" "}
                {(["shopee", "lazada"] as const).map((p) => (
                  <span key={p} className="mr-2 inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />
                    {(rate(p) * 100).toFixed(1)}%{data && data.fee[p].rate == null ? " (estimate)" : ""}
                  </span>
                ))}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reload
                </Button>
                <Button size="sm" variant="ghost" onClick={csv} disabled={!calc.length}>
                  <Download /> CSV
                </Button>
                <Button size="sm" variant="outline" onClick={askDaniel} disabled={!calc.length}>
                  <Bot /> Ask Daniel
                </Button>
              </div>
            </div>

            {/* summary */}
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-3 sm:grid-cols-4">
              <Stat label="Margin now (best sellers weighted)" value={pct(sum.margin)} tone={sum.margin != null && sum.margin < target ? "bad" : "good"} sub={`target ${Math.round(target * 100)}%`} />
              <Stat label="Below target" value={String(sum.below)} sub={`of ${sum.costed} with a cost${sum.unc ? ` · ${sum.unc} without cost` : ""}${sum.promos ? ` · ${sum.promos} on discount` : ""}`} tone={sum.below ? "bad" : "good"} />
              <Stat label="Profit / month now" value={<CountUp value={sum.prof} format={RM} />} sub="at last 30 days' sales" />
              <Stat
                label="With your new prices"
                value={<CountUp value={sum.profNew} format={RM} />}
                sub={changes.length ? `${sum.profNew - sum.prof >= 0 ? "+" : ""}${RM(sum.profNew - sum.prof)} a month if sales hold` : "set new prices below"}
                tone={sum.profNew > sum.prof ? "good" : undefined}
              />
            </div>

            {/* tools */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-2 text-xs">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["all", "shopee", "lazada"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setPlat(p)} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 font-medium", plat === p ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
                    {p !== "all" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />}
                    {p === "all" ? "All" : p === "shopee" ? "Shopee" : "Lazada"}
                  </button>
                ))}
              </div>
              <label className="relative min-w-[10rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, variation or SKU" className="h-8 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px] text-slate-800" />
              </label>
              <label className="flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Only below target
              </label>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <span className="text-slate-500">{sel.size} selected</span>
              <Button size="sm" variant="outline" disabled={!sel.size} onClick={() => useTarget(selected)}>
                Raise to target
              </Button>
              <select value={bulk.kind} onChange={(e) => setBulk((b) => ({ ...b, kind: e.target.value as Change["kind"] }))} className="h-8 rounded-md border border-slate-200 bg-panel px-1 text-xs text-slate-800" aria-label="Change type">
                <option value="pct">+ %</option>
                <option value="add">+ RM</option>
                <option value="set">Set RM</option>
              </select>
              <input value={bulk.value} onChange={(e) => setBulk((b) => ({ ...b, value: e.target.value }))} className="h-8 w-16 rounded-md border border-slate-200 bg-panel px-1.5 text-right text-xs text-slate-800" aria-label="Amount" />
              <Button size="sm" variant="outline" disabled={!sel.size} onClick={applyBulk}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" disabled={!Object.keys(draft).length} onClick={() => (setDraft({}), setResults({}))}>
                Clear
              </Button>
              <Button size="sm" className="ml-auto" disabled={!changes.length} onClick={() => setReview(true)}>
                Review & update ({changes.length})
              </Button>
            </div>

            {data?.warnings?.map((w) => (
              <p key={w} className="mx-5 mb-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-900 ring-1 ring-amber-200">
                {w}
              </p>
            ))}

            <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
              {err ? (
                <p className="py-8 text-center text-xs text-red-600">{err}</p>
              ) : !data ? (
                <SkeletonRows rows={9} />
              ) : !shown.length ? (
                <EmptyState kind={onlyLow ? "sparkle" : "boxes"} text={onlyLow ? "Everything is at or above your target 🎉" : "No listings found."} sub={onlyLow ? undefined : "Check that Shopee / Lazada allow reading products (see the note above)."} />
              ) : (
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 bg-panel text-[10.5px] text-slate-500">
                    <tr className="border-b border-slate-200 text-left">
                      <th className="w-7 py-1.5">
                        <input type="checkbox" checked={allShown} onChange={(e) => setSel((s) => { const n = new Set(s); for (const c of shown) e.target.checked ? n.add(rid(c.r)) : n.delete(rid(c.r)); return n; })} aria-label="Select all shown" />
                      </th>
                      <th className="font-semibold">Product</th>
                      <th className="text-right font-semibold">Sold 30d</th>
                      <th className="text-right font-semibold">Cost</th>
                      <th className="text-right font-semibold">Price</th>
                      <th className="text-right font-semibold">Fees</th>
                      <th className="text-right font-semibold">Profit</th>
                      <th className="text-right font-semibold">Margin</th>
                      <th className="text-right font-semibold">Price for {Math.round(target * 100)}%</th>
                      <th className="pl-3 font-semibold">New price</th>
                      <th className="text-right font-semibold">New margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(({ r, now, goal, next, after, low, promo }) => {
                      const k = rid(r);
                      const res = results[k];
                      return (
                        <tr key={k} className={cn("border-b border-slate-100", res && !res.ok && "bg-red-50/60", res?.ok && "bg-emerald-50/40")}>
                          <td className="py-1.5">
                            <input type="checkbox" checked={sel.has(k)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(k) : n.delete(k); return n; })} aria-label={`Select ${r.name}`} />
                          </td>
                          <td className="max-w-[18rem] py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[r.platform] }} />
                              <span className="truncate text-slate-800" title={r.name}>
                                {r.name}
                              </span>
                            </div>
                            <div className="truncate pl-3 text-[10.5px] text-slate-500">
                              {r.variation || "—"}
                              {r.sku ? ` · ${r.sku}` : ""}
                            </div>
                            {res && !res.ok && <div className="pl-3 text-[10.5px] text-red-700">Refused: {res.message}</div>}
                          </td>
                          <td className="text-right tabular-nums text-slate-700">{r.units30}</td>
                          <td className="text-right tabular-nums text-slate-700">{r.cost == null ? <span className="text-amber-700" title={r.costMissing.length ? `No price for ${r.costMissing.join(", ")}` : "Set it in Stock → Product costs"}>?</span> : r.cost.toFixed(2)}</td>
                          <td className="text-right tabular-nums text-slate-900">
                            {r.price.toFixed(2)}
                            {r.current < r.price - 0.005 && <div className="text-[10px] text-sky-700" title="A discount or promotion is running — margins use what buyers pay">pays {r.current.toFixed(2)}</div>}
                          </td>
                          <td className="text-right tabular-nums text-red-600">−{now.fees.toFixed(2)}</td>
                          <td className={cn("text-right font-semibold tabular-nums", now.profit < 0 ? "text-red-600" : "text-slate-900")}>{r.cost == null ? "—" : now.profit.toFixed(2)}</td>
                          <td className="text-right">
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", now.margin == null ? "text-slate-400" : low ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{pct(now.margin)}</span>
                          </td>
                          <td className="text-right tabular-nums">
                            {promo && goal != null ? (
                              <span className="font-semibold text-sky-700" title={`A discount is running. To reach ${Math.round(target * 100)}%, buyers need to pay at least RM ${goal.toFixed(2)} — raise the discount price in ${r.platform === "shopee" ? "Shopee Seller Centre → Marketing Centre → Discount" : "Lazada Seller Center → Promotions"}.`}>
                                promo {goal.toFixed(2)}
                              </span>
                            ) : goal == null ? (
                              <span className="text-slate-400" title={r.cost == null ? "Needs a product cost" : "Can't reach this margin at any price"}>—</span>
                            ) : (
                              <button type="button" onClick={() => setDraftFor([k], () => goal)} className={cn("rounded px-1 font-semibold hover:bg-slate-100", goal > r.price ? "text-navy dark:text-sky-300" : "text-slate-500")} title="Use this price">
                                {goal.toFixed(2)}
                                {goal > r.price && <span className="block text-[10px] font-semibold text-emerald-700">+RM {(goal - r.price).toFixed(2)}</span>}
                              </button>
                            )}
                          </td>
                          <td className="pl-3">
                            {promo ? (
                              <span className="text-[10.5px] leading-tight text-sky-800">
                                On discount ·{" "}
                                <a
                                  href={r.platform === "shopee" ? "https://seller.shopee.com.my/portal/marketing/discount" : "https://sellercenter.lazada.com.my/apps/promotion/home"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold underline"
                                >
                                  change the promo price
                                </a>
                              </span>
                            ) : (
                            <input
                              value={next ?? ""}
                              placeholder={r.price.toFixed(2)}
                              inputMode="decimal"
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^0-9.]/g, "");
                                setDraft((d) => {
                                  const n = { ...d };
                                  if (v === "" || !(Number(v) > 0)) delete n[k];
                                  else n[k] = Number(v);
                                  return n;
                                });
                              }}
                              className={cn("h-7 w-20 rounded-md border bg-panel px-1.5 text-right text-xs tabular-nums text-slate-900", next != null ? "border-navy ring-1 ring-navy/30" : "border-slate-200")}
                              aria-label={`New price for ${r.name} ${r.variation}`}
                            />
                            )}
                            {next != null && !promo && <span className={cn("ml-1 text-[10px] font-semibold", next > r.price ? "text-emerald-700" : "text-red-600")}>{next > r.price ? "▲" : "▼"} {Math.abs(((next - r.price) / r.price) * 100).toFixed(0)}%</span>}
                          </td>
                          <td className="text-right tabular-nums">
                            {after ? (
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-bold", after.margin != null && after.margin >= target ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                                {pct(after.margin)}
                                {r.units30 > 0 && r.cost != null && <span className="ml-1 font-semibold">{monthlyImpact(r.units30, now.profit, after.profit) >= 0 ? "+" : ""}{monthlyImpact(r.units30, now.profit, after.profit).toFixed(0)}/mo</span>}
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* confirm */}
            {review && (
              <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/30 p-4" onClick={() => !saving && setReview(false)}>
                <div className="ov-pop w-full max-w-lg rounded-2xl bg-panel p-5 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
                  <div className="text-base font-semibold text-slate-900">Update {changes.length} price{changes.length > 1 ? "s" : ""} on the live shop?</div>
                  <p className="mt-1 text-xs text-slate-500">This changes the normal price buyers see straight away. Discounts, flash sales and vouchers stay as they are.</p>
                  <div className="mt-3 max-h-72 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                    {changes.map((c) => (
                      <div key={rid(c.r)} className="flex items-center gap-2 text-xs">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[c.r.platform] }} />
                        <span className="min-w-0 flex-1 truncate text-slate-700">
                          {c.r.name}
                          {c.r.variation ? ` · ${c.r.variation}` : ""}
                        </span>
                        <span className="tabular-nums text-slate-500 line-through">{c.r.price.toFixed(2)}</span>
                        <b className="w-14 text-right tabular-nums text-slate-900">{c.next!.toFixed(2)}</b>
                        <span className="w-12 text-right text-[10.5px] font-semibold text-slate-500">{pct(c.after?.margin ?? null)}</span>
                      </div>
                    ))}
                  </div>
                  {changes.some((c) => Math.abs(c.next! - c.r.price) / c.r.price > 0.3) && <p className="mt-2 text-[11.5px] text-amber-700">Some prices change by more than 30% — Shopee may refuse very large jumps.</p>}
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="ghost" disabled={saving} onClick={() => setReview(false)}>
                      Cancel
                    </Button>
                    <Button disabled={saving} onClick={() => void save()}>
                      {saving ? <Loader2 className="animate-spin" /> : null} Update prices
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[10.5px] font-semibold text-slate-500">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : "text-slate-900")}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-400">{sub}</div>}
    </div>
  );
}

/** The simple version: "I sell at RM 50 with 25% margin — what do I add to get 40%?" */
function QuickCalc({ defaultFee, rounding }: { defaultFee: number; rounding: Rounding }) {
  const [price, setPrice] = useState("50");
  const [margin, setMargin] = useState("25");
  const [target, setTarget] = useState("40");
  const [fee, setFee] = useState<string | null>(null);
  const feeV = fee ?? String(defaultFee);
  const r = priceForNewMargin(Number(price), Number(margin) / 100, Number(target) / 100, Number(feeV) / 100);
  const nice = r ? roundPrice(r.price, rounding === "none" ? "none" : rounding) : null;
  const field = (label: string, v: string, set: (x: string) => void, suffix: string, prefix?: string) => (
    <label className="flex flex-col gap-0.5 text-[10.5px] font-semibold text-slate-500">
      {label}
      <span className="flex items-center gap-1 text-sm text-slate-900">
        {prefix && <span className="text-xs text-slate-400">{prefix}</span>}
        <input value={v} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="h-9 w-20 rounded-lg border border-slate-200 bg-panel px-2 text-right text-sm font-semibold tabular-nums text-slate-900" aria-label={label} />
        <span className="text-xs text-slate-400">{suffix}</span>
      </span>
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-slate-100 bg-sky-50/60 px-5 py-3 dark:bg-sky-950/20">
      <div className="w-full text-xs font-semibold text-slate-800">🧮 Quick calculator — how much to add to reach a margin</div>
      {field("Selling price now", price, setPrice, "", "RM")}
      {field("Margin now", margin, setMargin, "%")}
      {field("Margin you want", target, setTarget, "%")}
      {field("Marketplace fees", feeV, (x) => setFee(x), "% of price")}
      <div className="ml-auto min-w-[15rem] rounded-xl bg-panel px-4 py-2 ring-1 ring-slate-200">
        {r ? (
          <>
            <div className="text-[11px] text-slate-500">Add to the price</div>
            <div className="text-2xl font-extrabold tabular-nums text-emerald-700">+RM {r.add.toFixed(2)}</div>
            <div className="text-[11.5px] text-slate-600">
              New price <b className="text-slate-900">RM {r.price.toFixed(2)}</b>
              {nice != null && nice !== r.price && (
                <>
                  {" "}· round to <b className="text-slate-900">RM {nice.toFixed(2)}</b>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="py-2 text-xs text-amber-700">That margin can't be reached — lower the target or the fees.</div>
        )}
      </div>
      {r && (
        <p className="w-full text-[11px] text-slate-500">
          Your costs (product, packing, ads) are RM {r.fixed.toFixed(2)} and stay the same; the marketplace takes {feeV}% of whatever price you set, so you need to add a bit more than the margin difference. Put the fees to 0 if your margin already ignores them.
        </p>
      )}
    </div>
  );
}
