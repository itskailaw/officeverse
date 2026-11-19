import { test } from "node:test";
import assert from "node:assert/strict";
import { inHours } from "../lib/integrations/order-rules.ts";

test("working hours in Malaysia time, incl. overnight ranges", () => {
  const at = (hhmm: string) => new Date(`2026-11-20T${hhmm}:00+08:00`);
  assert.equal(inHours(at("09:00"), "08:00", "22:00"), true);
  assert.equal(inHours(at("07:59"), "08:00", "22:00"), false);
  assert.equal(inHours(at("22:00"), "08:00", "22:00"), false);
  assert.equal(inHours(at("23:30"), "22:00", "06:00"), true);
  assert.equal(inHours(at("05:00"), "22:00", "06:00"), true);
  assert.equal(inHours(at("12:00"), "22:00", "06:00"), false);
  assert.equal(inHours(at("03:00"), "00:00", "00:00"), true);
});
