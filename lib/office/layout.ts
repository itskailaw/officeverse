// Default OfficeVerse floor plan (v3, open plan). World units are metres; x runs east,
// z runs south (towards the default camera). The building is 52 m x 30 m:
//
//   z 0-11   CEO Suite | Boardroom / Exec Assistant | OPEN WORK FLOOR: WGS · Finance · Marketing
//   z 11-15  ─────────────────────────── Main Street ───────────────────────────
//   z 15-25  Reception | Kopitiam | Game Room | Artides studio | Amare studio | IT Lab / Library nook
//   z 25-30  Garden strip (fenced, open to the sky)
//
// The three e-commerce/shared teams share one open floor (zones = coloured carpets,
// planters and phone booths in between); Artides and Amare get glass studios.

import type { Door, FurnitureItem, OfficeLayout, Room, WallLine } from "../data/types.ts";

const PI = Math.PI;
const HALF = PI / 2;

export const OFFICE_W = 52;
export const OFFICE_D = 30;
/** Bump when the default floor plan changes; saved layouts from older versions are replaced. */
export const LAYOUT_VERSION = 3;
/** Rooms staff go to on breaks. */
export const BREAK_ROOMS = ["kopitiam", "game", "garden", "corridor", "nook"];

export const ROOMS: Room[] = [
  { id: "ceo", name: "CEO Suite", departmentId: "dept-exec", x0: 0, z0: 0, x1: 12, z1: 11, floor: "wood" },
  { id: "boardroom", name: "Boardroom “Kinabalu”", departmentId: null, x0: 12, z0: 0, x1: 21, z1: 6, floor: "wood" },
  { id: "ea", name: "Executive Assistant", departmentId: null, x0: 12, z0: 6, x1: 21, z1: 11, floor: "carpet" },
  { id: "wgs", name: "Water Guardian Solution", departmentId: "dept-wgs", x0: 21, z0: 0, x1: 33, z1: 11, floor: "carpet" },
  { id: "finance", name: "Finance & Strategy", departmentId: "dept-finance", x0: 33, z0: 0, x1: 42, z1: 11, floor: "carpet" },
  { id: "marketing", name: "Marketing & Creative Studio", departmentId: "dept-marketing", x0: 42, z0: 0, x1: 52, z1: 11, floor: "carpet" },
  { id: "corridor", name: "Main Street", departmentId: null, x0: 0, z0: 11, x1: 52, z1: 15, floor: "tile" },
  { id: "reception", name: "Reception & Lobby", departmentId: null, x0: 0, z0: 15, x1: 9, z1: 25, floor: "tile" },
  { id: "kopitiam", name: "Kopitiam Pantry", departmentId: null, x0: 9, z0: 15, x1: 18, z1: 25, floor: "wood" },
  { id: "game", name: "Game Room", departmentId: null, x0: 18, z0: 15, x1: 30, z1: 25, floor: "dark" },
  { id: "artides", name: "Artides Home", departmentId: "dept-artides", x0: 30, z0: 15, x1: 38, z1: 25, floor: "carpet" },
  { id: "amare", name: "Amare Localization", departmentId: "dept-amare", x0: 38, z0: 15, x1: 44, z1: 25, floor: "carpet" },
  { id: "it", name: "IT Lab", departmentId: "dept-it", x0: 44, z0: 15, x1: 52, z1: 21, floor: "dark" },
  { id: "nook", name: "Library Nook", departmentId: null, x0: 44, z0: 21, x1: 52, z1: 25, floor: "wood" },
  { id: "garden", name: "Garden", departmentId: null, x0: 0, z0: 25, x1: 52, z1: 30, floor: "grass" },
];

