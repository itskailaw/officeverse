/** Product cost per sold variation, built from Stock-in SKU prices (pure — unit-tested; used by server and browser). */
import { itemKey } from "./stock.ts";
import type { Inventory } from "./inventory.ts";

export interface CostPart {
  sku: string;
  qty: number;
}
/** What one unit of a listing variation costs: the SKUs packed for it, and/or a fixed RM amount (packaging, gifts…). */
export interface CostRecipe {
  parts?: CostPart[];
  /** fixed RM per unit; used instead of the parts when there are none, added on top when there are */
  cost?: number;
}
export type CostRecipes = Record<string, CostRecipe>;

export interface SoldItem {
  name: string;
  model?: string | null;
  sku?: string | null;
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const money = (n: number) => Math.round(n * 100) / 100;

/** Price per piece for each Stock-in SKU: the price set on the SKU, otherwise the latest stock-in price. */
export function skuPrices(inv: Inventory | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!inv) return out;
  const receipts = [...(inv.receipts ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of receipts) for (const l of r.lines) if (l.price > 0) out.set(norm(l.sku), l.price);
  for (const s of inv.skus ?? []) if ((s.price ?? 0) > 0) out.set(norm(s.sku), s.price!);
  return out;
}

/**
 * Reads a marketplace seller SKU as a set of Stock-in SKUs, e.g. "WF+ADAPTER", "WFR x5", "2xWFR + SEAL TAPE".
 * Only when every part is a known SKU; otherwise null.
 */
export function partsFromSku(sellerSku: string | null | undefined, known: Set<string>): CostPart[] | null {
  const raw = (sellerSku ?? "").trim();
  if (!raw) return null;
  const parts: CostPart[] = [];
  for (const bit of raw.split("+")) {
    const b = norm(bit);
    if (!b) return null;
    let sku = b;
    let qty = 1;
    const pre = b.match(/^(\d+)\s*[X*×]\s*(.+)$/);
    const post = b.match(/^(.+?)\s*[X*×]\s*(\d+)$/);
    if (known.has(b)) sku = b;
    else if (pre && known.has(norm(pre[2]))) [sku, qty] = [norm(pre[2]), Number(pre[1])];
    else if (post && known.has(norm(post[1]))) [sku, qty] = [norm(post[1]), Number(post[2])];
    else return null;
    const same = parts.find((p) => p.sku === sku);
    if (same) same.qty += qty;
    else parts.push({ sku, qty });
  }
  return parts.length ? parts : null;
}

export interface UnitCost {
  /** RM per unit sold, or null when it can't be worked out yet */
  cost: number | null;
  /** where it came from: your recipe, the seller SKU, or the old per-product cost */
  source: "recipe" | "seller-sku" | "product" | null;
  parts: CostPart[];
  /** SKUs in the recipe that have no price yet */
  missing: string[];
}

export interface CostContext {
  recipes?: CostRecipes | null;
  prices: Map<string, number>;
  /** every Stock-in SKU code (priced or not), so a seller SKU like "WF+ADAPTER" is still recognised */
  skus?: string[];
  /** older per-product costs (by listing name), used when nothing better is set */
  byName?: Record<string, number> | null;
}

function priced(parts: CostPart[], extra: number, prices: Map<string, number>): { cost: number | null; missing: string[] } {
  const missing: string[] = [];
  let sum = extra;
  for (const p of parts) {
    const price = prices.get(norm(p.sku));
    if (price == null) missing.push(p.sku);
    else sum += price * p.qty;
  }
  return { cost: missing.length ? null : money(sum), missing };
}

/** `key`: the item key when already known (Stock lists products by key). */
export function unitCost(item: SoldItem, ctx: CostContext, key?: string): UnitCost {
  const recipe = ctx.recipes?.[key ?? itemKey(item)];
  const extra = Number(recipe?.cost) > 0 ? Number(recipe!.cost) : 0;
  if (recipe && (recipe.parts?.length || extra)) {
    const parts = (recipe.parts ?? []).filter((p) => p.sku && p.qty > 0);
    return { ...priced(parts, extra, ctx.prices), source: "recipe", parts };
  }
  const auto = partsFromSku(item.sku, new Set([...ctx.prices.keys(), ...(ctx.skus ?? []).map(norm)]));
  if (auto) return { ...priced(auto, 0, ctx.prices), source: "seller-sku", parts: auto };
  const old = ctx.byName?.[item.name];
  if (old && old > 0) return { cost: old, source: "product", parts: [], missing: [] };
  return { cost: null, source: null, parts: [], missing: [] };
}
