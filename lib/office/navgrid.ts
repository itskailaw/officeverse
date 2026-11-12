// Navigation grid + A* pathfinding with corner-cut prevention and
// line-of-sight path smoothing. Pure TypeScript so it can be unit-tested
// in Node and later moved into a Web Worker if the office grows.

import type { OfficeLayout } from "../data/types.ts";
import { CATALOG, insideFootprint } from "./catalog.ts";
import { wallSegments } from "./layout.ts";

export const CELL = 0.5;
const WALL_CLEARANCE = 0.32;
const FURNITURE_PAD = 0.18;

export interface Vec2 {
  x: number;
  z: number;
}

export interface NavGrid {
  cols: number;
  rows: number;
  cell: number;
  /** 1 = blocked */
  blocked: Uint8Array;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

export function buildNavGrid(layout: OfficeLayout, cell = CELL): NavGrid {
  const cols = Math.round(layout.width / cell);
  const rows = Math.round(layout.depth / cell);
  const blocked = new Uint8Array(cols * rows);
  const segs = wallSegments(layout.walls, layout.doors);
  const blockers = layout.furniture.filter((f) => CATALOG[f.type].blocks);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell;
      const z = (r + 0.5) * cell;
      let b = false;
      for (const s of segs) {
        if (distToSegment(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) < WALL_CLEARANCE) {
          b = true;
          break;
        }
      }
      if (!b) {
        for (const f of blockers) {
          if (insideFootprint(f, x, z, FURNITURE_PAD)) {
            b = true;
            break;
          }
        }
      }
      blocked[r * cols + c] = b ? 1 : 0;
    }
  }
  return { cols, rows, cell, blocked };
}

export const toCell = (g: NavGrid, x: number, z: number) => ({
  c: Math.min(g.cols - 1, Math.max(0, Math.floor(x / g.cell))),
  r: Math.min(g.rows - 1, Math.max(0, Math.floor(z / g.cell))),
});

export const cellCenter = (g: NavGrid, c: number, r: number): Vec2 => ({
  x: (c + 0.5) * g.cell,
  z: (r + 0.5) * g.cell,
});

export function isWalkable(g: NavGrid, c: number, r: number) {
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows && g.blocked[r * g.cols + c] === 0;
}

export function isWalkablePoint(g: NavGrid, x: number, z: number) {
  if (x < 0 || z < 0) return false;
  const c = Math.floor(x / g.cell);
  const r = Math.floor(z / g.cell);
  return isWalkable(g, c, r);
}

/** Breadth-first search for the nearest walkable cell to (x, z). */
export function nearestWalkable(g: NavGrid, x: number, z: number, maxRadius = 40): Vec2 | null {
  const start = toCell(g, x, z);
  if (isWalkable(g, start.c, start.r)) return cellCenter(g, start.c, start.r);
  let best = null as { c: number; r: number; d: number } | null;
  for (let rad = 1; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = start.c + dc;
        const r = start.r + dr;
        if (!isWalkable(g, c, r)) continue;
        const p = cellCenter(g, c, r);
        const d = Math.hypot(p.x - x, p.z - z);
        if (!best || d < best.d) best = { c, r, d };
      }
    }
    if (best) return cellCenter(g, best.c, best.r);
  }
  return null;
}

// Binary min-heap keyed on f-score.
class Heap {
  private items: number[] = [];
  private scores: Float32Array;
  constructor(scores: Float32Array) {
    this.scores = scores;
  }
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.scores[a[p]] <= this.scores[a[n]]) break;
      [a[p], a[n]] = [a[n], a[p]];
      n = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = 2 * n + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && this.scores[a[l]] < this.scores[a[m]]) m = l;
        if (r < a.length && this.scores[a[r]] < this.scores[a[m]]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        n = m;
      }
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** A* over the grid. Returns cell-centre waypoints (excluding start) or null if unreachable. */
export function findPath(g: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  const s0 = nearestWalkable(g, from.x, from.z);
  const t0 = nearestWalkable(g, to.x, to.z);
  if (!s0 || !t0) return null;
  const s = toCell(g, s0.x, s0.z);
  const t = toCell(g, t0.x, t0.z);
  const n = g.cols * g.rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const fScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const si = s.r * g.cols + s.c;
  const ti = t.r * g.cols + t.c;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - t.c);
    const dz = Math.abs(r - t.r);
    return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
  };
  gScore[si] = 0;
  fScore[si] = h(s.c, s.r);
  const open = new Heap(fScore);
  open.push(si);
  while (open.size) {
    const cur = open.pop();
    if (cur === ti) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cc = cur % g.cols;
    const cr = (cur - cc) / g.cols;
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!isWalkable(g, nc, nr)) continue;
      // no corner cutting
      if (dc !== 0 && dr !== 0 && (!isWalkable(g, cc + dc, cr) || !isWalkable(g, cc, cr + dr))) continue;
      const ni = nr * g.cols + nc;
      if (closed[ni]) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        fScore[ni] = tentative + h(nc, nr);
        came[ni] = cur;
        open.push(ni);
      }
    }
  }
  if (si !== ti && came[ti] === -1) return null;
  const cells: number[] = [];
  for (let i = ti; i !== -1 && i !== si; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => cellCenter(g, i % g.cols, Math.floor(i / g.cols)));
  return smoothPath(g, s0, pts);
}

/** Thick line-of-sight check: samples the segment and two parallel offsets. */
export function lineOfSight(g: NavGrid, a: Vec2, b: Vec2, halfWidth = 0.14) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const nx = -dz / len;
  const nz = dx / len;
  const steps = Math.ceil(len / 0.1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    if (!isWalkablePoint(g, x, z)) return false;
    if (!isWalkablePoint(g, x + nx * halfWidth, z + nz * halfWidth)) return false;
    if (!isWalkablePoint(g, x - nx * halfWidth, z - nz * halfWidth)) return false;
  }
  return true;
}

/** Greedy string-pulling: skip waypoints while there is clear line of sight. */
export function smoothPath(g: NavGrid, start: Vec2, pts: Vec2[]): Vec2[] {
  if (pts.length <= 1) return pts;
  const out: Vec2[] = [];
  let anchor = start;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineOfSight(g, anchor, pts[j])) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
