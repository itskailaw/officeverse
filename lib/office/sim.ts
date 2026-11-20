// Agent simulation: movement along nav-grid paths, seat occupancy, automatic
// doors, breaks, meetings, pick-up/drop and stuck recovery. Runs outside React;
// the 3D layer reads agent transforms each frame.

import type { Door, OfficeLayout, Seat } from "../data/types.ts";
import { BREAK_ROOMS, CEO_DESK_ID, CEO_MEETING_SEAT_INDEX, MEETING_TABLE_ID } from "./layout.ts";
import { seatsFor } from "./catalog.ts";
import { buildNavGrid, findPath, isWalkablePoint, nearestWalkable, type NavGrid, type Vec2 } from "./navgrid.ts";

export type Pose = "stand" | "walk" | "sit" | "held";
export type Intent = "desk" | "meeting" | "break" | "free" | "held" | "visit" | "summoned";
export type Gesture = "idle" | "type" | "talk";

export interface Agent {
  id: string;
  isCEO: boolean;
  x: number;
  z: number;
  y: number;
  heading: number;
  pose: Pose;
  gesture: Gesture;
  intent: Intent;
  /** assigned home seat (workstation) */
  homeSeatId: string | null;
  /** seat currently occupied or reserved */
  seatId: string | null;
  path: Vec2[];
  pathIdx: number;
  /** what to do once the path ends */
  arrival: { kind: "seat"; seatId: string } | { kind: "point"; facing?: number } | null;
  glide: { fx: number; fz: number; tx: number; tz: number; t: number; dur: number; then: "sit" | "stand" | "walk" } | null;
  timer: number;
  breakIn: number;
  stuckClock: number;
  lastX: number;
  lastZ: number;
  walkPhase: number;
  lookAt: Vec2 | null;
  working: boolean;
  visitTarget: string | null;
  /** seconds of waving left */
  waveT: number;
}

export interface SimEvent {
  agentId: string;
  type: "arrived_desk" | "arrived_meeting" | "break_start" | "break_end" | "dropped" | "reassigned" | "arrived_visit" | "stuck_recovered";
  seatId?: string;
}

