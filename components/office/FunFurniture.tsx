"use client";

// Models for the fun spaces: game room, kopitiam pantry, Main Street and garden.
// Small animations react to the simulation (a ball flies when someone is at the hoop or ping-pong table).

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FurnitureItem } from "@/lib/data/types";
import { getSim } from "@/lib/office/runtime";
import { useOffice } from "@/lib/store/office-store";
import { isKobeDay } from "@/lib/office/kobeday";
import { WALL_HEIGHT } from "./Building";
import { mat, makeScreenTexture } from "./materials";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const SPH = new THREE.SphereGeometry(0.5, 16, 12);
const TORUS = new THREE.TorusGeometry(0.5, 0.06, 8, 24);
const PLANE = new THREE.PlaneGeometry(1, 1);

type V3 = [number, number, number];
const B = ({ p, s, c, m, r, shadow = true }: { p: V3; s: V3; c?: string; m?: THREE.Material; r?: V3; shadow?: boolean }) => (
  <mesh geometry={BOX} position={p} scale={s} rotation={r} material={m ?? mat(c ?? "#fff")} castShadow={shadow} receiveShadow />
);
const C = ({ p, s, c, m, r }: { p: V3; s: V3; c?: string; m?: THREE.Material; r?: V3 }) => (
  <mesh geometry={CYL} position={p} scale={s} rotation={r} material={m ?? mat(c ?? "#fff")} castShadow receiveShadow />
);

const PURPLE = "#552583";
const GOLD = "#fdb927";

/** How many people are actually standing/sitting at this item's spots right now
 *  (not just walking towards them — a spot is reserved as soon as someone sets off). */
function occupied(itemId: string, seats: number) {
  const sim = getSim();
  let n = 0;
  for (let i = 0; i < seats; i++) {
    const seatId = seats === 1 ? itemId : `${itemId}:${i}`;
    const agentId = sim.occupancy.get(seatId);
    const a = agentId ? sim.agents.get(agentId) : undefined;
    const seat = sim.seats.get(seatId);
    if (a && seat && a.seatId === seatId && a.pose !== "walk" && !a.glide && Math.hypot(a.x - seat.x, a.z - seat.z) < 0.6) n++;
  }
  return n;
}

