import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT } from "../lib/office/layout.ts";
import { buildNavGrid, findPath, isWalkablePoint, lineOfSight, nearestWalkable } from "../lib/office/navgrid.ts";
import { seatsFor } from "../lib/office/catalog.ts";
import { wallSegments } from "../lib/office/layout.ts";

const grid = buildNavGrid(DEFAULT_LAYOUT);
const seats = DEFAULT_LAYOUT.furniture.flatMap(seatsFor);
const hub = { x: 30, z: 14 }; // middle of Main Street

test("corridor hub is walkable", () => {
  assert.ok(isWalkablePoint(grid, hub.x, hub.z));
});

test("every seat approach is reachable from the corridor", () => {
  const unreachable: string[] = [];
  for (const s of seats) {
    const p = findPath(grid, hub, { x: s.ax, z: s.az });
    const near = nearestWalkable(grid, s.ax, s.az);
    if (!p || !near || Math.hypot(near.x - s.ax, near.z - s.az) > 0.6) unreachable.push(`${s.id} (${s.ax.toFixed(2)},${s.az.toFixed(2)})`);
  }
  assert.deepEqual(unreachable, []);
});

test("paths never cross walls", () => {
  const segs = wallSegments(DEFAULT_LAYOUT.walls, DEFAULT_LAYOUT.doors);
  for (const s of seats) {
    const p = findPath(grid, hub, { x: s.ax, z: s.az })!;
    let prev = nearestWalkable(grid, hub.x, hub.z)!;
    for (const q of p) {
      assert.ok(lineOfSight(grid, prev, q, 0), `segment into ${s.id} blocked`);
      for (const w of segs) {
        // segment-segment intersection
        const d = (q.x - prev.x) * (w.b[1] - w.a[1]) - (q.z - prev.z) * (w.b[0] - w.a[0]);
        if (Math.abs(d) < 1e-9) continue;
        const t = ((w.a[0] - prev.x) * (w.b[1] - w.a[1]) - (w.a[1] - prev.z) * (w.b[0] - w.a[0])) / d;
        const u = ((w.a[0] - prev.x) * (q.z - prev.z) - (w.a[1] - prev.z) * (q.x - prev.x)) / d;
        assert.ok(!(t > 0 && t < 1 && u > 0 && u < 1), `path to ${s.id} crosses wall`);
      }
      prev = q;
    }
  }
});

test("seat ids are unique", () => {
  const ids = seats.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});
