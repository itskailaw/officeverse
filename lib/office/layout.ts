// Default OfficeVerse floor plan. World units are metres; x runs east, z runs south
// (towards the default camera). The building is 48 m x 23 m:
//
//   z 0-10   CEO Office | Water Guardian | Finance & Strategy | Marketing & Creative
//   z 10-13  ─────────────────────── main corridor ───────────────────────
//   z 13-23  Reception | Meeting Room | Lounge | Artides Home | Amare | IT & Server
//
// Every room opens onto the corridor through an automatic sliding door (or an archway).

import type { Door, FurnitureItem, OfficeLayout, Room, WallLine } from "../data/types.ts";

const PI = Math.PI;
const HALF = PI / 2;

export const ROOMS: Room[] = [
  { id: "ceo", name: "CEO Office", departmentId: "dept-exec", x0: 0, z0: 0, x1: 10, z1: 10, floor: "wood" },
  { id: "wgs", name: "Water Guardian Solution", departmentId: "dept-wgs", x0: 10, z0: 0, x1: 24, z1: 10, floor: "carpet" },
  { id: "finance", name: "Finance & Strategy", departmentId: "dept-finance", x0: 24, z0: 0, x1: 34, z1: 10, floor: "carpet" },
  { id: "marketing", name: "Marketing & Creative Studio", departmentId: "dept-marketing", x0: 34, z0: 0, x1: 48, z1: 10, floor: "carpet" },
  { id: "corridor", name: "Corridor", departmentId: null, x0: 0, z0: 10, x1: 48, z1: 13, floor: "tile" },
  { id: "reception", name: "Reception", departmentId: null, x0: 0, z0: 13, x1: 10, z1: 23, floor: "tile" },
  { id: "meeting", name: "Meeting Room", departmentId: null, x0: 10, z0: 13, x1: 20, z1: 23, floor: "wood" },
  { id: "lounge", name: "Staff Lounge", departmentId: null, x0: 20, z0: 13, x1: 27, z1: 23, floor: "wood" },
  { id: "artides", name: "Artides Home", departmentId: "dept-artides", x0: 27, z0: 13, x1: 36, z1: 23, floor: "carpet" },
  { id: "amare", name: "Amare Localization", departmentId: "dept-amare", x0: 36, z0: 13, x1: 42, z1: 23, floor: "carpet" },
  { id: "it", name: "IT & Server Room", departmentId: "dept-it", x0: 42, z0: 13, x1: 48, z1: 23, floor: "dark" },
];

export const WALLS: WallLine[] = [
  // exterior shell
  { a: [0, 0], b: [48, 0], kind: "exterior" },
  { a: [48, 0], b: [48, 23], kind: "exterior" },
  { a: [0, 23], b: [48, 23], kind: "exterior" },
  { a: [0, 0], b: [0, 23], kind: "exterior" },
  // corridor north wall
  { a: [0, 10], b: [10, 10], kind: "glass" },
  { a: [10, 10], b: [48, 10], kind: "interior" },
  // corridor south wall
  { a: [0, 13], b: [10, 13], kind: "interior" },
  { a: [10, 13], b: [20, 13], kind: "glass" },
  { a: [20, 13], b: [48, 13], kind: "interior" },
  // north partitions
  { a: [10, 0], b: [10, 10], kind: "interior" },
  { a: [24, 0], b: [24, 10], kind: "interior" },
  { a: [34, 0], b: [34, 10], kind: "interior" },
  // south partitions
  { a: [10, 13], b: [10, 23], kind: "interior" },
  { a: [20, 13], b: [20, 23], kind: "glass" },
  { a: [27, 13], b: [27, 23], kind: "interior" },
  { a: [36, 13], b: [36, 23], kind: "interior" },
  { a: [42, 13], b: [42, 23], kind: "interior" },
];