export const WALLS: WallLine[] = [
  // exterior shell (garden edge is a low fence)
  { a: [0, 0], b: [52, 0], kind: "exterior" },
  { a: [52, 0], b: [52, 25], kind: "exterior" },
  { a: [0, 0], b: [0, 25], kind: "exterior" },
  { a: [0, 25], b: [0, 30], kind: "fence" },
  { a: [52, 25], b: [52, 30], kind: "fence" },
  { a: [0, 30], b: [52, 30], kind: "fence" },
  // executive wing
  { a: [12, 0], b: [12, 11], kind: "interior" },
  { a: [12, 6], b: [21, 6], kind: "glass" },
  { a: [21, 0], b: [21, 11], kind: "interior" },
  // Main Street north side (open work floor behind glass with two wide openings)
  { a: [0, 11], b: [12, 11], kind: "glass" },
  { a: [12, 11], b: [21, 11], kind: "interior" },
  { a: [21, 11], b: [52, 11], kind: "glass" },
  // Main Street south side
  { a: [0, 15], b: [9, 15], kind: "interior" },
  { a: [9, 15], b: [44, 15], kind: "glass" },
  { a: [44, 15], b: [52, 15], kind: "interior" },
  // south partitions
  { a: [9, 15], b: [9, 25], kind: "interior" },
  { a: [18, 15], b: [18, 25], kind: "interior" },
  { a: [30, 15], b: [30, 25], kind: "glass" },
  { a: [38, 15], b: [38, 25], kind: "glass" },
  { a: [44, 15], b: [44, 25], kind: "interior" },
  { a: [44, 21], b: [52, 21], kind: "glass" },
  // garden side (glass)
  { a: [0, 25], b: [52, 25], kind: "glass" },
];

export const DOORS: Door[] = [
  { id: "door-ceo", x: 6, z: 11, axis: "x", width: 1.8 },
  { id: "arch-ea", x: 19, z: 11, axis: "x", width: 2.2, open: true },
  { id: "door-board", x: 14, z: 6, axis: "x", width: 1.6 },
  { id: "arch-work-1", x: 27, z: 11, axis: "x", width: 3, open: true },
  { id: "arch-work-2", x: 44, z: 11, axis: "x", width: 3, open: true },
  { id: "arch-reception", x: 4.5, z: 15, axis: "x", width: 4, open: true },
  { id: "arch-kopitiam", x: 13.5, z: 15, axis: "x", width: 2.4, open: true },
  { id: "arch-game", x: 24, z: 15, axis: "x", width: 3, open: true },
  { id: "door-artides", x: 34, z: 15, axis: "x", width: 1.6 },
  { id: "door-amare", x: 41, z: 15, axis: "x", width: 1.6 },
  { id: "door-it", x: 48, z: 15, axis: "x", width: 1.6 },
  { id: "door-nook", x: 46, z: 21, axis: "x", width: 1.6 },
  { id: "door-entrance", x: 4.5, z: 25, axis: "x", width: 2.4 },
  { id: "arch-kopitiam-garden", x: 13.5, z: 25, axis: "x", width: 2, open: true },
  { id: "door-game-garden", x: 24, z: 25, axis: "x", width: 1.6 },
  { id: "door-nook-garden", x: 50, z: 25, axis: "x", width: 1.6 },
  { id: "gate-garden", x: 4.5, z: 30, axis: "x", width: 2.4, open: true },
];

