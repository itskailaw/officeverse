// Furniture catalog: footprint, whether it blocks navigation, and the seats /
// standing spots it provides. Local frame: the item's "front" faces local +Z.
// Rotating by `rot` maps local (lx, lz) to world (lx cos r + lz sin r, -lx sin r + lz cos r).

import type { FurnitureItem, FurnitureType, Seat } from "../data/types.ts";

interface LocalSeat {
  lx: number;
  lz: number;
  /** facing in local frame (0 = local +Z) */
  f: number;
  /** approach point in local frame */
  alx: number;
  alz: number;
  kind: Seat["kind"];
  sit: boolean;
}

export interface CatalogEntry {
  label: string;
  size: [number, number]; // [width (local x), depth (local z)]
  blocks: boolean;
  seats: LocalSeat[];
  movable: boolean;
}

const deskSeat = (kind: Seat["kind"], back = 0.62): LocalSeat => ({
  lx: 0,
  lz: -back,
  f: 0,
  alx: 0,
  alz: -back - 0.45,
  kind,
  sit: true,
});

const meetingSeats = (): LocalSeat[] => {
  const seats: LocalSeat[] = [];
  for (const lx of [-1.8, -0.6, 0.6, 1.8]) {
    seats.push({ lx, lz: -1.25, f: 0, alx: lx, alz: -1.75, kind: "meeting", sit: true });
  }
  for (const lx of [-1.8, -0.6, 0.6, 1.8]) {
    seats.push({ lx, lz: 1.25, f: Math.PI, alx: lx, alz: 1.75, kind: "meeting", sit: true });
  }
  seats.push({ lx: -3.2, lz: 0, f: Math.PI / 2, alx: -3.65, alz: 0, kind: "meeting", sit: true });
  // index 9: head of table, reserved for the CEO
  seats.push({ lx: 3.2, lz: 0, f: -Math.PI / 2, alx: 3.65, alz: 0, kind: "meeting", sit: true });
  return seats;
};