// ---------------------------------------------------------------- game room
/** Painted half-court floor (purple & gold, "24" at centre). Hoop end = local -x. */
function Court({ w, d }: { w: number; d: number }) {
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          const sx = W / w;
          const sz = H / d;
          g.fillStyle = "#c98d4f";
          g.fillRect(0, 0, W, H);
          // planks
          g.strokeStyle = "rgba(90,50,20,0.18)";
          g.lineWidth = 2;
          for (let y = 0; y < H; y += sz * 0.35) {
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(W, y);
            g.stroke();
          }
          const cy = H / 2;
          // key (paint)
          g.fillStyle = PURPLE;
          g.fillRect(0, cy - 2.45 * sz, 5.8 * sx, 4.9 * sz);
          g.strokeStyle = "#fff";
          g.lineWidth = 6;
          g.strokeRect(3, 3, W - 6, H - 6);
          g.strokeRect(0, cy - 2.45 * sz, 5.8 * sx, 4.9 * sz);
          // free-throw circle
          g.beginPath();
          g.arc(5.8 * sx, cy, 1.8 * sx, -Math.PI / 2, Math.PI / 2);
          g.stroke();
          // three-point arc
          g.beginPath();
          g.moveTo(0, cy - 4.6 * sz);
          g.lineTo(1.4 * sx, cy - 4.6 * sz);
          g.arc(1.6 * sx, cy, 4.6 * sz, -Math.PI / 2, Math.PI / 2);
          g.lineTo(0, cy + 4.6 * sz);
          g.stroke();
          // centre circle (half) with 24
          g.fillStyle = GOLD;
          g.beginPath();
          g.arc(W - 3, cy, 1.8 * sx, Math.PI / 2, (3 * Math.PI) / 2);
          g.fill();
          g.stroke();
          g.save();
          g.translate(W - 0.95 * sx, cy);
          g.rotate(-Math.PI / 2);
          g.fillStyle = PURPLE;
          g.font = `900 ${Math.round(1.2 * sx)}px system-ui, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("24", 0, 0);
          g.restore();
        },
        1024,
        Math.round((1024 * d) / w),
      ),
    [w, d],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh geometry={PLANE} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} scale={[w, d, 1]} receiveShadow>
      <meshStandardMaterial map={tex} roughness={0.55} />
    </mesh>
  );
}

/** Wall-mounted hoop; a ball arcs into the net while someone is shooting. */
function Hoop({ item }: { item: FurnitureItem }) {
  const ball = useRef<THREE.Mesh>(null);
  const t = useRef(Math.random() * 3);
  useFrame((_, dt) => {
    const b = ball.current;
    if (!b) return;
    const shooting = occupied(item.id, 2) > 0;
    b.visible = shooting;
    if (!shooting) return;
    t.current = (t.current + dt / 1.6) % 1;
    const k = t.current;
    // from a shooter ~2.8 m out (local +z) up into the rim, then drop
    const z = k < 0.7 ? 2.6 - (k / 0.7) * 2.0 : 0.6;
    const y = k < 0.7 ? 1.7 + Math.sin((k / 0.7) * Math.PI) * 1.6 + (k / 0.7) * 1.2 : 2.9 - ((k - 0.7) / 0.3) * 2.6;
    b.position.set(0, Math.max(0.12, y), z);
  });
  return (
    <group>
      <B p={[0, 1.6, -0.1]} s={[0.12, 3.2, 0.12]} c="#334155" />
      <B p={[0, 3.25, 0.05]} s={[1.6, 1.0, 0.06]} m={mat("#f8fafc", { opacity: 0.85, rough: 0.2 })} />
      <B p={[0, 3.1, 0.085]} s={[0.55, 0.42, 0.01]} c={PURPLE} shadow={false} />
      <mesh geometry={TORUS} material={mat("#ea580c", { metal: 0.4, rough: 0.4 })} position={[0, 2.9, 0.42]} rotation={[Math.PI / 2, 0, 0]} scale={[0.46, 0.46, 0.46]} />
      <mesh geometry={CYL} material={mat("#f8fafc", { opacity: 0.55, rough: 1 })} position={[0, 2.72, 0.42]} scale={[0.4, 0.34, 0.4]} />
      <mesh ref={ball} geometry={SPH} material={mat("#ea580c", { rough: 0.7 })} scale={0.24} castShadow />
    </group>
  );
}

function PingPong({ item }: { item: FurnitureItem }) {
  const ball = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const b = ball.current;
    if (!b) return;
    const playing = occupied(item.id, 2) > 0;
    b.visible = playing;
    if (!playing) return;
    t.current += dt * 1.3;
    const k = t.current % 2;
    const s = k < 1 ? k : 2 - k; // 0..1..0
    const z = -1.2 + s * 2.4;
    const y = 0.86 + Math.abs(Math.sin(t.current * Math.PI)) * 0.35;
    b.position.set(Math.sin(t.current * 2.1) * 0.35, y, z);
  });
  return (
    <group>
      <B p={[0, 0.76, 0]} s={[1.5, 0.05, 2.7]} c="#065f46" />
      <B p={[0, 0.785, 0]} s={[0.02, 0.005, 2.7]} c="#f8fafc" shadow={false} />
      <B p={[0, 0.785, 0]} s={[1.5, 0.005, 0.02]} c="#f8fafc" shadow={false} />
      <B p={[0, 0.86, 0]} s={[1.6, 0.15, 0.015]} m={mat("#f8fafc", { opacity: 0.7 })} />
      {[
        [-0.6, -1.1],
        [0.6, -1.1],
        [-0.6, 1.1],
        [0.6, 1.1],
      ].map(([x, z], i) => (
        <B key={i} p={[x, 0.37, z]} s={[0.06, 0.74, 0.06]} c="#1f2937" />
      ))}
      <mesh ref={ball} geometry={SPH} material={mat("#fb923c", { emissive: "#fb923c", ei: 0.3 })} scale={0.06} />
    </group>
  );
}

function Foosball() {
  return (
    <group>
      <B p={[0, 0.82, 0]} s={[1.4, 0.24, 0.75]} c="#14532d" />
      <B p={[0, 0.955, 0]} s={[1.3, 0.02, 0.65]} c="#22c55e" shadow={false} />
      {[-0.45, -0.15, 0.15, 0.45].map((x, i) => (
        <group key={i}>
          <C p={[x, 0.98, 0]} s={[0.025, 1.05, 0.025]} r={[Math.PI / 2, 0, 0]} c="#cbd5e1" />
          {[-0.2, 0, 0.2].map((z, j) => (
            <B key={j} p={[x, 0.98, z]} s={[0.05, 0.12, 0.05]} c={i % 2 ? GOLD : PURPLE} />
          ))}
        </group>
      ))}
      {[
        [-0.6, -0.3],
        [0.6, -0.3],
        [-0.6, 0.3],
        [0.6, 0.3],
      ].map(([x, z], i) => (
        <B key={i} p={[x, 0.35, z]} s={[0.08, 0.7, 0.08]} c="#0f172a" />
      ))}
    </group>
  );
}

function Arcade({ color = "#ec4899", night }: { color?: string; night?: boolean }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (screen.current) screen.current.emissiveIntensity = (night ? 1.6 : 0.9) + Math.sin(clock.elapsedTime * 6) * 0.25;
  });
  return (
    <group>
      <B p={[0, 0.85, -0.05]} s={[0.72, 1.7, 0.7]} c="#111827" />
      <B p={[-0.37, 0.85, -0.05]} s={[0.02, 1.72, 0.72]} c={color} />
      <B p={[0.37, 0.85, -0.05]} s={[0.02, 1.72, 0.72]} c={color} />
      <B p={[0, 1.78, 0.18]} s={[0.66, 0.18, 0.2]} m={mat(color, { emissive: color, ei: night ? 1.8 : 0.8 })} />
      <mesh position={[0, 1.32, 0.31]} rotation={[-0.25, 0, 0]} scale={[0.5, 0.4, 1]} geometry={PLANE}>
        <meshStandardMaterial ref={screen} color="#0b1220" emissive={new THREE.Color("#38bdf8")} emissiveIntensity={1} />
      </mesh>
      <B p={[0, 0.98, 0.33]} s={[0.66, 0.06, 0.3]} c="#1f2937" />
      <C p={[-0.15, 1.04, 0.36]} s={[0.04, 0.08, 0.04]} c="#ef4444" />
      <C p={[0.08, 1.03, 0.36]} s={[0.05, 0.03, 0.05]} c="#facc15" />
      <C p={[0.2, 1.03, 0.36]} s={[0.05, 0.03, 0.05]} c="#22c55e" />
    </group>
  );
}

// ---------------------------------------------------------------- pantry
function CoffeeBar({ w, night }: { w: number; night?: boolean }) {
  return (
    <group>
      <B p={[0, 0.5, 0]} s={[w, 1.0, 0.8]} c="#7c4a24" />
      <B p={[0, 1.02, 0.05]} s={[w + 0.1, 0.05, 0.95]} c="#e7e5e4" />
      {/* espresso machine + teh tarik pots */}
      <B p={[-1.2, 1.25, -0.15]} s={[0.7, 0.42, 0.45]} c="#9ca3af" />
      <B p={[-1.2, 1.5, -0.15]} s={[0.6, 0.06, 0.4]} c="#475569" />
      <C p={[0.2, 1.17, -0.1]} s={[0.22, 0.25, 0.22]} c="#cbd5e1" />
      <C p={[0.55, 1.17, -0.1]} s={[0.2, 0.22, 0.2]} c="#cbd5e1" />
      {[-0.9, -0.6, 1.0, 1.3].map((x, i) => (
        <C key={i} p={[x, 1.1, 0.25]} s={[0.09, 0.11, 0.09]} c={i % 2 ? "#f8fafc" : "#fef3c7"} />
      ))}
      {/* menu board */}
      <B p={[0, 2.0, -0.38]} s={[2.2, 0.8, 0.05]} m={mat("#1f2937", { emissive: night ? "#f59e0b" : "#000000", ei: night ? 0.25 : 0 })} />
      <B p={[0, 2.25, -0.35]} s={[1.6, 0.08, 0.01]} c="#fbbf24" shadow={false} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[-0.4 + i * 0.4, 1.95 - (i % 2) * 0.12, -0.35]} s={[0.7, 0.04, 0.01]} c="#f8fafc" shadow={false} />
      ))}
      {/* stools */}
      {[-1.3, 0, 1.3].map((x, i) => (
        <group key={i} position={[x, 0, 0.75]}>
          <C p={[0, 0.38, 0]} s={[0.05, 0.76, 0.05]} c="#334155" />
          <C p={[0, 0.78, 0]} s={[0.36, 0.06, 0.36]} c="#b45309" />
        </group>
      ))}
    </group>
  );
}

const SNACK_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#facc15"];
function SnackShelf({ w }: { w: number }) {
  return (
    <group>
      <B p={[0, 1.0, 0]} s={[w, 2.0, 0.45]} c="#f8fafc" />
      {[0.45, 0.95, 1.45].map((y, r) => (
        <group key={r}>
          <B p={[0, y - 0.05, 0.05]} s={[w - 0.1, 0.03, 0.4]} c="#cbd5e1" />
          {Array.from({ length: 7 }).map((_, i) => (
            <B key={i} p={[-w / 2 + 0.2 + i * ((w - 0.4) / 6), y + 0.1, 0.1]} s={[0.18, 0.26, 0.14]} c={SNACK_COLORS[(i + r * 2) % SNACK_COLORS.length]} />
          ))}
        </group>
      ))}
      <B p={[0, 1.88, 0.23]} s={[w - 0.2, 0.18, 0.02]} c="#dc2626" />
    </group>
  );
}

// ---------------------------------------------------------------- street & garden
function BeanBag({ color = "#f59e0b" }: { color?: string }) {
  return (
    <group>
      <mesh geometry={SPH} material={mat(color, { rough: 0.95 })} position={[0, 0.28, 0.02]} scale={[0.9, 0.55, 0.85]} castShadow receiveShadow />
      <mesh geometry={SPH} material={mat(color, { rough: 0.95 })} position={[0, 0.5, -0.3]} scale={[0.75, 0.6, 0.4]} castShadow />
    </group>
  );
}

function Bike({ color = "#ef4444" }: { color?: string }) {
  const tyre = mat("#111827", { rough: 0.9 });
  return (
    <group>
      {[-0.55, 0.55].map((x, i) => (
        <mesh key={i} geometry={TORUS} material={tyre} position={[x, 0.36, 0]} scale={[0.66, 0.66, 0.66]} castShadow />
      ))}
      <B p={[0, 0.56, 0]} s={[1.0, 0.05, 0.05]} c={color} r={[0, 0, 0.1]} />
      <B p={[-0.22, 0.48, 0]} s={[0.05, 0.5, 0.05]} c={color} r={[0, 0, -0.35]} />
      <B p={[0.42, 0.62, 0]} s={[0.05, 0.55, 0.05]} c={color} r={[0, 0, 0.3]} />
      <B p={[-0.3, 0.8, 0]} s={[0.24, 0.05, 0.12]} c="#111827" />
      <B p={[0.5, 0.92, 0]} s={[0.05, 0.05, 0.45]} c="#111827" />
      <B p={[-0.62, 0.4, 0.12]} s={[0.3, 0.2, 0.06]} c="#a16207" />
    </group>
  );
}

function Hammock({ item, night }: { item: FurnitureItem; night?: boolean }) {
  const net = useRef<THREE.Group>(null);
  const seed = useMemo(() => item.id.length * 0.7, [item.id]);
  useFrame(({ clock }) => {
    if (net.current) net.current.rotation.x = Math.sin(clock.elapsedTime * 0.8 + seed) * 0.08;
  });
  return (
    <group>
      {[-1.25, 1.25].map((x, i) => (
        <group key={i}>
          <B p={[x, 0.7, 0]} s={[0.1, 1.4, 0.1]} c="#6b4a2e" />
          {night && <mesh geometry={SPH} material={mat("#fde68a", { emissive: "#fbbf24", ei: 2 })} position={[x, 1.45, 0]} scale={0.1} />}
        </group>
      ))}
      <group ref={net} position={[0, 1.1, 0]}>
        <mesh geometry={CYL} material={mat("#f59e0b", { rough: 1 })} position={[0, -0.5, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.75, 2.2, 0.35]} castShadow />
      </group>
    </group>
  );
}

function NapPod({ night }: { night?: boolean }) {
  return (
    <group>
      <B p={[0, 0.22, 0]} s={[1.5, 0.44, 1.2]} c="#e2e8f0" />
      <mesh geometry={SPH} material={mat("#f8fafc", { rough: 0.3 })} position={[0, 0.55, -0.15]} scale={[1.5, 1.0, 1.0]} castShadow />
      <mesh geometry={SPH} material={mat("#0f172a", { opacity: 0.6, rough: 0.1 })} position={[0, 0.58, 0.2]} scale={[1.1, 0.7, 0.6]} />
      <B p={[0, 0.46, 0.3]} s={[1.2, 0.06, 0.5]} c="#93c5fd" />
      {night && <mesh geometry={SPH} material={mat("#a5b4fc", { emissive: "#818cf8", ei: 1.5 })} position={[0.6, 0.9, -0.1]} scale={0.06} />}
    </group>
  );
}

function Bench() {
  return (
    <group>
      <B p={[0, 0.44, 0.02]} s={[1.8, 0.07, 0.5]} c="#a16207" />
      <B p={[0, 0.72, -0.22]} s={[1.8, 0.4, 0.06]} c="#a16207" />
      {[-0.75, 0.75].map((x, i) => (
        <B key={i} p={[x, 0.22, 0]} s={[0.08, 0.44, 0.5]} c="#334155" />
      ))}
    </group>
  );
}

function Bbq({ item, night }: { item: FurnitureItem; night?: boolean }) {
  const coals = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const busy = occupied(item.id, 1) > 0;
    if (coals.current) coals.current.emissiveIntensity = busy || night ? 1.4 + Math.sin(clock.elapsedTime * 9) * 0.4 : 0.3;
  });
  return (
    <group>
      <B p={[0, 0.45, 0]} s={[1.1, 0.5, 0.7]} c="#1f2937" />
      <mesh geometry={BOX} position={[0, 0.71, 0]} scale={[0.95, 0.03, 0.55]}>
        <meshStandardMaterial ref={coals} color="#7c2d12" emissive={new THREE.Color("#f97316")} emissiveIntensity={0.3} />
      </mesh>
      {[-0.3, 0, 0.3].map((x, i) => (
        <B key={i} p={[x, 0.76, 0]} s={[0.06, 0.04, 0.45]} c={i === 1 ? "#a16207" : "#b91c1c"} />
      ))}
      <B p={[0.75, 0.6, 0]} s={[0.4, 0.04, 0.5]} c="#64748b" />
      {[
        [-0.45, -0.25],
        [0.45, -0.25],
        [-0.45, 0.25],
        [0.45, 0.25],
      ].map(([x, z], i) => (
        <B key={i} p={[x, 0.1, z]} s={[0.06, 0.2, 0.06]} c="#111827" />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- work-floor props
function PhoneBooth({ night }: { night?: boolean }) {
  return (
    <group>
      <B p={[0, 1.1, -0.55]} s={[1.2, 2.2, 0.08]} c="#1e3a5f" />
      <B p={[-0.56, 1.1, 0]} s={[0.08, 2.2, 1.2]} c="#1e3a5f" />
      <B p={[0.56, 1.1, 0]} s={[0.08, 2.2, 1.2]} c="#1e3a5f" />
      <B p={[0, 2.22, 0]} s={[1.2, 0.08, 1.2]} c="#1e3a5f" />
      <B p={[0, 1.1, 0.56]} s={[1.04, 2.1, 0.03]} m={mat("#bfdbfe", { opacity: 0.35, rough: 0.05 })} />
      <B p={[0, 0.85, -0.3]} s={[0.8, 0.05, 0.35]} c="#a16207" />
      <C p={[0, 0.45, 0.05]} s={[0.4, 0.45, 0.4]} c="#f59e0b" />
      <B p={[0, 2.05, 0]} s={[0.5, 0.03, 0.5]} m={mat("#fef9c3", { emissive: "#fde68a", ei: night ? 1.6 : 0.5 })} shadow={false} />
    </group>
  );
}

function PlanterDivider({ w }: { w: number }) {
  const n = Math.max(2, Math.round(w / 0.6));
  return (
    <group>
      <B p={[0, 0.3, 0]} s={[w, 0.6, 0.45]} c="#e7e5e4" />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} geometry={SPH} material={mat(i % 2 ? "#3f7d3f" : "#4c9150", { rough: 0.9 })} position={[-w / 2 + 0.3 + (i * (w - 0.6)) / (n - 1), 0.85, 0]} scale={[0.55, 0.6, 0.5]} castShadow />
      ))}
    </group>
  );
}

function Printer() {
  return (
    <group>
      <B p={[0, 0.35, 0]} s={[0.8, 0.7, 0.6]} c="#e5e7eb" />
      <B p={[0, 0.75, -0.05]} s={[0.7, 0.12, 0.5]} c="#9ca3af" />
      <B p={[0, 0.62, 0.3]} s={[0.5, 0.02, 0.15]} c="#f8fafc" />
      <B p={[0.25, 0.72, 0.28]} s={[0.15, 0.04, 0.05]} m={mat("#22c55e", { emissive: "#22c55e", ei: 0.8 })} shadow={false} />
    </group>
  );
}

function ParcelStack() {
  const boxes: [number, number, number, number][] = [
    [-0.22, 0.17, -0.1, 0.34],
    [0.22, 0.15, -0.12, 0.3],
    [0, 0.15, 0.2, 0.3],
    [-0.1, 0.48, -0.05, 0.28],
    [0.18, 0.43, 0.05, 0.22],
  ];
  return (
    <group>
      {boxes.map(([x, y, z, sz], i) => (
        <group key={i}>
          <B p={[x, y, z]} s={[sz * 1.2, sz, sz]} c={i % 2 ? "#c69c6d" : "#b9895a"} />
          <B p={[x, y + sz / 2 + 0.002, z]} s={[sz * 1.2, 0.004, 0.05]} c="#ee4d2d" shadow={false} />
        </group>
      ))}
    </group>
  );
}

function StandingTable() {
  return (
    <group>
      <B p={[0, 1.05, 0]} s={[1.2, 0.05, 0.7]} c="#f8fafc" />
      <C p={[0, 0.52, 0]} s={[0.1, 1.05, 0.1]} c="#334155" />
      <B p={[0, 0.02, 0]} s={[0.6, 0.04, 0.4]} c="#334155" />
      <C p={[-0.3, 1.12, 0.1]} s={[0.08, 0.1, 0.08]} c="#f59e0b" />
      <B p={[0.25, 1.09, -0.05]} s={[0.3, 0.02, 0.22]} c="#e2e8f0" />
    </group>
  );
}

function RingLight({ night }: { night?: boolean }) {
  return (
    <group>
      <C p={[0, 0.8, 0]} s={[0.04, 1.6, 0.04]} c="#111827" />
      <mesh geometry={TORUS} material={mat("#ffffff", { emissive: "#fff7ed", ei: night ? 2.2 : 1.2 })} position={[0, 1.65, 0.05]} scale={[0.36, 0.36, 0.6]} />
      {[0, 1, 2].map((i) => (
        <B key={i} p={[Math.sin((i * 2 * Math.PI) / 3) * 0.25, 0.06, Math.cos((i * 2 * Math.PI) / 3) * 0.25]} s={[0.05, 0.12, 0.3]} r={[0, (i * 2 * Math.PI) / 3, 0.5]} c="#111827" />
      ))}
    </group>
  );
}

function CameraTripod() {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <B key={i} p={[Math.sin((i * 2 * Math.PI) / 3) * 0.18, 0.62, Math.cos((i * 2 * Math.PI) / 3) * 0.18]} s={[0.03, 1.3, 0.03]} r={[Math.cos((i * 2 * Math.PI) / 3) * -0.25, 0, Math.sin((i * 2 * Math.PI) / 3) * 0.25]} c="#111827" />
      ))}
      <B p={[0, 1.33, 0]} s={[0.28, 0.18, 0.16]} c="#1f2937" />
      <C p={[0, 1.34, 0.14]} s={[0.12, 0.14, 0.12]} r={[Math.PI / 2, 0, 0]} c="#0f172a" />
      <B p={[0.08, 1.45, 0]} s={[0.05, 0.03, 0.05]} m={mat("#ef4444", { emissive: "#ef4444", ei: 1 })} shadow={false} />
    </group>
  );
}

/** Framed artwork on a wall. color = accent; "map" draws a world map. */
function WallArt({ w, color = "#1e3a5f" }: { w: number; color?: string }) {
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          if (color === "map") {
            g.fillStyle = "#1e3a8a";
            g.fillRect(0, 0, W, H);
            g.fillStyle = "#4ade80";
            const blobs: [number, number, number, number][] = [
              [0.2, 0.35, 0.12, 0.18], [0.27, 0.68, 0.06, 0.16], [0.48, 0.3, 0.08, 0.1], [0.52, 0.58, 0.07, 0.18],
              [0.68, 0.33, 0.16, 0.14], [0.77, 0.6, 0.05, 0.08], [0.85, 0.75, 0.07, 0.06],
            ];
            for (const [x, y, rx, ry] of blobs) {
              g.beginPath();
              g.ellipse(x * W, y * H, rx * W, ry * H, 0, 0, Math.PI * 2);
              g.fill();
            }
            g.fillStyle = "#f43f5e";
            for (const [x, y] of [[0.74, 0.55], [0.2, 0.33], [0.5, 0.28], [0.8, 0.36], [0.53, 0.62]]) {
              g.beginPath();
              g.arc(x * W, y * H, 9, 0, Math.PI * 2);
              g.fill();
            }
            return;
          }
          g.fillStyle = "#f8fafc";
          g.fillRect(0, 0, W, H);
          g.fillStyle = color;
          g.beginPath();
          g.arc(W * 0.35, H * 0.55, H * 0.3, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.6;
          g.fillStyle = "#f59e0b";
          g.fillRect(W * 0.5, H * 0.2, W * 0.3, H * 0.55);
          g.globalAlpha = 1;
          g.strokeStyle = "#0f172a";
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(W * 0.1, H * 0.85);
          g.bezierCurveTo(W * 0.4, H * 0.6, W * 0.6, H * 0.95, W * 0.9, H * 0.7);
          g.stroke();
        },
        512,
        320,
      ),
    [color],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  const h = color === "map" ? 1.2 : 0.9;
  const y = useWallY(h, 1.55);
  return (
    <group>
      <B p={[0, y, 0]} s={[w + 0.08, h + 0.08, 0.04]} c="#111827" />
      <mesh geometry={PLANE} position={[0, y, 0.025]} scale={[w, h, 1]}>
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

const SWATCHES = ["#d6c3a5", "#8b5a2b", "#e7e5e4", "#57534e", "#b45309", "#f5f5f4", "#a8a29e", "#78350f", "#cbd5e1", "#9a3412", "#d4d4d8", "#713f12"];
function MaterialWall({ w }: { w: number }) {
  return (
    <group>
      <B p={[0, 1.0, 0]} s={[w, 2.0, 0.3]} c="#f5f5f4" />
      {SWATCHES.map((c, i) => (
        <B key={i} p={[-w / 2 + 0.3 + (i % 6) * ((w - 0.6) / 5), 0.75 + Math.floor(i / 6) * 0.6, 0.17]} s={[0.32, 0.45, 0.03]} c={c} />
      ))}
      <B p={[0, 1.85, 0.16]} s={[w - 0.3, 0.12, 0.02]} c="#b45309" />
    </group>
  );
}

function RobotArm() {
  const arm = useRef<THREE.Group>(null);
  const fore = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (arm.current) arm.current.rotation.y = Math.sin(t * 0.6) * 0.9;
    if (fore.current) fore.current.rotation.z = -0.9 + Math.sin(t * 1.1) * 0.35;
  });
  return (
    <group>
      <B p={[0, 0.4, 0]} s={[0.9, 0.8, 0.7]} c="#334155" />
      <group ref={arm} position={[0, 0.85, 0]}>
        <C p={[0, 0.05, 0]} s={[0.3, 0.1, 0.3]} c="#f97316" />
        <group rotation={[0, 0, 0.5]}>
          <B p={[0, 0.3, 0]} s={[0.1, 0.55, 0.1]} c="#f97316" />
          <group ref={fore} position={[0, 0.58, 0]}>
            <B p={[0.2, 0, 0]} s={[0.4, 0.08, 0.08]} c="#f97316" />
            <B p={[0.42, -0.04, 0]} s={[0.06, 0.12, 0.12]} c="#111827" />
          </group>
        </group>
      </group>
    </group>
  );
}

function Printer3D({ night }: { night?: boolean }) {
  const head = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (head.current) head.current.position.x = Math.sin(clock.elapsedTime * 2.2) * 0.18;
  });
  return (
    <group>
      <B p={[0, 0.25, 0]} s={[0.7, 0.5, 0.7]} c="#1f2937" />
      {[-0.3, 0.3].map((x, i) => (
        <B key={i} p={[x, 0.85, 0]} s={[0.05, 0.7, 0.05]} c="#94a3b8" />
      ))}
      <B p={[0, 1.2, 0]} s={[0.66, 0.05, 0.05]} c="#94a3b8" />
      <mesh ref={head} geometry={BOX} material={mat("#22d3ee", { emissive: "#22d3ee", ei: night ? 1.4 : 0.5 })} position={[0, 1.1, 0]} scale={[0.12, 0.1, 0.12]} />
      <B p={[0, 0.58, 0]} s={[0.5, 0.04, 0.5]} c="#475569" />
      <C p={[0, 0.66, 0]} s={[0.16, 0.12, 0.16]} c="#a855f7" />
    </group>
  );
}

// ---------------------------------------------------------------- CEO suite: Mamba corner
const GOLD_M = () => mat("#d4a017", { metal: 0.9, rough: 0.22 });

/** Height for wall-mounted items: lower them so they sit on the wall in cut-away mode. */
function useWallY(h: number, ideal: number) {
  const walls = useOffice((s) => s.settings.walls);
  const top = WALL_HEIGHT[walls];
  return walls === "full" ? ideal : Math.max(h / 2 + 0.12, Math.min(ideal, top - h / 2 - 0.04));
}

const SNEAKERS: [string, string][] = [
  ["#552583", "#fdb927"], ["#fdb927", "#552583"], ["#f8fafc", "#552583"], ["#111827", "#fdb927"], ["#dc2626", "#111827"], ["#f8fafc", "#fdb927"],
  ["#0f766e", "#f8fafc"], ["#111827", "#dc2626"], ["#fdb927", "#111827"], ["#552583", "#f8fafc"], ["#2563eb", "#f8fafc"], ["#f8fafc", "#111827"],
  ["#111827", "#f8fafc"], ["#fdb927", "#f8fafc"], ["#552583", "#111827"], ["#ea580c", "#111827"], ["#f8fafc", "#dc2626"], ["#22c55e", "#111827"],
  ["#111827", "#552583"], ["#f8fafc", "#2563eb"], ["#fdb927", "#dc2626"], ["#7c3aed", "#fdb927"], ["#111827", "#111827"], ["#fdb927", "#fdb927"],
];

/** 24 lit cubbies (6 x 4), one pair of sneakers each. */
function SneakerWall({ w, night }: { w: number; night?: boolean }) {
  const cols = 6;
  const rows = 4;
  const cw = (w - 0.2) / cols;
  const ch = 0.46;
  const glow = mat(night ? "#c4b5fd" : "#ede9fe", { emissive: night ? "#a78bfa" : "#fdb927", ei: night ? 3 : 0.35 });
  return (
    <group>
      <B p={[0, 1.1, -0.05]} s={[w, 2.2, 0.4]} c="#1f1712" />
      {Array.from({ length: cols * rows }).map((_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = -w / 2 + 0.1 + cw / 2 + c * cw;
        const y = 0.28 + r * (ch + 0.04) + ch / 2;
        const [shoe, accent] = SNEAKERS[i];
        return (
          <group key={i} position={[x, y, 0.06]}>
            <B p={[0, 0, -0.05]} s={[cw - 0.05, ch, 0.28]} c="#2a1f17" shadow={false} />
            <B p={[0, ch / 2 - 0.02, 0.0]} s={[cw - 0.08, 0.015, 0.2]} m={glow} shadow={false} />
            {[-0.075, 0.075].map((dx, k) => (
              <group key={k} position={[dx, -ch / 2 + 0.05, 0]} rotation={[0, k ? -0.15 : 0.15, 0]}>
                <B p={[0, 0.035, 0]} s={[0.09, 0.07, 0.22]} c={shoe} shadow={false} />
                <B p={[0, 0.005, 0]} s={[0.095, 0.02, 0.23]} c={accent} shadow={false} />
                <B p={[0, 0.08, -0.05]} s={[0.085, 0.05, 0.09]} c={shoe} shadow={false} />
              </group>
            ))}
          </group>
        );
      })}
      <B p={[0, 0.12, 0.16]} s={[w, 0.24, 0.12]} c="#1f1712" />
      <B p={[0, 0.2, 0.225]} s={[w - 0.3, 0.05, 0.01]} c="#fdb927" shadow={false} />
      <B p={[0, 2.24, -0.05]} s={[w + 0.04, 0.08, 0.44]} m={GOLD_M()} />
      {night && <pointLight position={[0, 1.4, 1.2]} intensity={3} distance={5} color="#c4b5fd" />}
    </group>
  );
}

/** Framed signed jersey (wall-mounted shadow box). color = the number ("8" or "24"). */
function JerseyFrame({ number = "24", night }: { number?: string; night?: boolean }) {
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.fillStyle = "#111827";
          g.fillRect(0, 0, W, H);
          const body = number === "8" ? "#fdb927" : "#552583";
          const trim = number === "8" ? "#552583" : "#fdb927";
          // jersey silhouette
          g.fillStyle = body;
          g.beginPath();
          g.moveTo(W * 0.3, H * 0.12);
          g.lineTo(W * 0.42, H * 0.12);
          g.quadraticCurveTo(W * 0.5, H * 0.24, W * 0.58, H * 0.12);
          g.lineTo(W * 0.7, H * 0.12);
          g.lineTo(W * 0.72, H * 0.3);
          g.lineTo(W * 0.68, H * 0.32);
          g.lineTo(W * 0.68, H * 0.9);
          g.lineTo(W * 0.32, H * 0.9);
          g.lineTo(W * 0.32, H * 0.32);
          g.lineTo(W * 0.28, H * 0.3);
          g.closePath();
          g.fill();
          g.strokeStyle = trim;
          g.lineWidth = 10;
          g.stroke();
          g.fillStyle = trim;
          g.font = `900 ${Math.round(H * 0.32)}px system-ui, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(number, W * 0.5, H * 0.56);
          // signature scribble
          g.strokeStyle = "#f8fafc";
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(W * 0.36, H * 0.8);
          g.bezierCurveTo(W * 0.42, H * 0.7, W * 0.46, H * 0.86, W * 0.52, H * 0.76);
          g.bezierCurveTo(W * 0.56, H * 0.7, W * 0.6, H * 0.84, W * 0.66, H * 0.74);
          g.stroke();
        },
        384,
        448,
      ),
    [number],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  const h = 1.15;
  const y = useWallY(h, 1.6);
  return (
    <group position={[0, y, 0]}>
      <B p={[0, 0, 0.02]} s={[1.02, h + 0.1, 0.08]} m={GOLD_M()} />
      <mesh geometry={PLANE} position={[0, 0, 0.065]} scale={[0.92, h, 1]}>
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
      <B p={[0, 0, 0.075]} s={[0.92, h, 0.005]} m={mat("#dbeafe", { opacity: 0.15, rough: 0.02 })} shadow={false} />
      <B p={[0, -h / 2 - 0.12, 0.05]} s={[0.4, 0.07, 0.02]} m={GOLD_M()} />
      {night && <pointLight position={[0, 0.9, 0.6]} intensity={1.6} distance={2.2} color="#fde68a" />}
    </group>
  );
}

