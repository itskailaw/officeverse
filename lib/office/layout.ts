// Default OfficeVerse floor plan (v2). World units are metres; x runs east, z runs south
// (towards the default camera). The building is 60 m x 33 m:
//
//   z 0-12   CEO Suite | Boardroom / Exec Assistant | Water Guardian | Finance & Strategy | Marketing & Creative
//   z 12-16  ─────────────────────────── Main Street ───────────────────────────
//   z 16-28  Reception | Kopitiam Pantry | Game Room | Artides Home | Amare | IT & Server
//   z 28-33  Garden strip (fenced, open to the sky)
//
// Rooms open onto Main Street through sliding doors or archways.

import type { Door, FurnitureItem, OfficeLayout, Room, WallLine } from "../data/types.ts";

const PI = Math.PI;
const HALF = PI / 2;

export const OFFICE_W = 60;
export const OFFICE_D = 33;
/** Bump when the default floor plan changes; saved layouts from older versions are replaced. */
export const LAYOUT_VERSION = 2;
/** Rooms staff go to on breaks. */
export const BREAK_ROOMS = ["kopitiam", "game", "garden", "corridor"];

export const ROOMS: Room[] = [
  { id: "ceo", name: "CEO Suite", departmentId: "dept-exec", x0: 0, z0: 0, x1: 14, z1: 12, floor: "wood" },
  { id: "boardroom", name: "Boardroom “Kinabalu”", departmentId: null, x0: 14, z0: 0, x1: 24, z1: 6.5, floor: "wood" },
  { id: "ea", name: "Executive Assistant", departmentId: null, x0: 14, z0: 6.5, x1: 24, z1: 12, floor: "carpet" },
  { id: "wgs", name: "Water Guardian Solution", departmentId: "dept-wgs", x0: 24, z0: 0, x1: 37, z1: 12, floor: "carpet" },
  { id: "finance", name: "Finance & Strategy", departmentId: "dept-finance", x0: 37, z0: 0, x1: 47, z1: 12, floor: "carpet" },
  { id: "marketing", name: "Marketing & Creative Studio", departmentId: "dept-marketing", x0: 47, z0: 0, x1: 60, z1: 12, floor: "carpet" },
  { id: "corridor", name: "Main Street", departmentId: null, x0: 0, z0: 12, x1: 60, z1: 16, floor: "tile" },
  { id: "reception", name: "Reception & Lobby", departmentId: null, x0: 0, z0: 16, x1: 10, z1: 28, floor: "tile" },
  { id: "kopitiam", name: "Kopitiam Pantry", departmentId: null, x0: 10, z0: 16, x1: 20, z1: 28, floor: "wood" },
  { id: "game", name: "Game Room", departmentId: null, x0: 20, z0: 16, x1: 33, z1: 28, floor: "dark" },
  { id: "artides", name: "Artides Home", departmentId: "dept-artides", x0: 33, z0: 16, x1: 43, z1: 28, floor: "carpet" },
  { id: "amare", name: "Amare Localization", departmentId: "dept-amare", x0: 43, z0: 16, x1: 50, z1: 28, floor: "carpet" },
  { id: "it", name: "IT & Server Room", departmentId: "dept-it", x0: 50, z0: 16, x1: 60, z1: 28, floor: "dark" },
  { id: "garden", name: "Garden", departmentId: null, x0: 0, z0: 28, x1: 60, z1: 33, floor: "grass" },
];

export const WALLS: WallLine[] = [
  // exterior shell (garden edge is a low fence)
  { a: [0, 0], b: [60, 0], kind: "exterior" },
  { a: [60, 0], b: [60, 28], kind: "exterior" },
  { a: [0, 0], b: [0, 28], kind: "exterior" },
  { a: [0, 28], b: [0, 33], kind: "fence" },
  { a: [60, 28], b: [60, 33], kind: "fence" },
  { a: [0, 33], b: [60, 33], kind: "fence" },
  // Main Street north side
  { a: [0, 12], b: [14, 12], kind: "glass" },
  { a: [14, 12], b: [60, 12], kind: "interior" },
  // Main Street south side (pantry and game room are glass so you can see in)
  { a: [0, 16], b: [10, 16], kind: "interior" },
  { a: [10, 16], b: [33, 16], kind: "glass" },
  { a: [33, 16], b: [60, 16], kind: "interior" },
  // north partitions
  { a: [14, 0], b: [14, 12], kind: "interior" },
  { a: [14, 6.5], b: [24, 6.5], kind: "glass" },
  { a: [24, 0], b: [24, 12], kind: "interior" },
  { a: [37, 0], b: [37, 12], kind: "interior" },
  { a: [47, 0], b: [47, 12], kind: "interior" },
  // south partitions
  { a: [10, 16], b: [10, 28], kind: "interior" },
  { a: [20, 16], b: [20, 28], kind: "interior" },
  { a: [33, 16], b: [33, 28], kind: "interior" },
  { a: [43, 16], b: [43, 28], kind: "interior" },
  { a: [50, 16], b: [50, 28], kind: "interior" },
  // garden side (glass)
  { a: [0, 28], b: [60, 28], kind: "glass" },
];

