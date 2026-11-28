import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChange, economics, feeRate, monthlyImpact, priceForMargin, roundPrice } from "../lib/data/pricing.ts";

test("fee rate from settled orders only", () => {
  const r = feeRate([{ gross: 100, net: 82 }, { gross: 50, net: 41 }, { gross: 70, net: null }]);
  assert.equal(r.orders, 2);
  assert.ok(Math.abs((r.rate ?? 0) - 0.18) < 1e-9);
  assert.equal(feeRate([]).rate, null);
});

test("economics of one sale", () => {
  assert.deepEqual(economics(89, 41.5, 0.18), { fees: 16.02, profit: 31.48, margin: 31.48 / 89 });
  assert.equal(economics(89, null, 0.18).margin, null);
  assert.equal(economics(89, 41.5, 0.18, 3).profit, 28.48);
});

test("price for a target margin", () => {
  // (41.5 + 3) / (1 - 0.18 - 0.30) = 85.58
  assert.equal(priceForMargin(41.5, 0.18, 0.3, 3), 85.58);
  const p = priceForMargin(41.5, 0.18, 0.3, 3)!;
  assert.ok(Math.abs((economics(p, 41.5, 0.18, 3).margin ?? 0) - 0.3) < 0.001);
  assert.equal(priceForMargin(10, 0.5, 0.49), null);
});

test("shop-style rounding", () => {
  assert.equal(roundPrice(85.58, "90"), 85.9);
  assert.equal(roundPrice(85.95, "90"), 86.9);
  assert.equal(roundPrice(85.9, "90"), 85.9);
  assert.equal(roundPrice(85.58, "99"), 85.99);
  assert.equal(roundPrice(85.01, "whole"), 86);
  assert.equal(roundPrice(85.58, "none"), 85.58);
});

test("bulk changes and impact", () => {
  assert.equal(applyChange(80, { kind: "pct", value: 5 }), 84);
  assert.equal(applyChange(80, { kind: "add", value: -2.5 }), 77.5);
  assert.equal(applyChange(80, { kind: "set", value: 49.9 }), 49.9);
  assert.equal(monthlyImpact(79, 25, 29.5), 355.5);
});