/** Trophy & ring cabinet: 5 championship trophies, an MVP trophy, 5 rings, a game ball, and the quote plaque. */
function KobeCabinet({ w, quote, night }: { w: number; quote: string; night?: boolean }) {
  const gold = GOLD_M();
  const plaque = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.fillStyle = "#1f1712";
          g.fillRect(0, 0, W, H);
          g.fillStyle = "#e9c46a";
          g.font = `italic 600 ${Math.round(H * 0.42)}px Georgia, serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(`“${quote}”`, W / 2, H / 2 + 2, W - 30);
        },
        1024,
        96,
      ),
    [quote],
  );
  useEffect(() => () => plaque.dispose(), [plaque]);
  return (
    <group>
      <B p={[0, 0.25, 0]} s={[w, 0.5, 0.6]} c="#1f1712" />
      <mesh geometry={PLANE} position={[0, 0.26, 0.302]} scale={[w - 0.2, 0.22, 1]}>
        <meshStandardMaterial map={plaque} roughness={0.5} />
      </mesh>
      {/* open-front glass cabinet: back, sides, shelf, top */}
      <B p={[0, 1.15, -0.27]} s={[w, 1.3, 0.04]} c="#552583" />
      <B p={[-w / 2 + 0.03, 1.15, 0]} s={[0.06, 1.3, 0.56]} c="#2a1f17" />
      <B p={[w / 2 - 0.03, 1.15, 0]} s={[0.06, 1.3, 0.56]} c="#2a1f17" />
      <B p={[0, 1.2, -0.02]} s={[w - 0.1, 0.04, 0.5]} m={mat("#dbeafe", { opacity: 0.35, rough: 0.05 })} shadow={false} />
      <B p={[0, 1.83, 0]} s={[w + 0.05, 0.08, 0.6]} m={gold} />
      <B p={[0, 0.52, 0.27]} s={[w, 0.03, 0.03]} m={gold} />
      <B p={[0, 1.15, 0.27]} s={[w - 0.1, 1.24, 0.01]} m={mat("#dbeafe", { opacity: 0.12, rough: 0.03 })} shadow={false} />
      <B p={[0, 1.77, -0.05]} s={[w - 0.2, 0.02, 0.3]} m={mat("#fde68a", { emissive: "#fde68a", ei: night ? 1.6 : 0.7 })} shadow={false} />
      {/* 5 championship trophies (gold ball on a net-shaped body) */}
      {[-1.2, -0.6, 0, 0.6, 1.2].map((x, i) => (
        <group key={i} position={[x * (w / 3.4), 0.5, 0]}>
          <C p={[0, 0.04, 0]} s={[0.22, 0.08, 0.22]} c="#111827" />
          <mesh position={[0, 0.3, 0]} scale={[0.11, 0.42, 0.11]} material={gold} castShadow>
            <cylinderGeometry args={[0.9, 0.45, 1, 12]} />
          </mesh>
          <mesh geometry={SPH} material={gold} position={[0, 0.58, 0]} scale={0.18} castShadow />
        </group>
      ))}
      {/* MVP trophy on top shelf + rings tray + game ball */}
      <group position={[-w / 2 + 0.45, 1.25, 0.02]}>
        <B p={[0, 0.05, 0]} s={[0.22, 0.1, 0.16]} c="#111827" />
        <B p={[0, 0.3, 0]} s={[0.08, 0.4, 0.05]} m={mat("#e5e7eb", { metal: 0.9, rough: 0.2 })} />
        <mesh geometry={SPH} material={mat("#e5e7eb", { metal: 0.9, rough: 0.2 })} position={[0, 0.55, 0]} scale={0.12} />
      </group>
      <group position={[0, 1.22, 0.05]}>
        <B p={[0, 0.03, 0]} s={[1.0, 0.06, 0.3]} c="#552583" />
        {[-0.36, -0.18, 0, 0.18, 0.36].map((x, i) => (
          <mesh key={i} geometry={TORUS} material={gold} position={[x, 0.11, 0]} rotation={[Math.PI / 2.4, 0, 0]} scale={[0.11, 0.11, 0.2]} castShadow />
        ))}
      </group>
      <group position={[w / 2 - 0.45, 1.25, 0.02]}>
        <C p={[0, 0.04, 0]} s={[0.18, 0.08, 0.18]} c="#111827" />
        <mesh geometry={SPH} material={mat("#ea580c", { rough: 0.75 })} position={[0, 0.22, 0]} scale={0.26} castShadow />
      </group>
    </group>
  );
}

/** Court-floor lounge rug with the "24" centre circle and a ball by the sofa. */
function CourtRug({ w, d }: { w: number; d: number }) {
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.fillStyle = "#c98d4f";
          g.fillRect(0, 0, W, H);
          g.strokeStyle = "rgba(90,50,20,0.2)";
          g.lineWidth = 2;
          for (let y = 0; y < H; y += H / 10) {
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(W, y);
            g.stroke();
          }
          g.strokeStyle = "#fff";
          g.lineWidth = 8;
          g.strokeRect(6, 6, W - 12, H - 12);
          g.fillStyle = "#552583";
          g.beginPath();
          g.arc(W / 2, H / 2, H * 0.3, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          g.fillStyle = "#fdb927";
          g.font = `900 ${Math.round(H * 0.3)}px system-ui, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("24", W / 2, H / 2 + 4);
        },
        768,
        Math.round((768 * d) / w),
      ),
    [w, d],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group>
      <mesh geometry={PLANE} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, 0]} scale={[w, d, 1]} receiveShadow>
        <meshStandardMaterial map={tex} roughness={0.55} />
      </mesh>
      <mesh geometry={SPH} material={mat("#ea580c", { rough: 0.75 })} position={[-w / 2 + 0.5, 0.12, d / 2 - 0.45]} scale={0.24} castShadow />
    </group>
  );
}