export const DOORS: Door[] = [
  { id: "door-ceo", x: 7, z: 12, axis: "x", width: 1.8 },
  { id: "arch-ea", x: 21.5, z: 12, axis: "x", width: 2.4, open: true },
  { id: "door-board", x: 16.5, z: 6.5, axis: "x", width: 1.6 },
  { id: "door-wgs", x: 30.5, z: 12, axis: "x", width: 1.6 },
  { id: "door-finance", x: 42, z: 12, axis: "x", width: 1.6 },
  { id: "door-marketing", x: 53.5, z: 12, axis: "x", width: 1.6 },
  { id: "arch-reception", x: 5, z: 16, axis: "x", width: 4, open: true },
  { id: "arch-kopitiam", x: 15, z: 16, axis: "x", width: 2.4, open: true },
  { id: "arch-game", x: 26.5, z: 16, axis: "x", width: 3, open: true },
  { id: "door-artides", x: 38, z: 16, axis: "x", width: 1.6 },
  { id: "door-amare", x: 46.5, z: 16, axis: "x", width: 1.6 },
  { id: "door-it", x: 55, z: 16, axis: "x", width: 1.6 },
  { id: "door-entrance", x: 5, z: 28, axis: "x", width: 2.4 },
  { id: "arch-kopitiam-garden", x: 15, z: 28, axis: "x", width: 2, open: true },
  { id: "door-game-garden", x: 26.5, z: 28, axis: "x", width: 1.6 },
  { id: "gate-garden", x: 5, z: 33, axis: "x", width: 2.4, open: true },
];

/** A pair of desks facing each other across a shared divider. */
function pod(prefix: string, roomId: string, x: number, zNorth: number, n1: number, n2: number): FurnitureItem[] {
  return [
    { id: `${prefix}-${n1}`, type: "workstation", roomId, x, z: zNorth, rot: 0 },
    { id: `${prefix}-${n2}`, type: "workstation", roomId, x, z: zNorth + 0.75, rot: PI },
  ];
}

const f = (id: string, type: FurnitureItem["type"], roomId: string, x: number, z: number, rot = 0, extra: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id,
  type,
  roomId,
  x,
  z,
  rot,
  ...extra,
});

