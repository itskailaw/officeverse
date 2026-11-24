import { test } from "node:test";
import assert from "node:assert/strict";
import { bayTimes, celebrationsToday, employeeOfMonth, lastMonth } from "../lib/office/office-life.ts";

const at = (d: string, t = "10:00") => new Date(`${d}T${t}:00+08:00`);

test("birthdays and work anniversaries today", () => {
  const people = [
    { id: "a", name: "Aisyah", active: true, birthday: "11-22", joinedOn: "2024-11-22" },
    { id: "b", name: "Ben", active: true, birthday: "02-29" },
    { id: "c", name: "Chloe", active: false, birthday: "11-22" },
    { id: "d", name: "Dan", active: true, joinedOn: "2026-11-22" }, // joined today: no anniversary yet
  ];
  assert.deepEqual(celebrationsToday(people, at("2026-11-22")), [
    { id: "a", name: "Aisyah", kind: "birthday" },
    { id: "a", name: "Aisyah", kind: "anniversary", years: 2 },
  ]);
  assert.deepEqual(celebrationsToday(people, at("2027-02-28")).map((c) => c.id), ["b"]);
  assert.deepEqual(celebrationsToday(people, at("2028-02-28")).map((c) => c.id), []);
});

test("employee of the month: most tasks done, then chats", () => {
  const people = [
    { id: "a", name: "A", active: true },
    { id: "b", name: "B", active: true },
  ];
  const tasks = [
    { employeeId: "a", status: "completed", updatedAt: "2026-10-03T00:00:00Z" },
    { employeeId: "b", status: "completed", updatedAt: "2026-10-04T00:00:00Z" },
    { employeeId: "b", status: "failed", updatedAt: "2026-10-05T00:00:00Z" },
    { employeeId: "a", status: "completed", updatedAt: "2026-11-01T00:00:00Z" },
  ];
  const chats = [{ employeeId: "b", role: "employee", createdAt: "2026-10-09T00:00:00Z" }];
  assert.equal(employeeOfMonth(people, tasks, chats, "2026-10")?.id, "b");
  assert.equal(employeeOfMonth(people, [], [], "2026-10"), null);
  assert.equal(lastMonth(at("2027-01-15")), "2026-12");
});

test("staff cars arrive in the morning and leave in the evening", () => {
  let weekday = 0;
  let weekend = 0;
  for (let b = 0; b < 40; b++) {
    const t = bayTimes("2026-11-23", "Mon", b);
    if (t) {
      weekday++;
      assert.ok(t.arrive >= 465 && t.arrive <= 570 && t.leave >= 1035 && t.leave <= 1170);
    }
    if (bayTimes("2026-11-22", "Sun", b)) weekend++;
  }
  assert.ok(weekday > 25 && weekend < weekday / 2, `${weekday} weekday, ${weekend} weekend`);
  assert.deepEqual(bayTimes("2026-11-23", "Mon", 3), bayTimes("2026-11-23", "Mon", 3));
});

import { topPerformers } from "../lib/office/office-life.ts";
test("top performers: ranked by tasks done, then chats", () => {
  const people = ["a", "b", "c", "d"].map((id) => ({ id, name: id, active: true }));
  const T = (employeeId: string) => ({ employeeId, status: "completed", updatedAt: "2026-10-05T00:00:00Z" });
  const C = (employeeId: string) => ({ employeeId, role: "employee", createdAt: "2026-10-05T00:00:00Z" });
  assert.deepEqual(topPerformers(people, [T("b"), T("b"), T("a"), T("c")], [C("c"), C("c")], "2026-10"), ["b", "c", "a"]);
  assert.deepEqual(topPerformers(people, [], [], "2026-10"), []);
});

import { randomStaffDates } from "../lib/office/office-life.ts";
test("random staff dates are valid and stable", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  for (const id of ["emp-orders", "emp-ops", "emp-cs", "x", "y", "z"]) {
    const d = randomStaffDates(id, now);
    assert.match(d.birthday, /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
    assert.ok(d.joinedOn >= "2021-01-01" && d.joinedOn <= "2026-09-25", d.joinedOn);
    assert.deepEqual(randomStaffDates(id, now), d);
  }
});