// Shots taken at the CEO's mini hoop (clicking it fires one).
let miniShots = 0;
export function shootMiniHoop() {
  miniShots++;
}

function MiniHoop() {
  const ball = useRef<THREE.Mesh>(null);
  const seen = useRef(0);
  const t = useRef(-1);
  const y0 = useWallY(0.7, 1.9);
  useFrame((_, dt) => {
    const b = ball.current;
    if (!b) return;
    if (miniShots !== seen.current) {
      seen.current = miniShots;
      t.current = 0;
    }
    if (t.current < 0) {
      b.visible = false;
      return;
    }
    b.visible = true;
    t.current += dt / 1.1;
    const k = t.current;
    if (k >= 1) {
      t.current = -1;
      return;
    }
    const z = k < 0.7 ? 2.4 - (k / 0.7) * 2.0 : 0.4;
    const y = k < 0.7 ? 1.0 + Math.sin((k / 0.7) * Math.PI) * 1.0 + (k / 0.7) * (y0 - 0.9) : y0 - 0.1 - ((k - 0.7) / 0.3) * (y0 - 0.2);
    b.position.set(0, Math.max(0.12, y), z);
  });
  return (
    <group>
      <B p={[0, y0, 0.03]} s={[0.9, 0.6, 0.04]} m={mat("#f8fafc", { opacity: 0.9, rough: 0.2 })} />
      <B p={[0, y0 - 0.05, 0.055]} s={[0.34, 0.26, 0.01]} c="#552583" shadow={false} />
      <mesh geometry={TORUS} material={mat("#fdb927", { metal: 0.5, rough: 0.3 })} position={[0, y0 - 0.25, 0.26]} rotation={[Math.PI / 2, 0, 0]} scale={[0.24, 0.24, 0.4]} />
      <mesh ref={ball} geometry={SPH} material={mat("#ea580c", { rough: 0.7 })} scale={0.16} visible={false} castShadow />
    </group>
  );
}

