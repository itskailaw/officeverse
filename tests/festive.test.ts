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

import { decorTheme } from "../lib/office/festive.ts";
test("decorations go up before festivals and come down after", () => {
  const at = (d: string) => new Date(`${d}T10:00:00+08:00`);
  assert.equal(decorTheme(at("2026-03-10")), "raya"); // 10 days before Raya
  assert.equal(decorTheme(at("2026-04-15")), "raya"); // still Syawal
  assert.equal(decorTheme(at("2026-05-01")), null);
  assert.equal(decorTheme(at("2026-02-10")), "cny");
  assert.equal(decorTheme(at("2026-08-31")), "merdeka");
  assert.equal(decorTheme(at("2026-12-20")), "christmas");
  assert.equal(decorTheme(at("2026-11-05")), "deepavali");
  assert.equal(decorTheme(at("2026-07-01")), null);
});
