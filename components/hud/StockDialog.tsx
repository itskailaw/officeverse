"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductCosts } from "./ProductCosts";
import { StockIn } from "./StockIn";
import { stockLevels, type CatalogRow, type OrderLite, type StockItem, type StockLevel } from "@/lib/data/stock";

const CHIP: Record<StockLevel, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-500",
};
const DOT: Record<string, string> = { shopee: "#eb6834", lazada: "#2a78d6" };

/** Stock: count once, OfficeVerse deducts every paid order; the name you give is the pack name on packing lists. */
export function StockDialog() {
  const open = useUI((s) => s.dialog === "stock");
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const stock = useOffice((s) => s.settings.stock) ?? [];
  const update = useOffice((s) => s.updateSettings);
  const priya = useOffice((s) => s.employees.find((e) => e.id === "emp-inv" && e.active));
  const [data, setData] = useState<{ catalog: CatalogRow[]; orders: OrderLite[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlyTracked, setOnlyTracked] = useState(false);
  const [section, setSection] = useState<"levels" | "in" | "costs">("levels");
  useEffect(() => {
    if (!open) return;
    try {
      const want = sessionStorage.getItem("ov:stock-section");
      if (want === "in" || want === "costs") setSection(want);
      sessionStorage.removeItem("ov:stock-section");
    } catch {}
  }, [open]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch("/api/stock", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const levels = useMemo(() => new Map(stockLevels(stock, data?.orders ?? []).map((l) => [l.id, l])), [stock, data]);
  const itemOf = (key: string) => stock.find((s) => s.keys.includes(key));
  const save = (next: StockItem[]) => update({ stock: next.filter((s) => s.keys.length) });

  const setCount = (row: CatalogRow, value: string) => {
    const n = Math.max(0, Math.floor(Number(value)));
    if (!Number.isFinite(n) || value === "") return;
    const it = itemOf(row.key);
    if (it) save(stock.map((s) => (s.id === it.id ? { ...s, onHand: n, countedAt: new Date().toISOString() } : s)));
    else save([...stock, { id: `st-${Date.now().toString(36)}`, name: row.variation || row.product, keys: [row.key], onHand: n, countedAt: new Date().toISOString() }]);
  };
  const setName = (row: CatalogRow, name: string) => {
    const it = itemOf(row.key);
    if (it) save(stock.map((s) => (s.id === it.id ? { ...s, name } : s)));
    else save([...stock, { id: `st-${Date.now().toString(36)}`, name, keys: [row.key], onHand: 0, countedAt: "" }]);
  };
  const setLead = (row: CatalogRow, v: string) => {
    const it = itemOf(row.key);
    const n = Math.max(1, Math.min(90, Math.floor(Number(v)) || 7));
    if (it) save(stock.map((s) => (s.id === it.id ? { ...s, leadDays: n } : s)));
  };
  /** this product shares stock with another one (e.g. the same item listed on Shopee and Lazada) */
  const link = (row: CatalogRow, targetId: string) => {
    const without = stock.map((s) => ({ ...s, keys: s.keys.filter((k) => k !== row.key) }));
    if (!targetId) return save([...without, { id: `st-${Date.now().toString(36)}`, name: row.variation || row.product, keys: [row.key], onHand: 0, countedAt: "" }]);
    save(without.map((s) => (s.id === targetId ? { ...s, keys: [...s.keys, row.key] } : s)));
    toast("success", "Linked — both listings now count from the same stock");
  };

  const rows = (data?.catalog ?? []).filter((r) => {
    const n = q.trim().toLowerCase();
    if (onlyTracked && !itemOf(r.key)?.countedAt) return false;
    return !n || `${r.product} ${r.variation} ${r.sku ?? ""} ${itemOf(r.key)?.name ?? ""}`.toLowerCase().includes(n);
  });
  const counts = { low: 0, out: 0 };
  for (const l of levels.values()) if (l.level === "low" || l.level === "out") counts[l.level]++;

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "stock" : null })}>
      <DialogContent
        title="Stock"
        description={`Count each product once — every paid order is deducted automatically. ${priya ? `${priya.name.split(" ")[0]} (Inventory)` : "OfficeVerse"} warns you on Telegram / your phone before you run out.`}
        className="h-[88vh] max-w-4xl"
        onBack={() => set({ dialog: "dashboard" })}
        backLabel="Dashboard"
      >
        <div className="flex gap-1 border-b border-slate-100 px-5 pt-2 print:hidden">
          {(
            [
              ["levels", "Stock levels"],
              ["in", "Stock in & supplier invoices"],
              ["costs", "Product costs"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setSection(v)}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-xs font-semibold ${section === v ? "border-navy text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {section === "in" ? (
          <StockIn />
        ) : section === "costs" ? (
          <ProductCosts catalog={data?.catalog ?? []} onOpenStockIn={() => setSection("in")} />
        ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2 text-xs">
            {counts.out > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-800">{counts.out} out of stock</span>}
            {counts.low > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{counts.low} running low</span>}
            <span className="text-slate-500">{stock.filter((s) => s.countedAt).length} counted</span>
            <label className="relative ml-2 min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, variation or SKU" className="h-8 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px] text-slate-800" />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-600">
              <input type="checkbox" checked={onlyTracked} onChange={(e) => setOnlyTracked(e.target.checked)} /> Counted only
            </label>
            <Button size="sm" variant="ghost" onClick={() => void load()} title="Refresh">
              <RefreshCw />
            </Button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {err && <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{err}</div>}
            {!data && !err && (
              <div className="flex items-center justify-center gap-2 p-10 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
              </div>
            )}
            {data && !rows.length && <p className="p-10 text-center text-xs text-slate-500">No products sold in the last 60 days yet.</p>}
            {rows.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-panel text-[10px] uppercase tracking-wide text-slate-500 shadow-[0_1px_0_rgb(0_0_0/0.06)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Product sold</th>
                    <th className="px-2 py-2 font-medium">Pack name</th>
                    <th className="px-2 py-2 text-right font-medium">Sold 30d</th>
                    <th className="px-2 py-2 font-medium">Counted</th>
                    <th className="px-2 py-2 font-medium">Left now</th>
                    <th className="px-2 py-2 pr-4 font-medium">Shares stock with</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const it = itemOf(r.key);
                    const lv = it ? levels.get(it.id) : undefined;
                    const shared = it && it.keys.length > 1 && it.keys[0] !== r.key;
                    return (
                      <tr key={r.key} className="align-top">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-800">{r.variation || r.product}</div>
                          <div className="text-[11px] text-slate-500">{r.variation ? r.product : ""}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                            {r.platforms.map((p) => (
                              <span key={p} className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[p] }} />
                            ))}
                            {r.sku ? `SKU ${r.sku}` : "no SKU"}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            defaultValue={it?.name ?? ""}
                            key={`${r.key}-${it?.id ?? "x"}`}
                            onBlur={(e) => e.target.value.trim() !== (it?.name ?? "") && setName(r, e.target.value.trim())}
                            placeholder={r.variation || r.product}
                            disabled={!!shared}
                            className="h-8 w-40 rounded-md border border-slate-200 bg-panel px-2 text-[11px] text-slate-800 disabled:opacity-50"
                            aria-label="Pack name"
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">{r.units30}</td>
                        <td className="px-2 py-2">
                          {shared ? (
                            <span className="text-[11px] text-slate-400">see linked</span>
                          ) : (
                            <>
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                defaultValue={it?.countedAt ? it.onHand : ""}
                                key={`${r.key}-${it?.countedAt ?? "none"}`}
                                onBlur={(e) => e.target.value !== "" && Number(e.target.value) !== (it?.countedAt ? it.onHand : NaN) && setCount(r, e.target.value)}
                                placeholder="count"
                                className="h-8 w-20 rounded-md border border-slate-200 bg-panel px-2 text-[11px] text-slate-800"
                                aria-label="Units on hand when counted"
                              />
                              {it?.countedAt && <div className="mt-0.5 text-[10px] text-slate-400">{new Date(it.countedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</div>}
                            </>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {lv && lv.level !== "unknown" ? (
                            <div>
                              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", CHIP[lv.level])}>{Math.max(0, lv.left)} left</span>
                              <div className="mt-0.5 text-[10px] text-slate-500">
                                {lv.daysLeft == null ? "no recent sales" : `≈ ${Math.round(lv.daysLeft)} day${Math.round(lv.daysLeft) === 1 ? "" : "s"} of sales`}
                                {!shared && (
                                  <>
                                    {" · warn at "}
                                    <input
                                      type="number"
                                      min={1}
                                      max={90}
                                      defaultValue={it?.leadDays ?? 7}
                                      onBlur={(e) => setLead(r, e.target.value)}
                                      className="h-5 w-9 rounded border border-slate-200 bg-panel px-1 text-[10px] text-slate-800"
                                      aria-label="Warn when this many days are left"
                                    />{" "}
                                    days
                                  </>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 pr-4">
                          <select
                            value={shared ? it!.id : ""}
                            onChange={(e) => link(r, e.target.value)}
                            className="h-8 max-w-[11rem] rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800"
                            aria-label="Shares stock with"
                          >
                            <option value="">Its own stock</option>
                            {stock
                              .filter((s) => s.countedAt && !s.keys.includes(r.key))
                              .concat(shared ? [it!] : [])
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-500">
            Tip: the <b>pack name</b> is what your packer sees on packing lists, pick lists and emails. List the same product on Shopee and Lazada? Count it on one row and set the
            other to &ldquo;Shares stock with&rdquo; it.
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
