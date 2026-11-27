import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFees, payoutCsv, payoutState, payoutTotals, type PayoutRow } from "../lib/data/payouts.ts";

test("payout state", () => {
  assert.equal(payoutState("COMPLETED", 80, { _final: true }, "shopee"), "final");
  assert.equal(payoutState("SHIPPED", 80, { Commission: -5 }, "shopee"), "estimate");
  assert.equal(payoutState("SHIPPED", null, null, "shopee"), "waiting");
  assert.equal(payoutState("READY_TO_SHIP", null, null, "shopee"), "unshipped");
  assert.equal(payoutState("delivered", null, null, "lazada"), "waiting");
  assert.equal(payoutState("pending", null, null, "lazada"), "unshipped");
});

test("fees without the internal flag", () => {
  assert.deepEqual(cleanFees({ Commission: -5.004, _final: true, Zero: 0 }), { Commission: -5 });
});

const rows: PayoutRow[] = [
  { platform: "shopee", id: "A1", status: "COMPLETED", at: "2026-11-02T03:00:00Z", items: "WF + Adapter ×1", gross: 100, net: 82.5, fees: {}, state: "final", cost: 41.5 },
  { platform: "lazada", id: "B2", status: "delivered", at: "2026-11-03T03:00:00Z", items: 'Refill "PP", x5', gross: 50, net: null, fees: {}, state: "waiting", cost: 14.9 },
];
test("totals only pair sales and payouts from the same orders", () => {
  const t = payoutTotals(rows);
  assert.equal(t.gross, 150);
  assert.equal(t.grossWithPayout, 100);
  assert.equal(t.net, 82.5);
  assert.equal(t.fees, -17.5);
  assert.equal(t.cost, 41.5);
  assert.deepEqual(t.byState, { final: 1, estimate: 0, waiting: 1, unshipped: 0 });
});
test("CSV", () => {
  const csv = payoutCsv(rows).split("\n");
  assert.equal(csv.length, 3);
  assert.equal(csv[1], "2026-11-02,Shopee,A1,COMPLETED,WF + Adapter ×1,100.00,-17.50,82.50,Final,41.50,41.00");
  assert.equal(csv[2], '2026-11-03,Lazada,B2,delivered,"Refill ""PP"", x5",50.00,,,Waiting for payout data,14.90,');
});
