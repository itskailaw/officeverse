/** Stock levels from a one-off count minus everything sold since (pure — unit-tested; used by server and browser). */
import { shortProduct, variationOf } from "./product-names.ts";

export interface StockItem {
  id: string;
  /** short "pack name" — also used on packing lists and pick lists */
  name: string;
  /** product keys (SKU, or product|variation when there's no SKU) that draw from this stock — e.g. the Shopee and Lazada SKU of one product */
  keys: string[];
  onHand: number;
  countedAt: string;
  /** warn when this many days of stock are left (default 7) */
  leadDays?: number;
  /** …or when this many units are left */
  reorderAt?: number;
}
export interface OrderLite {
  platform: string;
  ordered_at: string;
  sale: boolean;
  items: { name: string; model?: string | null; sku?: string | null; qty: number }[];
}

export function itemKey(i: { name: string; model?: string | null; sku?: string | null }) {
  const sku = (i.sku ?? "").trim();
  return sku ? `sku:${sku}` : `${shortProduct(i.name, 60)}|${variationOf(i.model)}`.toLowerCase();
}

export interface CatalogRow {
  key: string;
  sku: string | null;
  product: string;
  variation: string;
  platforms: string[];
  units30: number;
}
/** Every product sold recently, one row per key, best sellers first. */
export function catalog(orders: OrderLite[], now = Date.now()): CatalogRow[] {
  const map = new Map<string, CatalogRow>();
  for (const o of orders) {
    if (!o.sale) continue;
    const recent = now - Date.parse(o.ordered_at) <= 30 * 86400000;
    for (const i of o.items) {
      const k = itemKey(i);
      const r = map.get(k) ?? { key: k, sku: (i.sku ?? "").trim() || null, product: shortProduct(i.name, 60), variation: variationOf(i.model), platforms: [], units30: 0 };
      if (!r.platforms.includes(o.platform)) r.platforms.push(o.platform);
      if (recent) r.units30 += i.qty;
      map.set(k, r);
    }
  }
  return [...map.values()].sort((a, b) => b.units30 - a.units30 || a.product.localeCompare(b.product));
}

export type StockLevel = "ok" | "low" | "out" | "unknown";
export interface StockStatus {
  id: string;
  name: string;
  left: number;
  soldSince: number;
  perDay: number;
  daysLeft: number | null;
  level: StockLevel;
}
export function stockLevels(items: StockItem[], orders: OrderLite[], now = Date.now()): StockStatus[] {
  return items.map((s) => {
    const keys = new Set(s.keys);
    const counted = Date.parse(s.countedAt) || 0;
    let soldSince = 0;
    let sold14 = 0;
    for (const o of orders) {
      if (!o.sale) continue;
      const t = Date.parse(o.ordered_at);
      for (const i of o.items) {
        if (!keys.has(itemKey(i))) continue;
        if (t > counted) soldSince += i.qty;
        if (now - t <= 14 * 86400000) sold14 += i.qty;
      }
    }
    const left = s.onHand - soldSince;
    const perDay = sold14 / 14;
    const daysLeft = perDay > 0 ? Math.max(0, left) / perDay : null;
    const lead = s.leadDays ?? 7;
    const level: StockLevel = !counted ? "unknown" : left <= 0 ? "out" : (daysLeft !== null && daysLeft <= lead) || (s.reorderAt != null && left <= s.reorderAt) ? "low" : "ok";
    return { id: s.id, name: s.name, left, soldSince, perDay, daysLeft, level };
  });
}

/** Pack name for a product key, from the stock list ("" when none). */
export function packNames(items: StockItem[] | undefined) {
  const m = new Map<string, string>();
  for (const s of items ?? []) for (const k of s.keys) if (s.name.trim()) m.set(k, s.name.trim());
  return m;
}