const WALK_SPEED = 1.45;
const CEO_SPEED = 1.7;
const DOOR_TRIGGER = 2.3;
const DOOR_WAIT_DIST = 1.0;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function angleLerp(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class OfficeSim {
  grid!: NavGrid;
  layout!: OfficeLayout;
  seats = new Map<string, Seat>();
  occupancy = new Map<string, string>(); // seatId -> agentId
  agents = new Map<string, Agent>();
  doors: (Door & { openness: number })[] = [];
  ambientLife = true;
  private listeners = new Set<(e: SimEvent) => void>();

  constructor(layout: OfficeLayout) {
    this.rebuild(layout);
  }

  on(fn: (e: SimEvent) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit(e: SimEvent) {
    this.listeners.forEach((l) => l(e));
  }

  /** Rebuild nav grid + seats after a layout edit, keeping agents valid. */
  rebuild(layout: OfficeLayout) {
    this.layout = layout;
    this.grid = buildNavGrid(layout);
    const prevDoors = new Map(this.doors.map((d) => [d.id, d.openness]));
    this.doors = layout.doors.map((d) => ({ ...d, openness: prevDoors.get(d.id) ?? 0 }));
    this.seats = new Map(layout.furniture.flatMap(seatsFor).map((s) => [s.id, s]));
    for (const [seatId, agentId] of [...this.occupancy]) {
      if (!this.seats.has(seatId)) this.occupancy.delete(seatId);
      const a = this.agents.get(agentId);
      if (a && a.seatId === seatId && !this.seats.has(seatId)) a.seatId = null;
    }
    for (const a of this.agents.values()) {
      if (a.pose === "sit" && a.seatId) {
        const s = this.seats.get(a.seatId)!;
        a.x = s.x;
        a.z = s.z;
        a.heading = s.facing;
      } else if (a.pose === "sit") {
        this.standUpInPlace(a);
      }
      if (a.pose === "walk" && a.arrival) this.repath(a);
      if (a.pose === "stand" && !isWalkablePoint(this.grid, a.x, a.z)) {
        const p = nearestWalkable(this.grid, a.x, a.z);
        if (p) {
          a.x = p.x;
          a.z = p.z;
        }
      }
    }
  }

  seat(id: string | null | undefined) {
    return id ? this.seats.get(id) : undefined;
  }

  meetingSeats(): Seat[] {
    return [...this.seats.values()].filter((s) => s.furnitureId === MEETING_TABLE_ID);
  }
  ceoMeetingSeatId() {
    return `${MEETING_TABLE_ID}:${CEO_MEETING_SEAT_INDEX}`;
  }

  /** Add an agent, seated at its home seat when free. */
  addAgent(id: string, homeSeatId: string | null, isCEO = false) {
    if (this.agents.has(id)) return this.agents.get(id)!;
    const home = homeSeatId ? this.seats.get(homeSeatId) : undefined;
    const spawn = home ?? { x: 5, z: 25, facing: Math.PI };
    const a: Agent = {
      id,
      isCEO,
      x: spawn.x,
      z: spawn.z,
      y: 0,
      heading: home?.facing ?? Math.PI,
      pose: "stand",
      gesture: "idle",
      intent: "desk",
      homeSeatId,
      seatId: null,
      path: [],
      pathIdx: 0,
      arrival: null,
      glide: null,
      timer: 0,
      breakIn: rand(40, 200),
      stuckClock: 0,
      lastX: spawn.x,
      lastZ: spawn.z,
      walkPhase: Math.random() * 10,
      lookAt: null,
      working: false,
      visitTarget: null,
      waveT: 0,
    };
    this.agents.set(id, a);
    if (home && !this.occupancy.has(home.id)) {
      this.occupancy.set(home.id, id);
      a.seatId = home.id;
      a.pose = "sit";
    } else if (home) {
      this.goToSeat(id, home.id, "desk");
    }
    return a;
  }

  removeAgent(id: string) {
    const a = this.agents.get(id);
    if (!a) return;
    this.releaseSeat(a);
    this.agents.delete(id);
  }

  setHomeSeat(id: string, seatId: string | null) {
    const a = this.agents.get(id);
    if (!a) return;
    a.homeSeatId = seatId;
    if (a.intent === "desk") this.returnToDesk(id);
  }

  isSeatFree(seatId: string, forAgent?: string) {
    const o = this.occupancy.get(seatId);
    return !o || o === forAgent;
  }

  private releaseSeat(a: Agent) {
    if (a.seatId && this.occupancy.get(a.seatId) === a.id) this.occupancy.delete(a.seatId);
    a.seatId = null;
  }

  private standUpInPlace(a: Agent) {
    a.pose = "stand";
    a.gesture = "idle";
    const p = nearestWalkable(this.grid, a.x, a.z);
    if (p) {
      a.x = p.x;
      a.z = p.z;
    }
  }

  /** Start moving: stand up (gliding out of the seat first) then follow a path. */
  private departTo(a: Agent, target: Vec2, arrival: Agent["arrival"]) {
    this.endConversation(a);
    const current = this.seat(a.seatId);
    if (a.pose === "sit" && current) {
      if (a.seatId && this.occupancy.get(a.seatId) === a.id && arrival?.kind === "seat" && arrival.seatId === a.seatId) {
        return; // already there
      }
      this.releaseSeat(a);
      a.glide = { fx: a.x, fz: a.z, tx: current.ax, tz: current.az, t: 0, dur: 0.45, then: "walk" };
      a.pose = "stand";
      a.gesture = "idle";
      a.arrival = arrival;
      a.path = findPath(this.grid, { x: current.ax, z: current.az }, target) ?? [];
      a.pathIdx = 0;
      return;
    }
    if (a.pose !== "held") this.releaseSeat(a);
    a.glide = null;
    a.arrival = arrival;
    a.path = findPath(this.grid, { x: a.x, z: a.z }, target) ?? [];
    a.pathIdx = 0;
    a.pose = "walk";
    a.gesture = "idle";
    a.stuckClock = 0;
  }

  private repath(a: Agent) {
    if (!a.arrival) return;
    let target: Vec2 | null = null;
    if (a.arrival.kind === "seat") {
      const s = this.seats.get(a.arrival.seatId);
      if (s) target = { x: s.ax, z: s.az };
    } else if (a.path.length) {
      target = a.path[a.path.length - 1];
    }
    if (!target) {
      a.arrival = null;
      a.pose = "stand";
      return;
    }
    a.path = findPath(this.grid, { x: a.x, z: a.z }, target) ?? [];
    a.pathIdx = 0;
  }

  goToSeat(id: string, seatId: string, intent: Intent) {
    const a = this.agents.get(id);
    const s = this.seats.get(seatId);
    if (!a || !s) return false;
    if (!this.isSeatFree(seatId, id)) return false;
    a.intent = intent;
    if (a.pose === "sit" && a.seatId === seatId) return true;
    this.departTo(a, { x: s.ax, z: s.az }, { kind: "seat", seatId });
    this.occupancy.set(seatId, id); // reserve
    a.seatId = seatId;
    return true;
  }

  goToPoint(id: string, x: number, z: number, intent: Intent = "free", facing?: number) {
    const a = this.agents.get(id);
    if (!a) return false;
    const p = nearestWalkable(this.grid, x, z);
    if (!p) return false;
    a.intent = intent;
    this.departTo(a, p, { kind: "point", facing });
    a.timer = intent === "free" ? rand(25, 40) : 0;
    return true;
  }

  returnToDesk(id: string) {
    const a = this.agents.get(id);
    if (!a) return;
    a.lookAt = null;
    if (a.homeSeatId && this.isSeatFree(a.homeSeatId, id)) {
      this.goToSeat(id, a.homeSeatId, "desk");
    } else {
      // no desk (or desk taken): wander to the lounge
      a.intent = "desk";
      const spot = this.freeSeats("lounge")[0];
      if (spot) this.goToSeat(id, spot.id, "desk");
    }
  }

  freeSeats(kind: Seat["kind"], roomId?: string) {
    return [...this.seats.values()].filter(
      (s) => s.kind === kind && (!roomId || s.roomId === roomId) && !this.occupancy.has(s.id),
    );
  }

  startBreak(id: string) {
    const a = this.agents.get(id);
    if (!a || a.isCEO) return false;
    // any free lounge or play spot in a break room; games are popular, so weight them up
    const lounge = [...this.seats.values()].filter((s) => s.kind === "lounge" && BREAK_ROOMS.includes(s.roomId) && !this.occupancy.has(s.id));
    const play = this.freeSeats("play");
    const spots = Math.random() < 0.45 && play.length ? play : lounge.length ? lounge : play;
    if (!spots.length) return false;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    if (this.goToSeat(id, spot.id, "break")) {
      a.timer = rand(25, 50);
      this.emit({ agentId: id, type: "break_start" });
      return true;
    }
    return false;
  }

  /** Send attendees (and the CEO) to the meeting table. Returns seat assignment. */
  callMeeting(ids: string[], ceoId?: string) {
    const assigned: Record<string, string> = {};
    const ceoSeat = this.ceoMeetingSeatId();
    const free = this.meetingSeats().filter((s) => s.id !== ceoSeat && this.isSeatFree(s.id));
    for (const id of ids) {
      const a = this.agents.get(id);
      if (!a) continue;
      const seat = free.shift();
      if (!seat) break;
      this.goToSeat(id, seat.id, "meeting");
      assigned[id] = seat.id;
    }
    if (ceoId && this.isSeatFree(ceoSeat, ceoId)) this.goToSeat(ceoId, ceoSeat, "meeting");
    return assigned;
  }

  endMeeting(ids: string[], ceoId?: string) {
    ids.forEach((id) => this.returnToDesk(id));
    if (ceoId) {
      const a = this.agents.get(ceoId);
      if (a && a.intent === "meeting") this.goToSeat(ceoId, CEO_DESK_ID, "desk");
    }
  }

  private endConversation(a: Agent) {
    if (!a.visitTarget) return;
    const t = this.agents.get(a.visitTarget);
    if (t) {
      t.gesture = "idle";
      t.lookAt = null;
    }
    a.visitTarget = null;
    a.gesture = "idle";
  }

  /** CEO walks over to an employee to talk. */
  visit(ceoId: string, targetId: string) {
    const ceo = this.agents.get(ceoId);
    const t = this.agents.get(targetId);
    if (!ceo || !t) return;
    const seat = this.seat(t.seatId);
    const anchor = t.pose === "sit" && seat ? { x: seat.ax, z: seat.az } : { x: t.x, z: t.z };
    // pick a walkable spot ~1m from the employee, nearest to the CEO
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      const px = anchor.x + Math.sin(ang) * 1.0;
      const pz = anchor.z + Math.cos(ang) * 1.0;
      if (!isWalkablePoint(this.grid, px, pz)) continue;
      const d = Math.hypot(px - ceo.x, pz - ceo.z);
      if (d < bestD) {
        bestD = d;
        best = { x: px, z: pz };
      }
    }
    const goal = best ?? nearestWalkable(this.grid, anchor.x, anchor.z);
    if (!goal) return;
    this.departTo(ceo, goal, { kind: "point" });
    ceo.intent = "visit";
    ceo.lookAt = { x: t.x, z: t.z };
    ceo.visitTarget = targetId;
  }

  /** An employee walks to the CEO office to report (proactive notifications). */
  summonToCEO(id: string) {
    const a = this.agents.get(id);
    if (!a) return false;
    const visitor = this.freeSeats("visitor", "ceo")[0];
    if (visitor) return this.goToSeat(id, visitor.id, "summoned");
    return this.goToPoint(id, 45, 6.6, "summoned", Math.PI);
  }

  pickUp(id: string) {
    const a = this.agents.get(id);
    if (!a) return;
    this.releaseSeat(a);
    a.pose = "held";
    a.intent = "held";
    a.path = [];
    a.arrival = null;
    a.glide = null;
    a.gesture = "idle";
  }

  moveHeld(id: string, x: number, z: number) {
    const a = this.agents.get(id);
    if (!a || a.pose !== "held") return;
    a.x = Math.min(this.layout.width - 0.3, Math.max(0.3, x));
    a.z = Math.min(this.layout.depth - 0.3, Math.max(0.3, z));
  }

  /**
   * Drop a held agent. If released on top of a free seat it sits there; a free
   * workstation becomes its new home (returned so the store can persist it).
   */
  drop(id: string, x: number, z: number): { reassignedTo?: string } {
    const a = this.agents.get(id);
    if (!a) return {};
    let nearestSeat: Seat | null = null;
    let nd = 0.9;
    for (const s of this.seats.values()) {
      if (!this.isSeatFree(s.id, id) || s.kind === "ceo") continue;
      if ([...this.agents.values()].some((o) => o.id !== id && o.homeSeatId === s.id)) continue;
      if (s.furnitureId === MEETING_TABLE_ID && s.id === this.ceoMeetingSeatId()) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < nd) {
        nd = d;
        nearestSeat = s;
      }
    }
    if (nearestSeat) {
      a.x = nearestSeat.x;
      a.z = nearestSeat.z;
      a.heading = nearestSeat.facing;
      a.pose = nearestSeat.sit ? "sit" : "stand";
      a.seatId = nearestSeat.id;
      this.occupancy.set(nearestSeat.id, id);
      if (nearestSeat.kind === "workstation") {
        a.homeSeatId = nearestSeat.id;
        a.intent = "desk";
        this.emit({ agentId: id, type: "reassigned", seatId: nearestSeat.id });
        return { reassignedTo: nearestSeat.id };
      }
      a.intent = "free";
      a.timer = rand(25, 40);
      this.emit({ agentId: id, type: "dropped" });
      return {};
    }
    const p = nearestWalkable(this.grid, x, z) ?? { x: a.x, z: a.z };
    a.x = p.x;
    a.z = p.z;
    a.pose = "stand";
    a.intent = "free";
    a.timer = rand(20, 35);
    this.emit({ agentId: id, type: "dropped" });
    return {};
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    // fixed-size substeps keep movement speed independent of frame rate
    let remaining = Math.min(dt, 0.5);
    while (remaining > 1e-4) {
      const step = Math.min(remaining, 1 / 20);
      remaining -= step;
      this.updateDoors(step);
      for (const a of this.agents.values()) this.updateAgent(a, step);
    }
  }

  private updateDoors(dt: number) {
    for (const d of this.doors) {
      if (d.open) continue;
      let want = 0;
      for (const a of this.agents.values()) {
        if (a.pose !== "walk" && !(a.glide && a.glide.then === "walk")) continue;
        if (Math.hypot(a.x - d.x, a.z - d.z) < DOOR_TRIGGER) {
          want = 1;
          break;
        }
      }
      const speed = want ? 2.6 : 1.2;
      d.openness += Math.sign(want - d.openness) * Math.min(Math.abs(want - d.openness), speed * dt);
    }
  }

  private blockedByDoor(x: number, z: number) {
    for (const d of this.doors) {
      if (d.open) continue; // archway
      if (Math.hypot(x - d.x, z - d.z) < DOOR_WAIT_DIST && d.openness < 0.75) return true;
    }
    return false;
  }

  /** Friendly wave (e.g. when the CEO clicks an employee). */
  wave(id: string) {
    const a = this.agents.get(id);
    if (a && a.pose !== "held") a.waveT = 1.8;
  }

  private updateAgent(a: Agent, dt: number) {
    a.walkPhase += dt;
    if (a.waveT > 0) a.waveT = Math.max(0, a.waveT - dt);
    a.y += ((a.pose === "held" ? 1.1 : 0) - a.y) * Math.min(1, dt * 10);

    if (a.glide) {
      const g = a.glide;
      g.t += dt / g.dur;
      const t = Math.min(1, g.t);
      a.x = g.fx + (g.tx - g.fx) * t;
      a.z = g.fz + (g.tz - g.fz) * t;
      if (g.then === "sit" && a.seatId) {
        const s = this.seats.get(a.seatId);
        if (s) a.heading = angleLerp(a.heading, s.facing, Math.min(1, dt * 10));
      }
      if (t >= 1) {
        a.glide = null;
        if (g.then === "sit") a.pose = "sit";
        else if (g.then === "stand") a.pose = "stand";
        else {
          a.pose = "walk";
          a.stuckClock = 0;
        }
        if (g.then !== "walk") this.onArrived(a);
      }
      return;
    }

    if (a.pose === "walk") {
      this.stepWalk(a, dt);
      return;
    }

    if (a.pose === "held") return;

    // idle behaviours
    if (a.lookAt && a.pose !== "sit") {
      const want = Math.atan2(a.lookAt.x - a.x, a.lookAt.z - a.z);
      a.heading = angleLerp(a.heading, want, Math.min(1, dt * 6));
    }
    if (a.isCEO) return;

    if (a.intent === "break" || a.intent === "free") {
      a.timer -= dt;
      if (a.timer <= 0) {
        if (a.intent === "break") this.emit({ agentId: a.id, type: "break_end" });
        this.returnToDesk(a.id);
      }
    } else if (a.intent === "desk" && a.pose === "sit" && this.ambientLife && !a.working) {
      a.breakIn -= dt;
      if (a.breakIn <= 0) {
        a.breakIn = rand(120, 300);
        if (Math.random() < 0.7) this.startBreak(a.id);
      }
    } else if (a.intent === "desk" && a.pose === "stand" && !a.path.length) {
      // standing idle without a destination — head home
      this.returnToDesk(a.id);
    }
  }

  private stepWalk(a: Agent, dt: number) {
    const target = a.path[a.pathIdx];
    if (!target) {
      this.finishPath(a);
      return;
    }
    const dx = target.x - a.x;
    const dz = target.z - a.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    a.heading = angleLerp(a.heading, want, Math.min(1, dt * 9));

    if (this.blockedByDoor(a.x + (dx / (dist || 1)) * 0.4, a.z + (dz / (dist || 1)) * 0.4)) {
      a.stuckClock = 0; // waiting for door is not being stuck
      return;
    }
    const speed = a.isCEO ? CEO_SPEED : WALK_SPEED;
    const step = speed * dt;
    if (dist <= step) {
      a.x = target.x;
      a.z = target.z;
      a.pathIdx++;
    } else {
      a.x += (dx / dist) * step;
      a.z += (dz / dist) * step;
    }

    // stuck detection
    a.stuckClock += dt;
    if (a.stuckClock > 2.5) {
      const moved = Math.hypot(a.x - a.lastX, a.z - a.lastZ);
      a.stuckClock = 0;
      a.lastX = a.x;
      a.lastZ = a.z;
      if (moved < 0.2) {
        const p = nearestWalkable(this.grid, a.x, a.z);
        if (p) {
          a.x = p.x;
          a.z = p.z;
        }
        this.repath(a);
        this.emit({ agentId: a.id, type: "stuck_recovered" });
      }
    }
  }

  private finishPath(a: Agent) {
    a.path = [];
    a.pathIdx = 0;
    const arr = a.arrival;
    if (arr?.kind === "seat") {
      const s = this.seats.get(arr.seatId);
      if (!s) {
        a.pose = "stand";
        a.arrival = null;
        return;
      }
      // glide from approach into the seat
      a.glide = { fx: a.x, fz: a.z, tx: s.x, tz: s.z, t: 0, dur: 0.45, then: s.sit ? "sit" : "stand" };
      a.heading = s.facing;
      return;
    }
    a.pose = "stand";
    if (arr?.kind === "point" && arr.facing !== undefined) a.heading = arr.facing;
    this.onArrived(a);
  }

  private onArrived(a: Agent) {
    const arr = a.arrival;
    a.arrival = null;
    if (arr?.kind === "seat") {
      const s = this.seats.get(arr.seatId);
      if (s) a.heading = s.facing;
    }
    if (a.intent === "desk") this.emit({ agentId: a.id, type: "arrived_desk" });
    else if (a.intent === "meeting") this.emit({ agentId: a.id, type: "arrived_meeting", seatId: a.seatId ?? undefined });
    else if (a.intent === "visit") {
      const t = a.visitTarget ? this.agents.get(a.visitTarget) : undefined;
      a.gesture = "talk";
      if (t) {
        t.gesture = "talk";
        if (t.pose !== "sit") t.lookAt = { x: a.x, z: a.z };
      }
      this.emit({ agentId: a.id, type: "arrived_visit" });
    }
  }
}
