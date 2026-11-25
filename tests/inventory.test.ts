import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SKUS, emptyInventory, monthStatement, receiptTotal, receivedBySku, toPcs, type Inventory } from "../lib/data/inventory.ts";

test("all 29 SKUs are set up", () => {
  assert.equal(DEFAULT_SKUS.length, 29);
  assert.equal(new Set(DEFAULT_SKUS).size, 29);
  assert.equal(emptyInventory().skus.length, 29);
});

test("boxes convert to pieces", () => {
  assert.equal(toPcs(3, "box", 50), 150);
  assert.equal(toPcs(7, "pcs"), 7);
  assert.equal(toPcs(2, "box"), null); // box size not set yet
});

test("monthly statement groups by SKU and price and totals to the sen", () => {
  const inv: Inventory = {
    skus: [{ sku: "WF" }, { sku: "WFR" }],
    suppliers: ["Acme"],
    receipts: [
      { id: "1", date: "2026-11-03", supplier: "Acme", lines: [{ sku: "WFR", qty: 2, unit: "box", pcs: 100, price: 1.15 }, { sku: "WF", qty: 20, unit: "pcs", pcs: 20, price: 12.5 }] },
      { id: "2", date: "2026-11-20", supplier: "Acme", lines: [{ sku: "WF", qty: 10, unit: "pcs", pcs: 10, price: 12.5 }, { sku: "WF", qty: 5, unit: "pcs", pcs: 5, price: 13 }] },
      { id: "3", date: "2026-12-01", supplier: "Acme", lines: [{ sku: "WF", qty: 1, unit: "pcs", pcs: 1, price: 12.5 }] },
      { id: "4", date: "2026-11-05", supplier: "Other", lines: [{ sku: "WF", qty: 1, unit: "pcs", pcs: 1, price: 9 }] },
    ],
  };
  const s = monthStatement(inv, "Acme", "2026-11");
  assert.equal(s.receipts.length, 2);
  assert.deepEqual(s.rows.map((r) => [r.sku, r.pcs, r.price, r.amount]), [["WF", 30, 12.5, 375], ["WF", 5, 13, 65], ["WFR", 100, 1.15, 115]]);
  assert.equal(s.total, 555);
  assert.equal(receiptTotal(inv.receipts[0]), 365);
  assert.equal(receivedBySku(inv, "2026-11-01", "2026-11-30").get("WF"), 36);
});
