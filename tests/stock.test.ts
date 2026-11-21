import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog, itemKey, packNames, stockLevels } from "../lib/data/stock.ts";

const now = Date.parse("2026-11-21T06:00:00Z");
const day = (d: number) => new Date(now - d * 86400000).toISOString();
const WF = { name: "MDBC Water Filter PP Cartridge Refill", model: "Refill:PP", sku: "WF-PP-10", qty: 2 };
const LZ = { name: "Water Filter / Washing Machine", model: "Variation3:PP x10", sku: "LZ-WF-10", qty: 1 };
const orders = [
  { platform: "shopee", ordered_at: day(1), sale: true, items: [WF] },
  { platform: "lazada", ordered_at: day(2), sale: true, items: [LZ] },
  { platform: "shopee", ordered_at: day(3), sale: false, items: [WF] }, // cancelled: not counted
  { platform: "shopee", ordered_at: day(20), sale: true, items: [{ ...WF, qty: 5 }] },
];

test("catalog: one row per SKU, recent units, platforms", () => {
  const c = catalog(orders, now);
  assert.equal(c.find((r) => r.key === "sku:WF-PP-10")!.units30, 7);
  assert.deepEqual(c.find((r) => r.key === "sku:LZ-WF-10")!.platforms, ["lazada"]);
  assert.equal(itemKey({ name: "MDBC Ultracompact Bath Filter", model: "Variation3:UMB SET", sku: null }), "ultracompact bath filter|umb set");
});

test("stock: counted minus sold since, days of cover, levels", () => {
  const item = { id: "s1", name: "PP refill x10", keys: ["sku:WF-PP-10", "sku:LZ-WF-10"], onHand: 10, countedAt: day(10) };
  const [s] = stockLevels([item], orders, now);
  assert.equal(s.soldSince, 3); // 2 + 1 (the cancelled order and the one before the count don't count)
  assert.equal(s.left, 7);
  assert.equal(Math.round(s.perDay * 14), 3);
  assert.equal(s.level, "ok"); // 7 left at 3 per 14 days ≈ 33 days
  assert.equal(stockLevels([{ ...item, onHand: 4 }], orders, now)[0].level, "low"); // 1 left ≈ 4.7 days
  assert.equal(stockLevels([{ ...item, onHand: 3 }], orders, now)[0].level, "out");
  assert.equal(stockLevels([{ ...item, reorderAt: 8 }], orders, now)[0].level, "low");
  assert.equal(packNames([item]).get("sku:LZ-WF-10"), "PP refill x10");
});
