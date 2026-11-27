import { test } from "node:test";
import assert from "node:assert/strict";
import { partsFromSku, skuPrices, unitCost } from "../lib/data/costs.ts";
import { itemKey } from "../lib/data/stock.ts";
import type { Inventory } from "../lib/data/inventory.ts";

const inv: Inventory = {
  skus: [{ sku: "WF", price: 40 }, { sku: "ADAPTER", price: 3.5 }, { sku: "WFR" }, { sku: "SEAL TAPE", price: 0.8 }, { sku: "SH" }],
  suppliers: [],
  receipts: [
    { id: "a", date: "2026-10-01", supplier: "X", lines: [{ sku: "WFR", qty: 1, unit: "box", pcs: 30, price: 5 }] },
    { id: "b", date: "2026-11-01", supplier: "X", lines: [{ sku: "WFR", qty: 1, unit: "box", pcs: 30, price: 4.5 }] },
  ],
};
const prices = skuPrices(inv);
const skus = inv.skus.map((s) => s.sku);

test("SKU prices: set price wins, else the latest stock-in price", () => {
  assert.equal(prices.get("WF"), 40);
  assert.equal(prices.get("WFR"), 4.5);
  assert.equal(prices.has("SH"), false);
});

test("seller SKUs read as combos", () => {
  const known = new Set(["WF", "ADAPTER", "WFR", "SEAL TAPE"]);
  assert.deepEqual(partsFromSku("WF+ADAPTER", known), [{ sku: "WF", qty: 1 }, { sku: "ADAPTER", qty: 1 }]);
  assert.deepEqual(partsFromSku("wfr x5", known), [{ sku: "WFR", qty: 5 }]);
  assert.deepEqual(partsFromSku("2*WFR + seal tape", known), [{ sku: "WFR", qty: 2 }, { sku: "SEAL TAPE", qty: 1 }]);
  assert.equal(partsFromSku("WF-PP-10", known), null);
  assert.equal(partsFromSku("", known), null);
});

test("unit cost: recipe, then seller SKU, then old product cost", () => {
  const combo = { name: "MDBC Water Filter", model: "Filter + Adapter", sku: "WF+ADAPTER" };
  assert.deepEqual(unitCost(combo, { prices, skus }), { cost: 43.5, source: "seller-sku", parts: [{ sku: "WF", qty: 1 }, { sku: "ADAPTER", qty: 1 }], missing: [] });

  const refill = { name: "Refill", model: "5 pcs", sku: "LZ-123" };
  const recipes = { [itemKey(refill)]: { parts: [{ sku: "WFR", qty: 5 }], cost: 1.2 } };
  assert.equal(unitCost(refill, { prices, skus, recipes }).cost, 23.7);

  const fixed = { name: "Gift set", model: "A", sku: null };
  assert.equal(unitCost(fixed, { prices, recipes: { [itemKey(fixed)]: { cost: 12 } } }).cost, 12);

  const noPrice = { name: "Shower", model: "", sku: "SH" };
  const r = unitCost(noPrice, { prices, skus });
  assert.equal(r.cost, null);
  assert.deepEqual(r.missing, ["SH"]);

  assert.equal(unitCost({ name: "Old listing", sku: "X1" }, { prices, byName: { "Old listing": 9 } }).cost, 9);
  assert.equal(unitCost({ name: "Unknown", sku: "Z" }, { prices }).source, null);
});