/** A pair of desks facing each other across a shared divider. */
function pod(prefix: string, roomId: string, x: number, zNorth: number, n1: number | string, n2: number | string): FurnitureItem[] {
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
  f("ceo-rug", "rug", "ceo", 6, 4.4, 0, { size: [4.6, 3.4] }),
  f("ceo-desk", "exec_desk", "ceo", 6, 4, 0),
  f("ceo-trophies", "trophy_cabinet", "ceo", 6, 0.35, 0),
  f("ceo-books", "bookshelf", "ceo", 9.9, 0.3, 0),
  f("ceo-frames", "photo_frames", "ceo", 2.3, 0.3, 0),
  f("ceo-screen", "perf_screen", "ceo", 0.35, 4.8, HALF),
  f("ceo-visitor-1", "visitor_chair", "ceo", 5.4, 5.4, PI),
  f("ceo-visitor-2", "visitor_chair", "ceo", 6.6, 5.4, PI),
  f("ceo-sofa", "sofa", "ceo", 11.4, 8.2, -HALF),
  f("ceo-coffee", "coffee_table", "ceo", 10.25, 8.2, HALF),
  f("ceo-arm", "armchair", "ceo", 8.7, 8.2, HALF),
  f("ceo-plant-1", "plant", "ceo", 0.5, 0.5),
  f("ceo-plant-2", "plant", "ceo", 11.5, 0.5),
  f("ceo-plant-3", "plant", "ceo", 0.5, 10.4),
  f("ceo-plant-4", "plant", "ceo", 11.5, 10.4),
  f("ceo-lamp", "floor_lamp", "ceo", 0.45, 8.4),

  // ── Boardroom ──
  f("meeting-table", "meeting_table", "boardroom", 16.5, 3, 0),
  f("meet-screen", "tv_screen", "boardroom", 16.5, 0.3, 0),
  f("meet-pendant-1", "pendant_light", "boardroom", 15.1, 3),
  f("meet-pendant-2", "pendant_light", "boardroom", 16.5, 3),
  f("meet-pendant-3", "pendant_light", "boardroom", 17.9, 3),
  f("meet-plant-1", "plant", "boardroom", 12.5, 0.5),
  f("meet-plant-2", "plant", "boardroom", 20.5, 0.5),
  f("meet-art", "wall_art", "boardroom", 20.85, 3, -HALF, { color: "#1e3a5f" }),

  // ── Executive assistant (Sophia) ──
  f("reception-desk", "reception_desk", "ea", 16.5, 8.6, 0),
  f("ea-arm-1", "armchair", "ea", 12.7, 8.6, HALF),
  f("ea-arm-2", "armchair", "ea", 12.7, 9.8, HALF),
  f("ea-plant-1", "plant", "ea", 20.5, 6.5),
  f("ea-plant-2", "plant", "ea", 20.5, 10.5),
  f("ea-art", "wall_art", "ea", 20.85, 8.6, -HALF, { color: "#7c3aed" }),

  // ── Open work floor · Water Guardian Solution ──
  ...pod("ws-wgs", "wgs", 23.6, 2.8, 1, 2),
  ...pod("ws-wgs", "wgs", 27, 2.8, 3, 4),
  ...pod("ws-wgs", "wgs", 30.4, 2.8, 5, 6),
  f("wgs-cab-1", "filing_cabinet", "wgs", 21.6, 0.3),
  f("wgs-shelf", "product_shelf", "wgs", 27, 0.3),
  f("wgs-packing", "packing_table", "wgs", 30.3, 7.6),
  f("wgs-parcels", "parcel_stack", "wgs", 31.9, 9.6),
  f("wgs-parcels-2", "parcel_stack", "wgs", 28.7, 9.9),
  f("wgs-printer", "printer", "wgs", 22.2, 10.35, PI),
  f("wgs-board", "whiteboard", "wgs", 21.35, 6.4, HALF),
  f("wgs-standee", "standee", "wgs", 24.2, 10.5),
  f("wgs-plant-1", "plant", "wgs", 21.5, 8.9),
  f("wgs-art", "wall_art", "wgs", 32.2, 0.12, 0, { color: "#0ea5e9" }),

  // between WGS and Finance: phone booths + planters
  f("booth-1", "phone_booth", "wgs", 33, 8.1, HALF),
  f("booth-2", "phone_booth", "finance", 33, 9.5, HALF),
  f("div-1", "planter_divider", "finance", 33, 5.9, HALF, { size: [2.2, 0.45] }),

  // ── Open work floor · Finance & Strategy ──
  ...pod("ws-fin", "finance", 35.6, 2.8, 1, 2),
  ...pod("ws-fin", "finance", 39.4, 2.8, 3, 4),
  ...pod("ws-spare", "finance", 35.6, 6.6, 1, 2),
  f("fin-books", "bookshelf", "finance", 37.5, 0.3),
  f("fin-chart", "tv_screen", "finance", 40.6, 0.3, 0),
  f("fin-huddle", "standing_table", "finance", 39.9, 8.5),
  f("fin-plant", "plant", "finance", 41.4, 10.4),
  f("fin-standee", "standee", "finance", 37.6, 10.5),

  // between Finance and Marketing
  f("div-2", "planter_divider", "marketing", 42, 7.2, HALF, { size: [3.6, 0.45] }),

  // ── Open work floor · Marketing & Creative Studio ──
  ...pod("ws-mkt", "marketing", 44.8, 2.8, 1, 2),
  ...pod("ws-mkt", "marketing", 48.4, 2.8, 3, 4),
  f("mkt-board", "whiteboard", "marketing", 46.6, 0.3),
  f("mkt-books", "bookshelf", "marketing", 50.4, 0.3),
  f("mkt-set", "photo_set", "marketing", 50.9, 7.4, -HALF),
  f("mkt-ring", "ring_light", "marketing", 48.3, 7.4, HALF),
  f("mkt-camera", "camera_tripod", "marketing", 46.7, 6.6, HALF),
  f("mkt-standee", "standee", "marketing", 46.6, 10.5),
  f("mkt-plant-1", "plant", "marketing", 51.5, 10.4),
  f("mkt-plant-2", "plant", "marketing", 51.5, 0.5),
  f("mkt-art", "wall_art", "marketing", 43.2, 0.12, 0, { color: "#ec4899" }),

  // ── Main Street ──
  f("cor-plant-1", "plant", "corridor", 2, 11.45),
  f("cor-plant-2", "plant", "corridor", 9.5, 11.45),
  f("cor-plant-3", "plant", "corridor", 23.5, 11.45),
  f("cor-plant-4", "plant", "corridor", 31, 11.45),
  f("cor-plant-5", "plant", "corridor", 37, 11.45),
  f("cor-plant-6", "plant", "corridor", 49, 11.45),
  f("cor-bean-1", "bean_bag", "corridor", 8, 14.25, PI, { color: "#f59e0b" }),
  f("cor-bean-2", "bean_bag", "corridor", 31.2, 14.25, PI, { color: "#8b5cf6" }),
  f("cor-bean-3", "bean_bag", "corridor", 32.3, 14.25, PI, { color: "#f59e0b" }),
  f("cor-bean-4", "bean_bag", "corridor", 45.6, 14.25, PI, { color: "#0ea5e9" }),
  f("cor-bike-1", "bike", "corridor", 17, 14.5, HALF, { color: "#ef4444" }),
  f("cor-bike-2", "bike", "corridor", 37.6, 14.5, HALF, { color: "#facc15" }),
  f("cor-bike-3", "bike", "corridor", 50.6, 14.5, HALF, { color: "#22c55e" }),
  f("cor-cooler", "water_cooler", "corridor", 0.45, 13, HALF),

  // ── Reception & lobby ──
  f("lobby-desk", "reception_desk", "reception", 4.5, 19.5, 0),
  f("rec-sofa", "sofa", "reception", 0.6, 22.3, HALF),
  f("rec-coffee", "coffee_table", "reception", 1.85, 22.3, HALF),
  f("rec-logo", "tv_screen", "reception", 8.75, 19.5, -HALF),
  f("rec-plant-1", "plant", "reception", 0.5, 15.5),
  f("rec-plant-2", "plant", "reception", 8.5, 15.5),
  f("rec-plant-3", "plant", "reception", 0.5, 24.5),
  f("rec-plant-4", "plant", "reception", 8.5, 24.5),
  f("rec-pendant-1", "pendant_light", "reception", 3.7, 19.5),
  f("rec-pendant-2", "pendant_light", "reception", 5.3, 19.5),
  f("rec-lamp", "floor_lamp", "reception", 8.5, 22.8),

  // ── Kopitiam pantry ──
  f("kop-bar", "coffee_bar", "kopitiam", 17.35, 19.5, -HALF),
  f("kop-vending", "vending_machine", "kopitiam", 9.55, 16.4, HALF),
  f("kop-fridge", "fridge", "kopitiam", 9.5, 17.9, HALF),
  f("kop-snacks", "snack_shelf", "kopitiam", 9.3, 20.2, HALF),
  f("kop-table-1", "round_table", "kopitiam", 11.6, 21.9),
  f("kop-table-2", "round_table", "kopitiam", 14.8, 21.9),
  f("kop-table-3", "round_table", "kopitiam", 11.2, 24),
  f("kop-table-4", "round_table", "kopitiam", 16.2, 23.9),
  f("kop-pendant-1", "pendant_light", "kopitiam", 11.6, 21.9),
  f("kop-pendant-2", "pendant_light", "kopitiam", 14.8, 21.9),
  f("kop-cooler", "water_cooler", "kopitiam", 17.5, 15.9, -HALF),
  f("kop-plant", "plant", "kopitiam", 17.5, 24.5),

  // ── Game room ──
  f("game-court", "court", "game", 22.2, 20, 0, { size: [8.2, 9.6] }),
  f("game-hoop", "hoop", "game", 18.35, 20, HALF),
  f("game-pingpong", "ping_pong", "game", 26.8, 17.6, 0),
  f("game-foosball", "foosball", "game", 26.8, 21.6, 0),
  f("game-arcade-1", "arcade", "game", 29.55, 16.4, -HALF, { color: "#ec4899" }),
  f("game-arcade-2", "arcade", "game", 29.55, 17.5, -HALF, { color: "#22d3ee" }),
  f("game-sofa", "sofa", "game", 29.45, 23.4, -HALF, { color: "#4c1d95" }),
  f("game-bean-1", "bean_bag", "game", 27.6, 24.3, PI, { color: "#fdb927" }),
  f("game-plant", "plant", "game", 29.5, 20),
  f("game-pendant", "pendant_light", "game", 26.8, 17.6),

  // ── Artides Home (glass studio) ──
  ...pod("ws-art", "artides", 32.2, 18, 1, 2),
  ...pod("ws-art", "artides", 35.8, 18, 3, 4),
  f("art-display", "kitchen_counter", "artides", 34, 24.4, PI, { size: [3, 0.65], color: "#8a5a35" }),
  f("art-samples", "material_wall", "artides", 30.3, 22, HALF),
  f("art-standee", "standee", "artides", 37.5, 15.5),
  f("art-plant-1", "plant", "artides", 37.5, 24.5),
  f("art-plant-2", "plant", "artides", 30.5, 15.5),

  // ── Amare Localization (glass studio) ──
  ...pod("ws-ama", "amare", 41, 18, 1, 2),
  f("ama-map", "wall_art", "amare", 43.85, 21.6, -HALF, { color: "map", size: [2.4, 0.1] }),
  f("ama-books", "bookshelf", "amare", 38.3, 21.6, HALF),
  f("ama-table", "round_table", "amare", 41, 23),
  f("ama-standee", "standee", "amare", 43.4, 15.5),
  f("ama-plant-1", "plant", "amare", 38.5, 24.5),
  f("ama-plant-2", "plant", "amare", 43.5, 24.5),

  // ── IT Lab ──
  f("ws-it-1", "workstation", "it", 44.6, 18.2, -HALF),
  f("it-rack-1", "server_rack", "it", 51.4, 16.2, -HALF),
  f("it-rack-2", "server_rack", "it", 51.4, 17, -HALF),
  f("it-rack-3", "server_rack", "it", 51.4, 17.8, -HALF),
  f("it-rack-4", "server_rack", "it", 51.4, 18.6, -HALF),
  f("it-robot", "robot_arm", "it", 48.6, 20.2, PI),
  f("it-3d", "printer_3d", "it", 50.4, 20.4, PI),
  f("it-plant", "plant", "it", 44.5, 15.5),

  // ── Library nook ──
  f("nook-books-1", "bookshelf", "nook", 44.3, 23, HALF),
  f("nook-books-2", "bookshelf", "nook", 51.7, 22.6, -HALF),
  f("nook-rug", "rug", "nook", 48, 23, 0, { size: [3, 2] }),
  f("nook-arm-1", "armchair", "nook", 47, 23.6, PI),
  f("nook-arm-2", "armchair", "nook", 49, 23.6, PI),
  f("nook-lamp", "floor_lamp", "nook", 51.5, 24.5),

  // ── Garden ──
  f("gar-hammock-1", "hammock", "garden", 1.9, 27.6, 0),
  f("gar-hammock-2", "hammock", "garden", 7.6, 27.6, 0),
  f("gar-pod-1", "nap_pod", "garden", 17, 27.8, 0),
  f("gar-pod-2", "nap_pod", "garden", 19.2, 27.8, 0),
  f("gar-pod-3", "nap_pod", "garden", 21.4, 27.8, 0),
  f("gar-bbq", "bbq", "garden", 28, 28.6, 0),
  f("gar-bench-1", "bench", "garden", 32, 28.9, PI),
  f("gar-bench-2", "bench", "garden", 36, 28.9, PI),
  f("gar-bench-3", "bench", "garden", 40, 28.9, PI),
  f("gar-plant-1", "plant", "garden", 11.6, 29.3),
  f("gar-plant-2", "plant", "garden", 25.6, 29.3),
  f("gar-plant-3", "plant", "garden", 43.5, 27.5),
  f("gar-plant-4", "plant", "garden", 46.5, 28.6),
  f("gar-plant-5", "plant", "garden", 51.4, 27.6),
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
