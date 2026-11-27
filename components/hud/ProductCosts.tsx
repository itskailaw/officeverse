"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { skuPrices, unitCost, type CostPart, type CostRecipe } from "@/lib/data/costs";
import type { CatalogRow } from "@/lib/data/stock";
import { cn } from "@/lib/utils";

const RM = (n: number) => `RM ${n.toFixed(2)}`;

/** Cost per listing variation: which Stock-in SKUs go into it (combos too), plus any fixed extra like packaging. */
export function ProductCosts({ catalog, onOpenStockIn }: { catalog: CatalogRow[]; onOpenStockIn: () => void }) {
  const inv = useOffice((s) => s.settings.inventory);
  const recipes = useOffice((s) => s.settings.costRecipes);
  const byName = useOffice((s) => s.settings.productCosts);
  const update = useOffice((s) => s.updateSettings);
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const prices = useMemo(() => skuPrices(inv), [inv]);
  const skus = useMemo(() => (inv?.skus ?? []).map((s) => s.sku), [inv]);
  const ctx = useMemo(() => ({ prices, skus, recipes, byName }), [prices, skus, recipes, byName]);
  const rows = useMemo(
    () =>
      catalog.map((r) => {
        // the catalog key is the same item key the profit maths uses
        const item = { name: r.product, model: r.variation, sku: r.sku };
        const own = recipes?.[r.key];
        const c = unitCost(item, ctx, r.key);
        return { r, c, own };
      }),
    [catalog, ctx, recipes],
  );
  const totalUnits = rows.reduce((a, x) => a + x.r.units30, 0);
  const costedUnits = rows.reduce((a, x) => a + (x.c.cost != null ? x.r.units30 : 0), 0);
  const shown = rows.filter(({ r, c }) => {
    if (onlyMissing && c.cost != null) return false;
    const n = q.trim().toLowerCase();
    return !n || `${r.product} ${r.variation} ${r.sku ?? ""}`.toLowerCase().includes(n);
  });

  const save = (key: string, next: CostRecipe | null) => {
    const all = { ...(useOffice.getState().settings.costRecipes ?? {}) };
    if (next && ((next.parts?.length ?? 0) > 0 || (next.cost ?? 0) > 0)) all[key] = next;
    else delete all[key];
    update({ costRecipes: all });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-slate-100 px-5 py-3 text-xs">
        <p className="text-slate-600">
          For each variation, add the SKUs you pack for it (a combo = several SKUs) and any extra like packaging. The cost per piece comes from your{" "}
          <button type="button" onClick={onOpenStockIn} className="font-semibold text-navy underline dark:text-sky-300">
            Stock in
          </button>{" "}
          prices. If your Shopee/Lazada seller SKU is already like <b>WF+ADAPTER</b> or <b>WFR x5</b>, it&apos;s filled in automatically.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", totalUnits && costedUnits / totalUnits >= 0.95 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>
            {totalUnits ? Math.round((costedUnits / totalUnits) * 100) : 0}% of units sold (30 days) have a cost
          </span>
          <label className="relative min-w-[10rem] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, variation or SKU" className="h-8 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px] text-slate-800" />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only missing
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
        {!catalog.length && <p className="py-8 text-center text-xs text-slate-500">No sales in the last 60 days yet.</p>}
        {shown.map(({ r, c, own }) => (
          <Row key={r.key} row={r} cost={c} own={own} skus={skus} prices={prices} onSave={(next) => save(r.key, next)} />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  cost,
  own,
  skus,
  prices,
  onSave,
}: {
  row: CatalogRow;
  cost: ReturnType<typeof unitCost>;
  own?: CostRecipe;
  skus: string[];
  prices: Map<string, number>;
  onSave: (r: CostRecipe | null) => void;
}) {
  const parts: CostPart[] = own?.parts ?? (cost.source === "seller-sku" ? cost.parts : []);
  const extra = own?.cost ?? 0;
  const [add, setAdd] = useState("");
  const [extraDraft, setExtraDraft] = useState<string | null>(null);
  const put = (p: CostPart[], x = extra) => onSave({ parts: p, ...(x > 0 ? { cost: x } : {}) });
  const priceOf = (sku: string) => prices.get(sku.trim().toUpperCase().replace(/\s+/g, " "));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-100 py-2.5 text-xs last:border-0">
      <div className="min-w-[12rem] flex-1">
        <div className="truncate font-medium text-slate-800" title={row.product}>
          {row.product}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{row.variation || "—"}</span>
          {row.sku && <span className="rounded bg-slate-100 px-1 font-mono text-[10px]">{row.sku}</span>}
          <span>{row.units30} sold</span>
          {row.platforms.map((p) => (
            <span key={p} className={cn("h-1.5 w-1.5 rounded-full", p === "shopee" ? "bg-[#eb6834]" : "bg-[#2a78d6]")} title={p} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {cost.source === "seller-sku" && !own && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">auto</span>}
        {parts.map((p, i) => {
          const pr = priceOf(p.sku);
          return (
            <span key={p.sku + i} className={cn("inline-flex items-center gap-1 rounded-lg px-1.5 py-1 ring-1", pr == null ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200")}>
              <b className="text-slate-800">{p.sku}</b>
              <span className="text-slate-400">×</span>
              <input
                value={p.qty}
                inputMode="numeric"
                onChange={(e) => {
                  const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || 1));
                  put(parts.map((x, j) => (j === i ? { ...x, qty: n } : x)));
                }}
                className="w-7 rounded border border-slate-200 bg-panel px-0.5 text-center text-[11px] text-slate-800"
                aria-label={`${p.sku} quantity`}
              />
              <span className={pr == null ? "text-amber-700" : "text-slate-500"}>{pr == null ? "no price" : RM(pr * p.qty)}</span>
              <button type="button" onClick={() => put(parts.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${p.sku}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <select
          value={add}
          onChange={(e) => {
            const v = e.target.value;
            setAdd("");
            if (!v) return;
            const same = parts.find((p) => p.sku === v);
            put(same ? parts.map((p) => (p.sku === v ? { ...p, qty: p.qty + 1 } : p)) : [...parts, { sku: v, qty: 1 }]);
          }}
          className="h-7 w-24 rounded-lg border border-dashed border-slate-300 bg-panel px-1 text-[11px] text-slate-600"
          aria-label="Add a SKU"
        >
          <option value="">＋ SKU</option>
          {skus.map((s) => (
            <option key={s} value={s}>
              {s}
              {priceOf(s) != null ? ` · RM ${priceOf(s)!.toFixed(2)}` : " · no price"}
            </option>
          ))}
        </select>
        <span className="ml-1 inline-flex items-center gap-1 text-slate-500" title="Fixed extra per unit: packaging, gifts, bubble wrap…">
          <Plus className="h-3 w-3" /> RM
          <input
            value={extraDraft ?? (extra ? String(extra) : "")}
            placeholder="0"
            inputMode="decimal"
            onChange={(e) => setExtraDraft(e.target.value.replace(/[^0-9.]/g, ""))}
            onBlur={() => {
              if (extraDraft == null) return;
              const v = Math.round((Number(extraDraft) || 0) * 100) / 100;
              setExtraDraft(null);
              put(parts, v);
            }}
            className="w-12 rounded border border-slate-200 bg-panel px-1 text-right text-[11px] text-slate-800"
            aria-label="Extra cost per unit"
          />
        </span>
      </div>

      <div className="ml-auto w-28 text-right">
        {cost.cost != null ? (
          <div>
            <div className="text-sm font-bold tabular-nums text-slate-900">{RM(cost.cost)}</div>
            <div className="text-[10px] text-slate-400">{cost.source === "product" ? "old product cost" : "per unit"}</div>
          </div>
        ) : cost.missing.length ? (
          <div className="text-[11px] font-semibold text-amber-700">Set price for {cost.missing.join(", ")}</div>
        ) : (
          <div className="text-[11px] text-slate-400">not set</div>
        )}
        {own && (
          <button type="button" onClick={() => onSave(null)} className="text-[10px] text-slate-400 hover:text-red-600">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