export const CATALOG: Record<FurnitureType, CatalogEntry> = {
  workstation: { label: "Workstation", size: [1.4, 0.7], blocks: true, seats: [deskSeat("workstation")], movable: true },
  exec_desk: { label: "Executive desk", size: [2.2, 1.0], blocks: true, seats: [deskSeat("ceo", 0.85)], movable: true },
  reception_desk: { label: "Reception desk", size: [3.2, 0.7], blocks: true, seats: [deskSeat("workstation")], movable: true },
  meeting_table: { label: "Meeting table", size: [5.2, 1.6], blocks: true, seats: meetingSeats(), movable: true },
  sofa: {
    label: "Sofa",
    size: [2.0, 0.9],
    blocks: true,
    seats: [
      { lx: -0.5, lz: 0.1, f: 0, alx: -0.5, alz: 0.85, kind: "lounge", sit: true },
      { lx: 0.5, lz: 0.1, f: 0, alx: 0.5, alz: 0.85, kind: "lounge", sit: true },
    ],
    movable: true,
  },
  armchair: {
    label: "Armchair",
    size: [0.9, 0.9],
    blocks: true,
    seats: [{ lx: 0, lz: 0.05, f: 0, alx: 0, alz: 0.85, kind: "lounge", sit: true }],
    movable: true,
  },
  visitor_chair: {
    label: "Visitor chair",
    size: [0.55, 0.55],
    blocks: false,
    seats: [{ lx: 0, lz: 0, f: 0, alx: 0, alz: 0.5, kind: "visitor", sit: true }],
    movable: true,
  },
  round_table: {
    label: "Round table",
    size: [1.0, 1.0],
    blocks: true,
    seats: [
      { lx: -0.85, lz: 0, f: Math.PI / 2, alx: -1.3, alz: 0, kind: "lounge", sit: true },
      { lx: 0.85, lz: 0, f: -Math.PI / 2, alx: 1.3, alz: 0, kind: "lounge", sit: true },
    ],
    movable: true,
  },
  kitchen_counter: {
    label: "Pantry counter",
    size: [2.6, 0.65],
    blocks: true,
    seats: [{ lx: -0.5, lz: 0.75, f: Math.PI, alx: -0.5, alz: 0.75, kind: "lounge", sit: false }],
    movable: true,
  },
  water_cooler: {
    label: "Water cooler",
    size: [0.4, 0.4],
    blocks: true,
    seats: [{ lx: 0, lz: 0.65, f: Math.PI, alx: 0, alz: 0.65, kind: "lounge", sit: false }],
    movable: true,
  },
  coffee_table: { label: "Coffee table", size: [1.0, 0.6], blocks: true, seats: [], movable: true },
  plant: { label: "Plant", size: [0.5, 0.5], blocks: true, seats: [], movable: true },
  bookshelf: { label: "Bookshelf", size: [1.6, 0.4], blocks: true, seats: [], movable: true },
  trophy_cabinet: { label: "Trophy cabinet", size: [2.4, 0.5], blocks: true, seats: [], movable: true },
  perf_screen: { label: "Performance screen", size: [3.0, 0.5], blocks: true, seats: [], movable: true },
  server_rack: { label: "Server rack", size: [0.7, 1.0], blocks: true, seats: [], movable: true },
  filing_cabinet: { label: "Filing cabinet", size: [0.6, 0.5], blocks: true, seats: [], movable: true },
  whiteboard: { label: "Whiteboard", size: [1.8, 0.35], blocks: true, seats: [], movable: true },
  packing_table: { label: "Packing station", size: [1.8, 0.9], blocks: true, seats: [], movable: true },
  product_shelf: { label: "Product shelf", size: [1.8, 0.45], blocks: true, seats: [], movable: true },
  photo_set: { label: "Photo/video set", size: [2.6, 1.6], blocks: true, seats: [], movable: true },
  rug: { label: "Rug", size: [3.0, 2.0], blocks: false, seats: [], movable: true },
  tv_screen: { label: "Display screen", size: [2.0, 0.3], blocks: true, seats: [], movable: true },
  photo_frames: { label: "Photo frames", size: [1.2, 0.35], blocks: true, seats: [], movable: true },
  floor_lamp: { label: "Floor lamp", size: [0.4, 0.4], blocks: true, seats: [], movable: true },
  pendant_light: { label: "Pendant light", size: [0.5, 0.5], blocks: false, seats: [], movable: true },
  fridge: { label: "Fridge", size: [0.7, 0.7], blocks: true, seats: [], movable: true },
  vending_machine: {
    label: "Vending machine",
    size: [1.0, 0.8],
    blocks: true,
    seats: [{ lx: 0, lz: 0.85, f: Math.PI, alx: 0, alz: 0.85, kind: "lounge", sit: false }],
    movable: true,
  },
  standee: { label: "Company standee", size: [0.7, 0.3], blocks: true, seats: [], movable: true },
};

export function sizeOf(item: FurnitureItem): [number, number] {
  return item.size ?? CATALOG[item.type].size;
}

export function localToWorld(item: { x: number; z: number; rot: number }, lx: number, lz: number) {
  const c = Math.cos(item.rot);
  const s = Math.sin(item.rot);
  return { x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c };
}

export function seatsFor(item: FurnitureItem): Seat[] {
  const entry = CATALOG[item.type];
  return entry.seats.map((s, i) => {
    const p = localToWorld(item, s.lx, s.lz);
    const a = localToWorld(item, s.alx, s.alz);
    return {
      id: entry.seats.length === 1 ? item.id : `${item.id}:${i}`,
      kind: s.kind,
      roomId: item.roomId,
      x: p.x,
      z: p.z,
      facing: s.f + item.rot,
      ax: a.x,
      az: a.z,
      furnitureId: item.id,
      sit: s.sit,
    };
  });
}

/** True when world point (px, pz) lies inside the item's footprint grown by `pad`. */
export function insideFootprint(item: FurnitureItem, px: number, pz: number, pad = 0) {
  const [w, d] = sizeOf(item);
  const dx = px - item.x;
  const dz = pz - item.z;
  const c = Math.cos(item.rot);
  const s = Math.sin(item.rot);
  // inverse rotation
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= w / 2 + pad && Math.abs(lz) <= d / 2 + pad;
}
