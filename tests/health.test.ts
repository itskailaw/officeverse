import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulerCheck, storeChecks, transitions } from "../lib/integrations/health-rules.ts";

const now = Date.parse("2026-11-21T06:00:00Z");
const min = (m: number) => new Date(now - m * 60000).toISOString();

test("store checks: expired, stale sync, no pushes", () => {
  const base = { platform: "shopee" as const, status: "connected", lastSync: min(5), lastError: null, refreshExpires: null, lastPush: min(10), autoRun: null, lastScheduledRun: null };
  assert.deepEqual(storeChecks(base, now).map((c) => c.level), ["ok", "ok", "ok"]);
  assert.equal(storeChecks({ ...base, status: "expired" }, now)[0].level, "bad");
  assert.equal(storeChecks({ ...base, lastSync: min(90) }, now)[1].level, "warn");
  assert.equal(storeChecks({ ...base, lastSync: min(400) }, now)[1].level, "bad");
  assert.equal(storeChecks({ ...base, lastPush: null }, now)[2].level, "warn");
  assert.equal(storeChecks({ ...base, refreshExpires: new Date(now + 2 * 86400000).toISOString() }, now)[0].level, "warn");
});

test("scheduler check and alert transitions", () => {
  assert.equal(schedulerCheck(min(8), now).level, "ok");
  assert.equal(schedulerCheck(min(40), now).level, "warn");
  assert.equal(schedulerCheck(null, now).level, "bad");
  const a = schedulerCheck(null, now);
  const t1 = transitions({}, [a]);
  assert.equal(t1.broke.length, 1);
  const t2 = transitions(t1.next, [a]);
  assert.equal(t2.broke.length, 0, "no repeat alert");
  const t3 = transitions(t2.next, [schedulerCheck(min(3), now)]);
  assert.equal(t3.fixed.length, 1, "recovery announced");
});
