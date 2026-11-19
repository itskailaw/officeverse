import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTeamMerges, TEAM_MERGES } from "../lib/data/team-migrations.ts";
import type { Employee } from "../lib/data/types.ts";

const mk = (id: string, name: string, resp: string[], perms: string[]): Employee =>
  ({ id, name, title: "x", personality: "", responsibilities: resp, permissions: perms, active: true, workstationId: "ws-" + id, status: "working" }) as unknown as Employee;

test("merges responsibilities and permissions, deactivates the absorbed role, runs once", () => {
  const team = [
    mk("emp-ba", "Jason", ["Analyze revenue trends"], ["finance:read"]),
    mk("emp-strat", "Siti", ["Prepare strategic reports", "Analyze revenue trends"], ["finance:read", "reports:write"]),
    mk("emp-inv", "Priya", ["Monitor stock"], ["inventory:read"]),
    mk("emp-proc", "Kevin", ["Prepare purchase order drafts"], ["suppliers:read", "drafts:write"]),
  ];
  const r = applyTeamMerges(team, []);
  const jason = r.employees.find((e) => e.id === "emp-ba")!;
  assert.equal(jason.title, "Business & Strategy Analyst");
  assert.deepEqual(jason.responsibilities, ["Analyze revenue trends", "Prepare strategic reports"]);
  assert.deepEqual(jason.permissions, ["finance:read", "reports:write"]);
  const siti = r.employees.find((e) => e.id === "emp-strat")!;
  assert.equal(siti.active, false);
  assert.equal(siti.workstationId, null);
  const priya = r.employees.find((e) => e.id === "emp-inv")!;
  assert.equal(priya.title, "Inventory & Purchasing Manager");
  assert.ok(priya.permissions.includes("suppliers:read"));
  assert.equal(r.changes.length, 2);
  assert.deepEqual(r.applied, TEAM_MERGES.map((m) => m.id));
  const again = applyTeamMerges(r.employees, r.applied);
  assert.equal(again.changes.length, 0);
  assert.equal(again.employees, r.employees);
});

test("works when the absorbed employee no longer exists (new offices)", () => {
  const r = applyTeamMerges([mk("emp-ba", "Jason", ["a"], [])], []);
  assert.equal(r.employees[0].title, "Business & Strategy Analyst");
});

test("the receptionist is added to existing offices once, at the lobby desk", async () => {
  const { SEED_EMPLOYEES } = await import("../lib/data/seed.ts");
  const recep = SEED_EMPLOYEES.find((e) => e.id === "emp-recep")!;
  assert.equal(recep.workstationId, "lobby-desk");
  const old = SEED_EMPLOYEES.filter((e) => e.id !== "emp-recep");
  const r = applyTeamMerges(old, TEAM_MERGES.map((m) => m.id), SEED_EMPLOYEES);
  assert.ok(r.employees.some((e) => e.id === "emp-recep"));
  assert.match(r.changes.join(" "), /Nadia Hassan joined/);
  const again = applyTeamMerges(r.employees, r.applied, SEED_EMPLOYEES);
  assert.equal(again.employees.filter((e) => e.id === "emp-recep").length, 1);
  assert.equal(again.changes.length, 0);
});
