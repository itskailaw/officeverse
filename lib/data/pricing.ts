/** Price & margin maths for the Prices screen (pure — unit-tested; used by server and browser). */

const money = (n: number) => Math.round(n * 100) / 100;

/** Share of the sale price the marketplace keeps (commission, service, payment, seller-paid shipping…), from settled orders. */
export function feeRate(orders: { gross: number; net: number | null }[]): { rate: number | null; orders: number } {
  let g = 0;
  let n = 0;
  let k = 0;
  for (const o of orders) {
    if (o.net == null || !(o.gross > 0)) continue;
    g += o.gross;
    n += o.net;
    k++;
  }
  return { rate: g > 0 ? Math.max(0, Math.min(0.9, 1 - n / g)) : null, orders: k };
}

export interface Economics {
  /** marketplace fees for one sale, RM */
  fees: number;
  /** what's left after fees, product cost and ads, RM */
  profit: number;
  /** profit ÷ price (0–1), null when there's no cost */
  margin: number | null;
}
/** One sale at `price`: fees, profit and margin. */
export function economics(price: number, cost: number | null, rate: number, adPerUnit = 0): Economics {
  const fees = money(price * rate);
  if (cost == null) return { fees, profit: money(price - fees - adPerUnit), margin: null };
  const profit = money(price - fees - cost - adPerUnit);
  return { fees, profit, margin: price > 0 ? profit / price : null };
}

/**
 * The lowest price that gives `target` margin (0–1): price − fees − cost − ads = target × price
 * ⇒ price = (cost + ads) ÷ (1 − fee rate − target). Null when no price can reach it.
 */
export function priceForMargin(cost: number, rate: number, target: number, adPerUnit = 0): number | null {
  const d = 1 - rate - target;
  if (d <= 0.02) return null;
  return money((cost + adPerUnit) / d);
}

export type Rounding = "none" | "90" | "99" | "whole";
/** Round a price up to a shop-style ending: RM 47.90, RM 47.99 or RM 48. */
export function roundPrice(p: number, style: Rounding): number {
  if (style === "none" || !(p > 0)) return money(p);
  if (style === "whole") return Math.ceil(p - 0.001);
  const end = style === "90" ? 0.9 : 0.99;
  const base = Math.floor(p);
  return money(base + end >= p - 0.001 ? base + end : base + 1 + end);
}

export type Change = { kind: "pct"; value: number } | { kind: "add"; value: number } | { kind: "set"; value: number };
/** Apply a bulk change (+5 %, +RM 2, set to RM 49.90) to a price. */
export function applyChange(price: number, c: Change): number {
  const v = c.kind === "pct" ? price * (1 + c.value / 100) : c.kind === "add" ? price + c.value : c.value;
  return money(Math.max(0.1, v));
}

/** Extra profit per month from a price change, if the same number keep selling (rough guide). */
export function monthlyImpact(unitsPerMonth: number, oldProfit: number, newProfit: number) {
  return money(unitsPerMonth * (newProfit - oldProfit));
}

/**
 * The simple question: "I sell at `price` with `margin` profit — what price gives `target`?"
 * Marketplace fees (`feeRate`, share of the price) grow with the price; everything else (product, packing, ads) stays the same.
 */
export function priceForNewMargin(price: number, margin: number, target: number, feeRate = 0): { price: number; add: number; fixed: number } | null {
  if (!(price > 0)) return null;
  const fixed = price * (1 - margin - feeRate);
  const d = 1 - feeRate - target;
  if (fixed < 0 || d <= 0.02) return null;
  const p = money(fixed / d);
  return { price: p, add: money(p - price), fixed: money(fixed) };
}