export const DOORS: Door[] = [
  { id: "door-ceo", x: 8, z: 10, axis: "x", width: 1.6 },
  { id: "door-wgs", x: 17, z: 10, axis: "x", width: 1.6 },
  { id: "door-finance", x: 29, z: 10, axis: "x", width: 1.6 },
  { id: "door-marketing", x: 41, z: 10, axis: "x", width: 1.6 },
  { id: "arch-reception", x: 5, z: 13, axis: "x", width: 5, open: true },
  { id: "door-meeting", x: 15, z: 13, axis: "x", width: 1.6 },
  { id: "arch-lounge", x: 23.5, z: 13, axis: "x", width: 2, open: true },
  { id: "door-artides", x: 31.5, z: 13, axis: "x", width: 1.6 },
  { id: "door-amare", x: 39, z: 13, axis: "x", width: 1.6 },
  { id: "door-it", x: 45, z: 13, axis: "x", width: 1.6 },
  { id: "door-entrance", x: 5, z: 23, axis: "x", width: 2.4 },
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
  // ── CEO office ──
  f("ceo-rug", "rug", "ceo", 5, 3.7, 0, { size: [4.2, 3.2] }),
  f("ceo-desk", "exec_desk", "ceo", 5, 3.45, 0),
  f("ceo-trophies", "trophy_cabinet", "ceo", 2.4, 0.35, 0),
  f("ceo-books", "bookshelf", "ceo", 7.6, 0.3, 0),
  f("ceo-screen", "perf_screen", "ceo", 0.35, 5.6, HALF),
  f("ceo-frames", "photo_frames", "ceo", 0.3, 2.2, HALF),
  f("ceo-visitor-1", "visitor_chair", "ceo", 4.4, 4.85, PI),
  f("ceo-visitor-2", "visitor_chair", "ceo", 5.6, 4.85, PI),
  f("ceo-sofa", "sofa", "ceo", 9.4, 6.8, -HALF),
  f("ceo-coffee", "coffee_table", "ceo", 8.25, 6.8, HALF),
  f("ceo-plant-1", "plant", "ceo", 0.5, 0.5),
  f("ceo-plant-2", "plant", "ceo", 9.5, 0.5),
  f("ceo-plant-3", "plant", "ceo", 0.5, 9.4),
  f("ceo-plant-4", "plant", "ceo", 9.5, 9.4),

  // ── Water Guardian Solution (e-commerce) ──
  ...pod("ws-wgs", "wgs", 13.2, 2.9, 1, 2),
  ...pod("ws-wgs", "wgs", 17, 2.9, 3, 4),
  ...pod("ws-wgs", "wgs", 20.8, 2.9, 5, 6),
  f("wgs-cab-1", "filing_cabinet", "wgs", 11, 0.3),
  f("wgs-cab-2", "filing_cabinet", "wgs", 23, 0.3),
  f("wgs-packing", "packing_table", "wgs", 21, 7.8),
  f("wgs-shelf", "product_shelf", "wgs", 13.5, 9.6, PI),
  f("wgs-board", "whiteboard", "wgs", 10.35, 6.5, HALF),
  f("wgs-plant-1", "plant", "wgs", 10.5, 9.5),
  f("wgs-plant-2", "plant", "wgs", 23.5, 9.5),

  // ── Finance & Strategy ──
  ...pod("ws-fin", "finance", 27, 2.9, 1, 2),
  ...pod("ws-fin", "finance", 31, 2.9, 3, 4),
  f("fin-books", "bookshelf", "finance", 29, 0.3),
  f("fin-board", "whiteboard", "finance", 33.65, 6.5, -HALF),
  f("fin-table", "round_table", "finance", 27.5, 7.4),
  f("fin-plant-1", "plant", "finance", 24.5, 9.5),
  f("fin-plant-2", "plant", "finance", 33.5, 9.5),

  // ── Marketing & Creative Studio ──
  ...pod("ws-mkt", "marketing", 37.5, 2.9, 1, 2),
  ...pod("ws-mkt", "marketing", 41.5, 2.9, 3, 4),
  f("mkt-board", "whiteboard", "marketing", 36, 0.3),
  f("mkt-books", "bookshelf", "marketing", 45, 0.3),
  f("mkt-set", "photo_set", "marketing", 45.9, 6.2, -HALF),
  f("mkt-plant-1", "plant", "marketing", 34.5, 9.5),
  f("mkt-plant-2", "plant", "marketing", 47.5, 9.5),
  f("mkt-plant-3", "plant", "marketing", 47.5, 0.5),

  // ── Corridor ──
  f("cor-plant-1", "plant", "corridor", 12.2, 10.45),
  f("cor-plant-2", "plant", "corridor", 21.5, 10.45),
  f("cor-plant-3", "plant", "corridor", 26.2, 10.45),
  f("cor-plant-4", "plant", "corridor", 36.5, 10.45),
  f("cor-plant-5", "plant", "corridor", 46.5, 10.45),
  f("cor-plant-6", "plant", "corridor", 9.5, 12.55),
  f("cor-plant-7", "plant", "corridor", 35.5, 12.55),
  f("cor-cooler", "water_cooler", "corridor", 0.45, 11.5, HALF),

  // ── Reception ──
  f("reception-desk", "reception_desk", "reception", 5, 17.6, 0),
  f("rec-sofa", "sofa", "reception", 0.6, 20, HALF),
  f("rec-coffee", "coffee_table", "reception", 1.85, 20, HALF),
  f("rec-logo", "tv_screen", "reception", 9.75, 18, -HALF),
  f("rec-plant-1", "plant", "reception", 0.5, 13.5),
  f("rec-plant-2", "plant", "reception", 9.5, 13.5),
  f("rec-plant-3", "plant", "reception", 3.2, 22.5),
  f("rec-plant-4", "plant", "reception", 6.8, 22.5),

  // ── Meeting room ──
  f("meeting-table", "meeting_table", "meeting", 15, 18, 0),
  f("meet-screen", "tv_screen", "meeting", 15, 22.75, PI),
  f("meet-plant-1", "plant", "meeting", 10.5, 22.5),
  f("meet-plant-2", "plant", "meeting", 19.5, 22.5),
  f("meet-plant-3", "plant", "meeting", 19.5, 13.5),

  // ── Staff lounge ──
  f("lounge-counter", "kitchen_counter", "lounge", 26.6, 17, -HALF),
  f("lounge-cooler", "water_cooler", "lounge", 20.45, 13.6, HALF),
  f("lounge-sofa", "sofa", "lounge", 23.5, 22.45, PI),
  f("lounge-coffee", "coffee_table", "lounge", 23.5, 20.8, 0),
  f("lounge-arm-1", "armchair", "lounge", 21.2, 20.9, HALF),
  f("lounge-arm-2", "armchair", "lounge", 25.6, 20.9, -HALF),
  f("lounge-table", "round_table", "lounge", 22.3, 16.6),
  f("lounge-plant-1", "plant", "lounge", 20.5, 22.5),
  f("lounge-plant-2", "plant", "lounge", 26.5, 22.5),

  // ── Artides Home ──
  ...pod("ws-art", "artides", 29.5, 16.9, 1, 2),
  ...pod("ws-art", "artides", 33.5, 16.9, 3, 4),
  f("art-display", "kitchen_counter", "artides", 31.5, 22.6, PI, { size: [3, 0.65], color: "#8a5a35" }),
  f("art-samples", "bookshelf", "artides", 27.3, 20, HALF),
  f("art-plant-1", "plant", "artides", 35.5, 22.5),
  f("art-plant-2", "plant", "artides", 27.5, 13.5),

  // ── Amare Localization ──
  ...pod("ws-ama", "amare", 39, 16.9, 1, 2),
  f("ama-books-1", "bookshelf", "amare", 41.7, 19.5, -HALF),
  f("ama-books-2", "bookshelf", "amare", 36.3, 19.5, HALF),
  f("ama-table", "round_table", "amare", 39, 21.2),
  f("ama-plant-1", "plant", "amare", 36.5, 22.5),
  f("ama-plant-2", "plant", "amare", 41.5, 22.5),

  // ── IT & Server room ──
  f("ws-it-1", "workstation", "it", 42.6, 19.5, -HALF),
  f("it-rack-1", "server_rack", "it", 47.4, 15.5, -HALF),
  f("it-rack-2", "server_rack", "it", 47.4, 16.3, -HALF),
  f("it-rack-3", "server_rack", "it", 47.4, 17.1, -HALF),
  f("it-rack-4", "server_rack", "it", 47.4, 17.9, -HALF),
  f("it-rack-5", "server_rack", "it", 47.4, 18.7, -HALF),
  f("it-cabinet", "filing_cabinet", "it", 44.5, 22.6, PI, { color: "#334155" }),
  f("it-plant", "plant", "it", 42.5, 13.5),

  // ── lighting & branding details ──
  f("ceo-lamp", "floor_lamp", "ceo", 0.45, 8.1),
  f("rec-lamp", "floor_lamp", "reception", 0.5, 21.7),
  f("lounge-lamp", "floor_lamp", "lounge", 26.55, 19.5),
  f("meet-pendant-1", "pendant_light", "meeting", 13.6, 18),
  f("meet-pendant-2", "pendant_light", "meeting", 15, 18),
  f("meet-pendant-3", "pendant_light", "meeting", 16.4, 18),
  f("lounge-pendant", "pendant_light", "lounge", 22.3, 16.6),
  f("rec-pendant-1", "pendant_light", "reception", 4.2, 17.6),
  f("rec-pendant-2", "pendant_light", "reception", 5.8, 17.6),
  f("lounge-fridge", "fridge", "lounge", 26.55, 14.6, -HALF),
  f("lounge-vending", "vending_machine", "lounge", 20.5, 18.5, HALF),
  f("wgs-standee", "standee", "wgs", 18.9, 9.5),
  f("fin-standee", "standee", "finance", 31.4, 9.5),
  f("mkt-standee", "standee", "marketing", 43.4, 9.5),
  f("art-standee", "standee", "artides", 33.4, 13.5),
  f("ama-standee", "standee", "amare", 41.3, 13.5),
];

export const DEFAULT_LAYOUT: OfficeLayout = {
  width: 48,
  depth: 23,
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
