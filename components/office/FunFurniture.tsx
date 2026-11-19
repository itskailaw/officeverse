"use client";

// Models for the fun spaces: game room, kopitiam pantry, Main Street and garden.
// Small animations react to the simulation (a ball flies when someone is at the hoop or ping-pong table).

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FurnitureItem } from "@/lib/data/types";
import { getSim } from "@/lib/office/runtime";
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

/** How many of this item's seats are occupied right now. */
function occupied(itemId: string, seats: number) {
  const occ = getSim().occupancy;
  let n = 0;
  for (let i = 0; i < seats; i++) if (occ.has(seats === 1 ? itemId : `${itemId}:${i}`)) n++;
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
    default:
      return null;
  }
}
