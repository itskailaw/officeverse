import { test } from "node:test";
import assert from "node:assert/strict";
import { OfficeSim } from "../lib/office/sim.ts";
import { DEFAULT_LAYOUT } from "../lib/office/layout.ts";

// every restroom spot can be reached from the lobby, by the right person only
for (const gender of ["male", "female"] as const) {
  test(`${gender} staff reach every spot in their restroom`, () => {
    const sim = new OfficeSim(DEFAULT_LAYOUT);
    const room = gender === "male" ? "wc-m" : "wc-f";
    const spots = [...sim.seats.values()].filter((s) => s.roomId === room);
    assert.ok(spots.length >= 3, "restroom has spots");
    for (const spot of spots) {
      const id = `t-${spot.id}`;
      const a = sim.addAgent(id, "lobby-desk");
      a.gender = gender;
      a.x = 3;
      a.z = 23;
      assert.ok(sim.goToSeat(id, spot.id, "break"), `path to ${spot.id}`);
      a.timer = 999;
      let d = Infinity;
      for (let i = 0; i < 1600; i++) {
        sim.update(0.05);
        d = Math.min(d, Math.hypot(a.x - spot.x, a.z - spot.z));
      }
      assert.ok(d < 0.6, `${spot.id}: ended ${d.toFixed(2)} m away`);
      sim.removeAgent(id);
    }
  });
}

test("staff without a gender never pick a restroom", () => {
  const sim = new OfficeSim(DEFAULT_LAYOUT);
  sim.addAgent("x", "lobby-desk");
  assert.equal(sim.startRestroom("x"), false);
});