export const FURNITURE: FurnitureItem[] = [
  // ── CEO suite ──
  f("ceo-rug", "rug", "ceo", 7, 4.7, 0, { size: [5, 3.6] }),
  f("ceo-desk", "exec_desk", "ceo", 7, 4.2, 0),
  f("ceo-trophies", "trophy_cabinet", "ceo", 7, 0.35, 0),
  f("ceo-books", "bookshelf", "ceo", 11.3, 0.3, 0),
  f("ceo-frames", "photo_frames", "ceo", 2.8, 0.3, 0),
  f("ceo-screen", "perf_screen", "ceo", 0.35, 5.2, HALF),
  f("ceo-visitor-1", "visitor_chair", "ceo", 6.4, 5.6, PI),
  f("ceo-visitor-2", "visitor_chair", "ceo", 7.6, 5.6, PI),
  f("ceo-sofa", "sofa", "ceo", 13.4, 8.4, -HALF),
  f("ceo-coffee", "coffee_table", "ceo", 12.25, 8.4, HALF),
  f("ceo-arm", "armchair", "ceo", 10.6, 8.4, HALF),
  f("ceo-plant-1", "plant", "ceo", 0.5, 0.5),
  f("ceo-plant-2", "plant", "ceo", 13.5, 0.5),
  f("ceo-plant-3", "plant", "ceo", 0.5, 11.4),
  f("ceo-plant-4", "plant", "ceo", 13.5, 11.4),
  f("ceo-lamp", "floor_lamp", "ceo", 0.45, 9),

  // ── Boardroom ──
  f("meeting-table", "meeting_table", "boardroom", 19, 3.2, 0),
  f("meet-screen", "tv_screen", "boardroom", 19, 0.3, 0),
  f("meet-pendant-1", "pendant_light", "boardroom", 17.6, 3.2),
  f("meet-pendant-2", "pendant_light", "boardroom", 19, 3.2),
  f("meet-pendant-3", "pendant_light", "boardroom", 20.4, 3.2),
  f("meet-plant-1", "plant", "boardroom", 14.5, 0.5),
  f("meet-plant-2", "plant", "boardroom", 23.5, 0.5),

  // ── Executive assistant (Sophia) ──
  f("reception-desk", "reception_desk", "ea", 19, 9.3, 0),
  f("ea-arm-1", "armchair", "ea", 14.7, 9.8, HALF),
  f("ea-arm-2", "armchair", "ea", 14.7, 11, HALF),
  f("ea-plant-1", "plant", "ea", 23.5, 7),
  f("ea-plant-2", "plant", "ea", 23.5, 11.5),
  f("ea-lamp", "floor_lamp", "ea", 14.5, 7),

  // ── Water Guardian Solution (e-commerce) ──
  ...pod("ws-wgs", "wgs", 26.6, 3, 1, 2),
  ...pod("ws-wgs", "wgs", 30.5, 3, 3, 4),
  ...pod("ws-wgs", "wgs", 34.4, 3, 5, 6),
  f("wgs-cab-1", "filing_cabinet", "wgs", 24.6, 0.3),
  f("wgs-cab-2", "filing_cabinet", "wgs", 36.4, 0.3),
  f("wgs-packing", "packing_table", "wgs", 34.4, 8.6),
  f("wgs-shelf", "product_shelf", "wgs", 27, 11.6, PI),
  f("wgs-board", "whiteboard", "wgs", 24.35, 7, HALF),
  f("wgs-standee", "standee", "wgs", 33.2, 11.6),
  f("wgs-plant-1", "plant", "wgs", 24.5, 11.5),
  f("wgs-plant-2", "plant", "wgs", 36.5, 11.5),

  // ── Finance & Strategy ──
  ...pod("ws-fin", "finance", 39.8, 3, 1, 2),
  ...pod("ws-fin", "finance", 44.2, 3, 3, 4),
  f("fin-books", "bookshelf", "finance", 42, 0.3),
  f("fin-board", "whiteboard", "finance", 46.65, 7, -HALF),
  f("fin-table", "round_table", "finance", 40, 8.6),
  f("fin-standee", "standee", "finance", 44.6, 11.6),
  f("fin-plant-1", "plant", "finance", 37.5, 11.5),
  f("fin-plant-2", "plant", "finance", 46.5, 11.5),

  // ── Marketing & Creative Studio ──
  ...pod("ws-mkt", "marketing", 49.8, 3, 1, 2),
  ...pod("ws-mkt", "marketing", 53.8, 3, 3, 4),
  f("mkt-board", "whiteboard", "marketing", 49, 0.3),
  f("mkt-books", "bookshelf", "marketing", 57.6, 0.3),
  f("mkt-set", "photo_set", "marketing", 58.9, 7.6, -HALF),
  f("mkt-standee", "standee", "marketing", 51, 11.6),
  f("mkt-plant-1", "plant", "marketing", 47.5, 11.5),
  f("mkt-plant-2", "plant", "marketing", 59.5, 11.5),
  f("mkt-plant-3", "plant", "marketing", 59.5, 0.5),

  // ── Main Street ──
  f("cor-plant-1", "plant", "corridor", 3, 12.45),
  f("cor-plant-2", "plant", "corridor", 11, 12.45),
  f("cor-plant-3", "plant", "corridor", 25.5, 12.45),
  f("cor-plant-4", "plant", "corridor", 36, 12.45),
  f("cor-plant-5", "plant", "corridor", 47.5, 12.45),
  f("cor-plant-6", "plant", "corridor", 58.5, 12.45),
  f("cor-bean-1", "bean_bag", "corridor", 9.2, 15.25, PI, { color: "#f59e0b" }),
  f("cor-bean-2", "bean_bag", "corridor", 32, 15.25, PI, { color: "#8b5cf6" }),
  f("cor-bean-3", "bean_bag", "corridor", 33.1, 15.25, PI, { color: "#f59e0b" }),
  f("cor-bean-4", "bean_bag", "corridor", 50.5, 15.25, PI, { color: "#0ea5e9" }),
  f("cor-bike-1", "bike", "corridor", 19, 15.5, HALF, { color: "#ef4444" }),
  f("cor-bike-2", "bike", "corridor", 42, 15.5, HALF, { color: "#facc15" }),
  f("cor-bike-3", "bike", "corridor", 58.4, 15.5, HALF, { color: "#22c55e" }),
  f("cor-cooler", "water_cooler", "corridor", 0.45, 14, HALF),

  // ── Reception & lobby ──
  f("lobby-desk", "reception_desk", "reception", 5, 21.5, 0),
  f("rec-sofa", "sofa", "reception", 0.6, 25, HALF),
  f("rec-coffee", "coffee_table", "reception", 1.85, 25, HALF),
  f("rec-logo", "tv_screen", "reception", 9.75, 22, -HALF),
  f("rec-plant-1", "plant", "reception", 0.5, 16.5),
  f("rec-plant-2", "plant", "reception", 9.5, 16.5),
  f("rec-plant-3", "plant", "reception", 0.5, 27.5),
  f("rec-plant-4", "plant", "reception", 9.5, 27.5),
  f("rec-pendant-1", "pendant_light", "reception", 4.2, 21.5),
  f("rec-pendant-2", "pendant_light", "reception", 5.8, 21.5),
  f("rec-lamp", "floor_lamp", "reception", 9.5, 25.8),

  // ── Kopitiam pantry ──
  f("kop-bar", "coffee_bar", "kopitiam", 19.35, 21.5, -HALF),
  f("kop-vending", "vending_machine", "kopitiam", 10.55, 17.6, HALF),
  f("kop-fridge", "fridge", "kopitiam", 10.5, 19.2, HALF),
  f("kop-snacks", "snack_shelf", "kopitiam", 10.3, 21.6, HALF),
  f("kop-table-1", "round_table", "kopitiam", 12.6, 23.4),
  f("kop-table-2", "round_table", "kopitiam", 16, 23.4),
  f("kop-table-3", "round_table", "kopitiam", 12.6, 26.3),
  f("kop-table-4", "round_table", "kopitiam", 16.6, 26.3),
  f("kop-pendant-1", "pendant_light", "kopitiam", 12.6, 23.4),
  f("kop-pendant-2", "pendant_light", "kopitiam", 16, 23.4),
  f("kop-cooler", "water_cooler", "kopitiam", 19.5, 17.2, -HALF),
  f("kop-plant-1", "plant", "kopitiam", 19.5, 27.5),
  f("kop-plant-2", "plant", "kopitiam", 10.5, 27.5),

  // ── Game room ──
  f("game-court", "court", "game", 24.6, 22, 0, { size: [8.2, 10.8] }),
  f("game-hoop", "hoop", "game", 20.35, 22, HALF),
  f("game-pingpong", "ping_pong", "game", 29.6, 19.6, 0),
  f("game-foosball", "foosball", "game", 29.6, 24.1, 0),
  f("game-arcade-1", "arcade", "game", 32.55, 18.6, -HALF, { color: "#ec4899" }),
  f("game-arcade-2", "arcade", "game", 32.55, 19.7, -HALF, { color: "#22d3ee" }),
  f("game-sofa", "sofa", "game", 32.45, 26.4, -HALF, { color: "#4c1d95" }),
  f("game-bean-1", "bean_bag", "game", 30.6, 27.3, PI, { color: "#fdb927" }),
  f("game-plant", "plant", "game", 32.5, 22.3),
  f("game-pendant-1", "pendant_light", "game", 29.6, 19.6),

  // ── Artides Home ──
  ...pod("ws-art", "artides", 35.6, 19.6, 1, 2),
  ...pod("ws-art", "artides", 40.4, 19.6, 3, 4),
  f("art-display", "kitchen_counter", "artides", 38, 27.4, PI, { size: [3, 0.65], color: "#8a5a35" }),
  f("art-samples", "bookshelf", "artides", 33.3, 23.5, HALF),
  f("art-standee", "standee", "artides", 41.6, 16.4),
  f("art-plant-1", "plant", "artides", 42.5, 27.5),
  f("art-plant-2", "plant", "artides", 33.5, 16.5),

  // ── Amare Localization ──
  ...pod("ws-ama", "amare", 46.5, 19.6, 1, 2),
  f("ama-books-1", "bookshelf", "amare", 49.7, 23, -HALF),
  f("ama-books-2", "bookshelf", "amare", 43.3, 23, HALF),
  f("ama-table", "round_table", "amare", 46.5, 25.3),
  f("ama-standee", "standee", "amare", 48.8, 16.4),
  f("ama-plant-1", "plant", "amare", 43.5, 27.5),
  f("ama-plant-2", "plant", "amare", 49.5, 27.5),

  // ── IT & Server room ──
  f("ws-it-1", "workstation", "it", 50.6, 22, -HALF),
  f("it-rack-1", "server_rack", "it", 59.4, 18, -HALF),
  f("it-rack-2", "server_rack", "it", 59.4, 18.8, -HALF),
  f("it-rack-3", "server_rack", "it", 59.4, 19.6, -HALF),
  f("it-rack-4", "server_rack", "it", 59.4, 20.4, -HALF),
  f("it-rack-5", "server_rack", "it", 59.4, 21.2, -HALF),
  f("it-cabinet", "filing_cabinet", "it", 56, 27.6, PI, { color: "#334155" }),
  f("it-plant", "plant", "it", 50.5, 16.5),

  // ── Garden ──
  f("gar-hammock-1", "hammock", "garden", 1.9, 30.6, 0),
  f("gar-hammock-2", "hammock", "garden", 8.6, 30.6, 0),
  f("gar-pod-1", "nap_pod", "garden", 19, 30.8, 0),
  f("gar-pod-2", "nap_pod", "garden", 21.2, 30.8, 0),
  f("gar-pod-3", "nap_pod", "garden", 23.4, 30.8, 0),
  f("gar-bbq", "bbq", "garden", 31, 31.6, 0),
  f("gar-bench-1", "bench", "garden", 35.5, 31.9, PI),
  f("gar-bench-2", "bench", "garden", 39.5, 31.9, PI),
  f("gar-bench-3", "bench", "garden", 43.5, 31.9, PI),
  f("gar-plant-1", "plant", "garden", 12.4, 32.3),
  f("gar-plant-2", "plant", "garden", 28, 32.3),
  f("gar-plant-3", "plant", "garden", 47.5, 30.5),
  f("gar-plant-4", "plant", "garden", 50.5, 31.5),
  f("gar-plant-5", "plant", "garden", 53.5, 30.5),
  f("gar-plant-6", "plant", "garden", 56.5, 31.5),
  f("gar-plant-7", "plant", "garden", 59.4, 30.5),
];

