import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, CEO_DESK_ID } from "../lib/office/layout.ts";
import { OfficeSim } from "../lib/office/sim.ts";
import { isWalkablePoint } from "../lib/office/navgrid.ts";

const homes = ["ws-wgs-1", "ws-wgs-2", "ws-fin-3", "ws-mkt-4", "ws-art-2", "ws-ama-1", "ws-it-1", "reception-desk"];

function run(sim: OfficeSim, seconds: number, check?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    sim.update(1 / 30);
    check?.();
  }
}

test("agents walk to the meeting room, sit, and return to their desks", () => {
  const sim = new OfficeSim(DEFAULT_LAYOUT);
  sim.ambientLife = false;
  sim.addAgent("ceo", CEO_DESK_ID, true);
  homes.forEach((h, i) => sim.addAgent(`e${i}`, h));
  const ids = homes.map((_, i) => `e${i}`);
  sim.callMeeting(ids, "ceo");
  const offGrid = new Set<string>();
  run(sim, 60, () => {
    for (const a of sim.agents.values()) {
      if (a.pose === "walk" && !a.glide && !isWalkablePoint(sim.grid, a.x, a.z)) offGrid.add(a.id);
    }
  });
  assert.deepEqual([...offGrid], [], "walking agents stayed on walkable cells");
  for (const id of [...ids, "ceo"]) {
    const a = sim.agents.get(id)!;
    assert.equal(a.pose, "sit", `${id} seated in meeting`);
    assert.equal(sim.seat(a.seatId)!.furnitureId, "meeting-table");
  }
  sim.endMeeting(ids, "ceo");
  run(sim, 60);
  homes.forEach((h, i) => {
    const a = sim.agents.get(`e${i}`)!;
    assert.equal(a.seatId, h);
    assert.equal(a.pose, "sit");
  });
  assert.equal(sim.agents.get("ceo")!.seatId, CEO_DESK_ID);
});

test("dropping an employee on a free workstation reassigns it", () => {
  const sim = new OfficeSim(DEFAULT_LAYOUT);
  sim.addAgent("e1", "ws-wgs-1");
  sim.pickUp("e1");
  const free = sim.seat("ws-fin-1")!;
  const r = sim.drop("e1", free.x + 0.2, free.z);
  assert.equal(r.reassignedTo, "ws-fin-1");
  assert.equal(sim.agents.get("e1")!.pose, "sit");
});

test("dropped employee in the corridor walks back to the desk", () => {
  const sim = new OfficeSim(DEFAULT_LAYOUT);
  sim.ambientLife = false;
  sim.addAgent("e1", "ws-art-3");
  sim.pickUp("e1");
  sim.drop("e1", 3, 14);
  run(sim, 90);
  const a = sim.agents.get("e1")!;
  assert.equal(a.seatId, "ws-art-3");
  assert.equal(a.pose, "sit");
});

test("breaks send staff to the fun rooms (pantry, game room, garden, Main Street)", () => {
  const sim = new OfficeSim(DEFAULT_LAYOUT);
  const ids = Array.from({ length: 12 }, (_, i) => `b${i}`);
  ids.forEach((id, i) => sim.addAgent(id, homes[i % homes.length] ?? null));
  for (const id of ids) sim.startBreak(id);
  const rooms = new Set<string>();
  for (const id of ids) {
    const a = sim.agents.get(id)!;
    if (a.seatId) rooms.add(sim.seat(a.seatId)!.roomId);
  }
  assert.ok(rooms.size > 0);
  for (const r of rooms) assert.ok(["kopitiam", "game", "garden", "corridor"].includes(r), `unexpected break room ${r}`);
});
