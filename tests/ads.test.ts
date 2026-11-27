import { test } from "node:test";
import assert from "node:assert/strict";
import { monthAds, platformAdSpend, type AdEntry } from "../lib/data/ads.ts";

const E: AdEntry[] = [
  { id: "1", date: "2026-11-02", channel: "shopee", amount: 50 },
  { id: "2", date: "2026-11-15", channel: "shopee", amount: 30.5 },
  { id: "3", date: "2026-11-10", channel: "facebook", amount: 100 },
  { id: "4", date: "2026-10-30", channel: "shopee", amount: 999 },
  { id: "5", date: "2026-11-20", channel: "tiktok", amount: 0 },
];

test("month totals by channel", () => {
  const m = monthAds(E, "2026-11");
  assert.deepEqual(m.byChannel, { shopee: 80.5, facebook: 100 });
  assert.equal(m.marketplaces, 80.5);
  assert.equal(m.outside, 100);
  assert.equal(m.total, 180.5);
  assert.equal(m.entries, 3);
  assert.equal(monthAds(null, "2026-11").total, 0);
});

test("Lazada: keyed-in wins over synced, never both", () => {
  const m = monthAds(E, "2026-11");
  assert.deepEqual(platformAdSpend(m, 329), { shopee: 80.5, lazada: 329, lazadaSource: "synced" });
  const m2 = monthAds([...E, { id: "6", date: "2026-11-05", channel: "lazada", amount: 200 }], "2026-11");
  assert.deepEqual(platformAdSpend(m2, 329), { shopee: 80.5, lazada: 200, lazadaSource: "manual" });
  assert.equal(platformAdSpend(monthAds([], "2026-11"), null).lazadaSource, "none");
});