const FISH = ["#f97316", "#facc15", "#38bdf8", "#f43f5e", "#a3e635", "#fdb927", "#c084fc"];
function Aquarium({ w, night }: { w: number; night?: boolean }) {
  const fish = useRef<(THREE.Group | null)[]>([]);
  const seeds = useMemo(() => FISH.map((_, i) => ({ sp: 0.25 + (i % 3) * 0.12, y: 0.75 + (i % 4) * 0.17, ph: i * 1.7 })), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const g = fish.current[i];
      if (!g) return;
      const p = Math.sin(t * s.sp + s.ph);
      g.position.set(p * (w / 2 - 0.25), s.y + Math.sin(t * 1.3 + s.ph) * 0.04, Math.cos(t * s.sp * 1.3 + s.ph) * 0.12);
      g.rotation.y = Math.cos(t * s.sp + s.ph) > 0 ? 0 : Math.PI;
    });
  });
  return (
    <group>
      <B p={[0, 0.25, 0]} s={[w, 0.5, 0.6]} c="#1f1712" />
      <B p={[0, 0.95, 0]} s={[w - 0.04, 0.9, 0.52]} m={mat(night ? "#1d4ed8" : "#38bdf8", { opacity: 0.45, emissive: "#0ea5e9", ei: night ? 1.0 : 0.25, rough: 0.05 })} shadow={false} />
      <B p={[0, 0.53, 0]} s={[w - 0.1, 0.06, 0.48]} c="#e7d7b1" shadow={false} />
      {[-0.9, -0.3, 0.5, 1.0].map((x, i) => (
        <B key={i} p={[x * (w / 3), 0.7, -0.12 + (i % 2) * 0.2]} s={[0.04, 0.32 + (i % 2) * 0.15, 0.04]} c="#16a34a" shadow={false} />
      ))}
      {FISH.map((c, i) => (
        <group key={i} ref={(g) => void (fish.current[i] = g)}>
          <mesh geometry={SPH} material={mat(c, { emissive: c, ei: night ? 0.5 : 0.1 })} scale={[0.1, 0.06, 0.04]} />
          <mesh geometry={BOX} material={mat(c)} position={[-0.065, 0, 0]} scale={[0.04, 0.06, 0.01]} />
        </group>
      ))}
      <B p={[0, 1.43, 0]} s={[w, 0.06, 0.6]} c="#1f1712" />
    </group>
  );
}

