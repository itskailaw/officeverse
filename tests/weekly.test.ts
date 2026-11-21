import { test } from "node:test";
import assert from "node:assert/strict";
import { pct, weekFacts, weeklyTelegram } from "../lib/integrations/weekly-rules.ts";

const now = Date.parse("2026-11-23T01:00:00Z"); // Monday 9am KL
const day = (d: number) => new Date(now - d * 86400000).toISOString();
const o = (d: number, platform: "shopee" | "lazada", gross: number, qty = 1, extra: Partial<{ sale: boolean; cancelled: boolean }> = {}) => ({
  platform,
  ordered_at: day(d),
  sale: extra.sale ?? true,
  cancelled: extra.cancelled ?? false,
  gross,
  net: gross * 0.85,
  items: [{ name: "MDBC Hand Showerhead Filter", model: "SH:Refill x 10 pcs", sku: "SH", qty }],
});

test("weekly facts: this week vs last, best sellers, cancellations", () => {
  const f = weekFacts([o(1, "shopee", 100, 2), o(2, "lazada", 50), o(3, "shopee", 0, 1, { sale: false, cancelled: true }), o(9, "shopee", 300, 6), o(20, "shopee", 999)], [{ requested_at: day(2) }], now);
  assert.equal(f.revenue.now, 150);
  assert.equal(f.revenue.prev, 300);
  assert.equal(f.orders.now, 2);
  assert.equal(f.cancelled.now, 1);
  assert.equal(f.returns.now, 1);
  assert.equal(f.best[0].units, 3);
  assert.equal(f.falling[0].prevUnits, 6);
  assert.equal(pct(150, 300), "▼ 50%");
  assert.match(weeklyTelegram(f), /Sales:<\/b> RM 150 \(▼ 50% vs last week\)/);
});
