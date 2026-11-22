import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminders, eventsOfYear, upcomingEvents } from "../lib/marketing/calendar.ts";

const at = (d: string) => new Date(`${d}T10:00:00+08:00`);

test("double days, mega sales and festivals are on the calendar", () => {
  const ev = eventsOfYear(2026);
  const by = (id: string) => ev.find((e) => e.id === id);
  assert.equal(by("11.11-2026")?.date, "2026-11-11");
  assert.equal(by("11.11-2026")?.kind, "mega");
  assert.equal(by("3.3-2026")?.kind, "double");
  assert.equal(by("raya-2026")?.date, "2026-03-20");
  assert.equal(by("ramadan-2026")?.date, "2026-02-18");
  assert.equal(by("mothers-2026")?.date, "2026-05-10"); // 2nd Sunday of May
  assert.equal(by("blackfriday-2026")?.date, "2026-11-27"); // 4th Friday of November
  assert.equal(by("payday-2026-07")?.date, "2026-07-25");
});

test("upcoming events run into next year and hide payday by default", () => {
  const up = upcomingEvents(at("2026-12-20"), 30);
  assert.ok(up.some((e) => e.id === "xmas-2026" && e.daysLeft === 5));
  assert.ok(up.some((e) => e.id === "1.1-2027"));
  assert.ok(!up.some((e) => e.kind === "payday"));
});

test("reminders: 14 and 3 days before mega sales, once each", () => {
  const keys = (d: string, sent: string[]) => dueReminders(at(d), sent).map((r) => r.key).filter((k) => k.startsWith("11.11"));
  assert.deepEqual(keys("2026-10-27", []), []); // 15 days out
  assert.deepEqual(keys("2026-10-28", []), ["11.11-2026:14"]);
  assert.deepEqual(keys("2026-10-29", ["11.11-2026:14"]), []);
  const late = dueReminders(at("2026-11-09"), ["11.11-2026:14"]).map((r) => r.key);
  assert.ok(late.includes("11.11-2026:3"));
  // a missed 14-day reminder doesn't fire alongside the 3-day one
  assert.ok(!dueReminders(at("2026-11-09"), []).some((r) => r.key === "11.11-2026:14"));
});