/** Glowing neon lettering on a dark backing board (wall-mounted). On Kobe Day the game-room sign changes. */
function NeonSign({ w, text, color = "#ec4899", night }: { w: number; text: string; color?: string; night?: boolean }) {
  const kobe = useMemo(() => isKobeDay(), []);
  const label = kobe && text === "PLAY" ? "MAMBA FOREVER 8·24" : text;
  const tint = kobe && text === "PLAY" ? "#fdb927" : color;
  const h = 0.62;
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.clearRect(0, 0, W, H);
          g.font = `800 ${Math.round(H * (label.length > 10 ? 0.38 : 0.62))}px "Trebuchet MS", system-ui, sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.shadowColor = tint;
          g.shadowBlur = 28;
          g.strokeStyle = tint;
          g.lineWidth = 10;
          g.strokeText(label, W / 2, H / 2 + 4, W - 40);
          g.shadowBlur = 8;
          g.fillStyle = "#fff7fb";
          g.fillText(label, W / 2, H / 2 + 4, W - 40);
        },
        1024,
        Math.round((1024 * h) / w),
      ),
    [label, tint, w],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  const m = useRef<THREE.MeshBasicMaterial>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (!m.current) return;
    const t = clock.elapsedTime + seed;
    const flicker = Math.sin(t * 37) > 0.985 ? 0.55 : 1; // the odd neon flicker
    m.current.opacity = (night ? 1 : 0.82) * flicker;
  });
  const y = useWallY(h, 1.75);
  return (
    <group position={[0, y, 0]}>
      <B p={[0, 0, 0]} s={[w, h, 0.03]} c="#0b0f19" shadow={false} />
      <mesh geometry={PLANE} position={[0, 0, 0.02]} scale={[w, h, 1]}>
        <meshBasicMaterial ref={m} map={tex} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {night && <pointLight position={[0, 0, 0.6]} intensity={2.2} distance={4.5} color={tint} />}
    </group>
  );
}

/** Returns a model for the fun furniture types, or null for other types. */
export function FunVisual({ item, w, d, night }: { item: FurnitureItem; w: number; d: number; night?: boolean }) {
  switch (item.type) {
    case "court":
      return <Court w={w} d={d} />;
    case "hoop":
      return <Hoop item={item} />;
    case "ping_pong":
      return <PingPong item={item} />;
    case "foosball":
      return <Foosball />;
    case "arcade":
      return <Arcade color={item.color} night={night} />;
    case "coffee_bar":
      return <CoffeeBar w={w} night={night} />;
    case "snack_shelf":
      return <SnackShelf w={w} />;
    case "bean_bag":
      return <BeanBag color={item.color} />;
    case "bike":
      return <Bike color={item.color} />;
    case "hammock":
      return <Hammock item={item} night={night} />;
    case "nap_pod":
      return <NapPod night={night} />;
    case "bench":
      return <Bench />;
    case "bbq":
      return <Bbq item={item} night={night} />;
    case "phone_booth":
      return <PhoneBooth night={night} />;
    case "planter_divider":
      return <PlanterDivider w={w} />;
    case "printer":
      return <Printer />;
    case "parcel_stack":
      return <ParcelStack />;
    case "standing_table":
      return <StandingTable />;
    case "ring_light":
      return <RingLight night={night} />;
    case "camera_tripod":
      return <CameraTripod />;
    case "wall_art":
      return <WallArt w={w} color={item.color} />;
    case "material_wall":
      return <MaterialWall w={w} />;
    case "robot_arm":
      return <RobotArm />;
    case "printer_3d":
      return <Printer3D night={night} />;
    case "sneaker_wall":
      return <SneakerWall w={w} night={night} />;
    case "jersey_frame":
      return <JerseyFrame number={item.color} night={night} />;
    case "kobe_cabinet":
      return <KobeCabinet w={w} quote={item.label ?? "Rest at the end, not in the middle."} night={night} />;
    case "court_rug":
      return <CourtRug w={w} d={d} />;
    case "mini_hoop":
      return <MiniHoop />;
    case "aquarium":
      return <Aquarium w={w} night={night} />;
    case "neon_sign":
      return <NeonSign w={w} text={item.label ?? "OPEN"} color={item.color} night={night} />;
    default:
      return null;
  }
}