export const DEFAULT_LAYOUT: OfficeLayout = {
  width: OFFICE_W,
  depth: OFFICE_D,
  rooms: ROOMS,
  walls: WALLS,
  doors: DOORS,
  furniture: FURNITURE,
};

export const CEO_DESK_ID = "ceo-desk";
export const MEETING_TABLE_ID = "meeting-table";
export const CEO_MEETING_SEAT_INDEX = 9;

export function roomAt(rooms: Room[], x: number, z: number): Room | undefined {
  // prefer non-corridor rooms
  return rooms.find((r) => r.id !== "corridor" && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ??
    rooms.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

/** Split wall lines around door openings into renderable / blocking segments. */
export function wallSegments(walls: WallLine[], doors: Door[]) {
  const segs: { a: [number, number]; b: [number, number]; kind: WallLine["kind"] }[] = [];
  for (const w of walls) {
    const horizontal = w.a[1] === w.b[1];
    const lo = horizontal ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
    const hi = horizontal ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
    const fixed = horizontal ? w.a[1] : w.a[0];
    const gaps = doors
      .filter((d) =>
        horizontal
          ? d.axis === "x" && Math.abs(d.z - fixed) < 0.01 && d.x > lo && d.x < hi
          : d.axis === "z" && Math.abs(d.x - fixed) < 0.01 && d.z > lo && d.z < hi,
      )
      .map((d) => {
        const c = horizontal ? d.x : d.z;
        return [c - d.width / 2, c + d.width / 2] as [number, number];
      })
      .sort((p, q) => p[0] - q[0]);
    let cur = lo;
    for (const [g0, g1] of gaps) {
      if (g0 > cur) segs.push(mk(cur, g0));
      cur = Math.max(cur, g1);
    }
    if (cur < hi) segs.push(mk(cur, hi));
    function mk(s: number, e: number) {
      return horizontal
        ? { a: [s, fixed] as [number, number], b: [e, fixed] as [number, number], kind: w.kind }
        : { a: [fixed, s] as [number, number], b: [fixed, e] as [number, number], kind: w.kind };
    }
  }
  return segs;
}
