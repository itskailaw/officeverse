import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAlerts } from "../lib/integrations/alert-rules.ts";

// 14:00 Malaysia time (06:00 UTC) — outside quiet hours
const noon = Date.parse("2026-11-19T06:00:00Z");
const base = { now: noon, urgent: [], shopeeAdBalance: 200, adThreshold: 50, cancelledToday: 0, returns: [], returnsAvailable: true };

test("urgent parcels alert once per order", () => {
  const u = [{ platform: "shopee" as const, id: "A1", shipBy: "2026-11-19T09:00:00Z" }, { platform: "lazada" as const, id: "L1", shipBy: "2026-11-19T10:00:00Z" }];
  const r1 = decideAlerts({ ...base, urgent: u }, undefined);
  assert.equal(r1.messages.length, 1);
  assert.match(r1.messages[0], /2 parcels must ship within 6 hours/);
  assert.match(r1.messages[0], /Shopee: 1/);
  const r2 = decideAlerts({ ...base, urgent: u }, r1.state);
  assert.equal(r2.messages.length, 0);
  const r3 = decideAlerts({ ...base, urgent: [...u, { platform: "shopee", id: "A2", shipBy: "2026-11-19T11:00:00Z" }] }, r2.state);
  assert.match(r3.messages[0], /1 parcel must ship/);
});

test("low ads balance once a day; cancellations at 3/5/10", () => {
  const r1 = decideAlerts({ ...base, shopeeAdBalance: 20, cancelledToday: 4 }, undefined);
  assert.equal(r1.messages.length, 2);
  const r2 = decideAlerts({ ...base, shopeeAdBalance: 18, cancelledToday: 4 }, r1.state);
  assert.equal(r2.messages.length, 0);
  const r3 = decideAlerts({ ...base, shopeeAdBalance: 18, cancelledToday: 6 }, r2.state);
  assert.equal(r3.messages.length, 1);
  assert.match(r3.messages[0], /6 orders cancelled/);
});

test("returns: first run seeds silently, then alerts new ones", () => {
  const old = [{ platform: "lazada" as const, id: "R1", items: "Filter", reason: "Damaged", refund: 129, requestedAt: null }];
  const r1 = decideAlerts({ ...base, returns: old }, undefined);
  assert.equal(r1.messages.length, 0);
  const r2 = decideAlerts({ ...base, returns: [...old, { platform: "shopee", id: "R2", items: "Tap <adapter>", reason: null, refund: 0, requestedAt: null }] }, r1.state);
  assert.equal(r2.messages.length, 1);
  assert.match(r2.messages[0], /1 new return/);
  assert.match(r2.messages[0], /Tap &lt;adapter&gt;/);
});

test("quiet hours (23:00–07:00) hold back everything except urgent parcels", () => {
  const night = Date.parse("2026-11-19T17:30:00Z"); // 01:30 MYT
  const r = decideAlerts({ ...base, now: night, shopeeAdBalance: 10, cancelledToday: 12, urgent: [{ platform: "shopee", id: "X", shipBy: "2026-11-19T20:00:00Z" }] }, { sent: {}, seeded: true });
  assert.equal(r.messages.length, 1);
  assert.match(r.messages[0], /must ship/);
});
