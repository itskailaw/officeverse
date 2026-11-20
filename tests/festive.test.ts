import { test } from "node:test";
import assert from "node:assert/strict";
import { festiveTheme } from "../lib/office/festive.ts";

test("festive outfits follow the Malaysian calendar", () => {
  const at = (d: string) => new Date(`${d}T10:00:00+08:00`);
  assert.equal(festiveTheme(at("2026-08-24")), "kobe");
  assert.equal(festiveTheme(at("2027-02-07")), "cny");
  assert.equal(festiveTheme(at("2026-03-26")), "raya");
  assert.equal(festiveTheme(at("2026-03-27")), null);
  assert.equal(festiveTheme(at("2026-11-09")), "deepavali");
  assert.equal(festiveTheme(at("2026-11-20")), null);
});
