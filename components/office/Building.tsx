"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Door, Room, WallMode } from "@/lib/data/types";
import { DOORS, OFFICE_D, OFFICE_W, ROOMS, WALLS, wallSegments } from "@/lib/office/layout";
import { getSim } from "@/lib/office/runtime";
import { carpetTexture, makeScreenTexture, mat, plankTexture, tileTexture, PALETTE as P } from "./materials";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);

export const WALL_HEIGHT: Record<WallMode, number> = { full: 2.7, cutaway: 1.05, hidden: 0.08 };
const THICK = 0.15;
const SILL = 0.9;
const HEAD = 2.35;

export type Brand = { name: string; color: string };

const CARPET: Record<string, string> = {
  ea: "#d9d2e9",
  wgs: "#cfd8e3",
  finance: "#d6d3d1",
  marketing: "#e5dcd3",
  artides: "#ddd3c4",
  amare: "#d9d4e6",
};

function mix(a: string, b: string, t: number) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
}

// ------------------------------------------------------------------ floors
function RoomFloor({ room, wood, brand }: { room: Room; wood: string; brand?: Brand }) {
  const w = room.x1 - room.x0;
  const d = room.z1 - room.z0;
  const material = useMemo(() => {
    let tex: THREE.Texture;
    let repeat: [number, number];
    if (room.floor === "grass") {
      tex = carpetTexture("#8fbf6f").clone();
      repeat = [w / 1.5, d / 1.5];
    } else if (room.floor === "wood") {
      tex = plankTexture(room.id === "ceo" ? "#5a3a24" : room.id === "kopitiam" ? "#a0703f" : wood).clone();
      repeat = [w / 4, d / 4];
    } else if (room.floor === "carpet") {
      const base = CARPET[room.id] ?? "#d4d4d8";
      tex = carpetTexture(brand ? mix(base, brand.color, 0.14) : base).clone();
      repeat = [w / 2, d / 2];
    } else if (room.floor === "dark") {
      tex = room.id === "game" ? tileTexture("#3b3355", "rgba(15,10,30,0.55)").clone() : tileTexture("#475569", "rgba(15,23,42,0.5)").clone();
      repeat = [w / 0.6, d / 0.6];
    } else {
      tex = tileTexture("#f1f5f9").clone();
      repeat = [w / 1.2, d / 1.2];
    }
    tex.repeat.set(repeat[0], repeat[1]);
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: room.floor === "wood" ? 0.5 : 0.9 });
  }, [room.floor, room.id, w, d, wood, brand]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={PLANE}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[(room.x0 + room.x1) / 2, 0.002, (room.z0 + room.z1) / 2]}
      scale={[w, d, 1]}
      receiveShadow
    />
  );
}

/** Thin coloured band just inside the walls — each department wears its company colour. */
function BrandBorder({ room, color }: { room: Room; color: string }) {
  const inset = 0.22;
  const band = 0.12;
  const m = mat(color, { rough: 0.6 });
  const x0 = room.x0 + inset;
  const x1 = room.x1 - inset;
  const z0 = room.z0 + inset;
  const z1 = room.z1 - inset;
  const w = x1 - x0;
  const d = z1 - z0;
  const strips: [number, number, number, number][] = [
    [(x0 + x1) / 2, z0, w, band],
    [(x0 + x1) / 2, z1, w, band],
    [x0, (z0 + z1) / 2, band, d],
    [x1, (z0 + z1) / 2, band, d],
  ];
  return (
    <group>
      {strips.map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={PLANE} material={m} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]} scale={[sx, sz, 1]} receiveShadow />
      ))}
    </group>
  );
}

/** Branded welcome mat just inside each department door. */
function EntranceMat({ door, room, brand }: { door: Door; room: Room; brand: Brand }) {
  const inside = room.z0 + room.z1 > 2 * door.z ? 1 : -1;
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, w, h) => {
          g.fillStyle = "#1f2937";
          g.fillRect(0, 0, w, h);
          g.strokeStyle = brand.color;
          g.lineWidth = 14;
          g.strokeRect(18, 18, w - 36, h - 36);
          g.fillStyle = brand.color;
          g.font = "700 64px system-ui, sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          const initials = brand.name
            .split(/\s+/)
            .filter((s) => /^[A-Za-z]/.test(s))
            .slice(0, 3)
            .map((s) => s[0])
            .join("")
            .toUpperCase();
          g.fillText(initials, w / 2, h / 2 + 4);
        },
        512,
        256,
      ),
    [brand],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, inside > 0 ? 0 : Math.PI]} position={[door.x, 0.006, door.z + inside * 0.75]} scale={[1.5, 0.75, 1]}>
      <planeGeometry />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

// ------------------------------------------------------------------ walls
const Walls = memo(function Walls({ mode, wallColor, accent, night }: { mode: WallMode; wallColor: string; accent: string; night: boolean }) {
  const segs = useMemo(() => wallSegments(WALLS, DOORS), []);
  const h = WALL_HEIGHT[mode];
  const glass = mat("#bfdbfe", { opacity: 0.28, rough: 0.05 });
  const windowGlass = night ? mat("#fde68a", { opacity: 0.55, emissive: "#fbbf24", ei: 0.9, rough: 0.1 }) : mat("#a5c8ec", { opacity: 0.45, rough: 0.05, metal: 0.2 });
  const frame = mat("#94a3b8", { metal: 0.6, rough: 0.3 });
  return (
    <group>
      {segs.map((s, i) => {
        const horizontal = s.a[1] === s.b[1];
        const len = horizontal ? s.b[0] - s.a[0] : s.b[1] - s.a[1];
        const cx = (s.a[0] + s.b[0]) / 2;
        const cz = (s.a[1] + s.b[1]) / 2;
        const sx = horizontal ? len + THICK : THICK;
        const sz = horizontal ? THICK : len + THICK;
        if (s.kind === "glass") {
          return (
            <group key={i}>
              <mesh geometry={BOX} material={frame} position={[cx, 0.05, cz]} scale={[sx, 0.1, sz]} />
              {mode !== "hidden" && (
                <>
                  <mesh geometry={BOX} material={glass} position={[cx, h / 2, cz]} scale={[horizontal ? sx : 0.04, h, horizontal ? 0.04 : sz]} />
                  <mesh geometry={BOX} material={frame} position={[cx, h, cz]} scale={[sx, 0.06, sz]} />
                </>
              )}
            </group>
          );
        }
        if (s.kind === "fence") {
          const posts = Math.max(1, Math.round(len / 1.5));
          const fh = mode === "hidden" ? 0.1 : 0.95;
          return (
            <group key={i}>
              <mesh geometry={BOX} material={mat("#7c5a3a", { rough: 0.8 })} position={[cx, fh, cz]} scale={[horizontal ? sx : 0.08, 0.07, horizontal ? 0.08 : sz]} castShadow />
              <mesh geometry={BOX} material={mat("#7c5a3a", { rough: 0.8 })} position={[cx, fh * 0.5, cz]} scale={[horizontal ? sx : 0.06, 0.05, horizontal ? 0.06 : sz]} />
              {Array.from({ length: posts + 1 }).map((_, k) => {
                const t = -len / 2 + (k * len) / posts;
                return <mesh key={k} geometry={BOX} material={mat("#6b4a2e")} position={[horizontal ? cx + t : cx, fh / 2, horizontal ? cz : cz + t]} scale={[0.1, fh, 0.1]} castShadow />;
              })}
            </group>
          );
        }
        const exterior = s.kind === "exterior";
        const wallMat = mat(exterior ? "#e8edf3" : wallColor, { rough: 0.85 });
        // exterior walls get a ribbon window between sill and head heights
        if (exterior && mode !== "hidden") {
          const lowH = Math.min(h, SILL);
          const glassTop = Math.min(h, HEAD);
          const mullions = Math.max(1, Math.floor(len / 1.6));
          return (
            <group key={i}>
              <mesh geometry={BOX} material={wallMat} position={[cx, lowH / 2, cz]} scale={[sx, lowH, sz]} castShadow receiveShadow />
              {h > SILL && (
                <>
                  <mesh geometry={BOX} material={windowGlass} position={[cx, (SILL + glassTop) / 2, cz]} scale={[horizontal ? sx : 0.05, glassTop - SILL, horizontal ? 0.05 : sz]} />
                  <mesh geometry={BOX} material={frame} position={[cx, SILL, cz]} scale={[sx + 0.02, 0.05, sz + 0.02]} />
                  {Array.from({ length: mullions + 1 }).map((_, k) => {
                    const t = -len / 2 + (k * len) / mullions;
                    return (
                      <mesh
                        key={k}
                        geometry={BOX}
                        material={frame}
                        position={[horizontal ? cx + t : cx, (SILL + glassTop) / 2, horizontal ? cz : cz + t]}
                        scale={[horizontal ? 0.06 : THICK, glassTop - SILL, horizontal ? THICK : 0.06]}
                      />
                    );
                  })}
                </>
              )}
              {h > HEAD && <mesh geometry={BOX} material={wallMat} position={[cx, (HEAD + h) / 2, cz]} scale={[sx, h - HEAD, sz]} castShadow />}
              <mesh geometry={BOX} material={mat(accent)} position={[cx, h + 0.01, cz]} scale={[sx + 0.01, 0.03, sz + 0.01]} />
              <mesh geometry={BOX} material={mat(accent)} position={[cx, 0.06, cz]} scale={[sx + 0.02, 0.12, sz + 0.02]} />
            </group>
          );
        }
        return (
          <group key={i}>
            <mesh geometry={BOX} material={wallMat} position={[cx, h / 2, cz]} scale={[sx, h, sz]} castShadow receiveShadow />
            <mesh geometry={BOX} material={mat(exterior ? accent : "#cbd5e1")} position={[cx, h + 0.01, cz]} scale={[sx + 0.01, 0.02, sz + 0.01]} />
            {mode !== "hidden" && <mesh geometry={BOX} material={mat(accent)} position={[cx, 0.06, cz]} scale={[sx + 0.02, 0.12, sz + 0.02]} />}
          </group>
        );
      })}
    </group>
  );
});

/** Sliding glass doors driven by the simulation's door state. */
function SlidingDoor({ id, x, z, axis, width, mode }: { id: string; x: number; z: number; axis: "x" | "z"; width: number; mode: WallMode }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const h = mode === "full" ? 2.3 : mode === "cutaway" ? 1.0 : 0.04;
  const pw = width / 2;
  useFrame(() => {
    const d = getSim().doors.find((dd) => dd.id === id);
    const o = d?.openness ?? 0;
    const off = pw / 2 + o * pw * 0.95;
    if (left.current) left.current.position.set(axis === "x" ? -off : 0, 0, axis === "z" ? -off : 0);
    if (right.current) right.current.position.set(axis === "x" ? off : 0, 0, axis === "z" ? off : 0);
  });
  const glass = mat("#93c5fd", { opacity: 0.4, rough: 0.05 });
  const frame = mat("#64748b", { metal: 0.6, rough: 0.3 });
  const sx = axis === "x" ? pw : 0.05;
  const sz = axis === "z" ? pw : 0.05;
  const Panel = (
    <>
      <mesh geometry={BOX} material={glass} position={[0, h / 2, 0]} scale={[sx, h, sz]} />
      <mesh geometry={BOX} material={frame} position={[0, h, 0]} scale={[sx + 0.01, 0.04, sz + 0.01]} />
      <mesh geometry={BOX} material={frame} position={[0, 0.02, 0]} scale={[sx + 0.01, 0.04, sz + 0.01]} />
    </>
  );
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={BOX} material={mat("#475569")} position={[0, 0.005, 0]} scale={[axis === "x" ? width : 0.2, 0.01, axis === "z" ? width : 0.2]} />
      {mode !== "hidden" && (
        <>
          <group ref={left}>{Panel}</group>
          <group ref={right}>{Panel}</group>
        </>
      )}
      {mode === "full" && (
        <mesh geometry={BOX} material={mat("#e2e8f0")} position={[0, 2.5, 0]} scale={[axis === "x" ? width + 0.1 : THICK, 0.4, axis === "z" ? width + 0.1 : THICK]} />
      )}
    </group>
  );
}

// ------------------------------------------------------------------ exterior
const CAR_COLORS = ["#dc2626", "#f8fafc", "#1e3a5f", "#111827", "#9ca3af", "#0ea5e9"];

function Car({ color, x, z, rot }: { color: string; x: number; z: number; rot: number }) {
  const body = mat(color, { rough: 0.3, metal: 0.4 });
  const tyre = mat("#111827", { rough: 0.9 });
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <mesh geometry={BOX} material={body} position={[0, 0.42, 0]} scale={[1.75, 0.5, 4.1]} castShadow receiveShadow />
      <mesh geometry={BOX} material={body} position={[0, 0.86, -0.2]} scale={[1.55, 0.42, 2.2]} castShadow />
      <mesh geometry={BOX} material={mat("#1e293b", { rough: 0.1, metal: 0.5 })} position={[0, 0.87, -0.2]} scale={[1.58, 0.34, 2.05]} />
      {[
        [-0.82, -1.35],
        [0.82, -1.35],
        [-0.82, 1.35],
        [0.82, 1.35],
      ].map(([wx, wz], i) => (
        <mesh key={i} geometry={CYL} material={tyre} position={[wx, 0.32, wz]} rotation={[0, 0, Math.PI / 2]} scale={[0.64, 0.24, 0.64]} castShadow />
      ))}
      <mesh geometry={BOX} material={mat("#fef9c3", { emissive: "#fef08a", ei: 0.4 })} position={[0, 0.5, 2.06]} scale={[1.4, 0.12, 0.02]} />
      <mesh geometry={BOX} material={mat("#b91c1c", { emissive: "#ef4444", ei: 0.3 })} position={[0, 0.55, -2.06]} scale={[1.4, 0.1, 0.02]} />
    </group>
  );
}

function LampPost({ x, z, night }: { x: number; z: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={CYL} material={mat("#334155", { metal: 0.6, rough: 0.4 })} position={[0, 2, 0]} scale={[0.1, 4, 0.1]} castShadow />
      <mesh geometry={BOX} material={mat("#334155", { metal: 0.6, rough: 0.4 })} position={[0, 4, 0.35]} scale={[0.12, 0.08, 0.8]} />
      <mesh geometry={BOX} material={night ? mat("#fff7d6", { emissive: "#ffe8a8", ei: 2.5 }) : mat("#e5e7eb")} position={[0, 3.93, 0.65]} scale={[0.3, 0.06, 0.3]} />
      {night && <pointLight position={[0, 3.6, 0.65]} intensity={6} distance={9} decay={1.6} color="#ffd59a" />}
    </group>
  );
}

function Hedge({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  return (
    <group>
      <mesh geometry={BOX} material={mat("#3f7d3f", { rough: 1 })} position={[x, 0.4, z]} scale={[w, 0.8, d]} castShadow receiveShadow />
      <mesh geometry={BOX} material={mat("#4c9150", { rough: 1 })} position={[x, 0.82, z]} scale={[w - 0.1, 0.06, d - 0.1]} />
    </group>
  );
}

function FlowerBed({ x, z, w }: { x: number; z: number; w: number }) {
  const colors = ["#f472b6", "#facc15", "#f97316", "#a78bfa", "#f8fafc"];
  const n = Math.floor(w / 0.35);
  return (
    <group>
      <mesh geometry={BOX} material={mat("#6b4f3a", { rough: 1 })} position={[x, 0.08, z]} scale={[w, 0.16, 0.7]} receiveShadow />
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} material={mat(colors[i % colors.length], { rough: 0.8 })} position={[x - w / 2 + 0.2 + i * 0.35, 0.28, z + ((i % 2) - 0.5) * 0.25]} scale={0.13} castShadow>
          <icosahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function Tree({ x, z, s = 1, tone = 0 }: { x: number; z: number; s?: number; tone?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh geometry={CYL} material={mat("#7c5a3a")} position={[0, 0.8, 0]} scale={[0.28, 1.6, 0.28]} castShadow />
      <mesh material={mat(tone ? P.leaf : P.leafDark, { rough: 0.9 })} position={[0, 2.3, 0]} castShadow>
        <icosahedronGeometry args={[1.15, 1]} />
      </mesh>
      <mesh material={mat(tone ? "#4f9d5d" : "#3a7d48", { rough: 0.9 })} position={[0.35, 2.9, 0.2]} castShadow>
        <icosahedronGeometry args={[0.75, 1]} />
      </mesh>
    </group>
  );
}

/** Strings of warm fairy lights across the garden (sagging between the building and the fence). */
const GardenLights = memo(function GardenLights({ night }: { night: boolean }) {
  const garden = ROOMS.find((r) => r.id === "garden");
  const ref = useRef<THREE.InstancedMesh>(null);
  const points = useMemo(() => {
    if (!garden) return [];
    const out: [number, number, number][] = [];
    const per = 11;
    for (let x = garden.x0 + 1.5; x <= garden.x1 - 1; x += 3) {
      for (let i = 0; i < per; i++) {
        const t = i / (per - 1);
        const z = garden.z0 + 0.15 + t * (garden.z1 - garden.z0 - 0.3);
        const y = 2.3 - t * 0.9 - Math.sin(t * Math.PI) * 0.45; // sag
        out.push([x + (i % 2 ? 0.05 : -0.05), y, z]);
      }
    }
    return out;
  }, [garden]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    points.forEach((p, i) => {
      o.position.set(p[0], p[1], p[2]);
      o.scale.setScalar(0.07);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [points]);
  const bulb = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#fff7d6", emissive: new THREE.Color("#ffd58a"), emissiveIntensity: night ? 3 : 0.4, roughness: 0.4 }),
    [night],
  );
  useEffect(() => () => bulb.dispose(), [bulb]);
  if (!garden || !points.length) return null;
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, points.length]} material={bulb}>
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
      {night &&
        [0.2, 0.5, 0.8].map((t, i) => (
          <pointLight key={i} position={[garden.x0 + t * (garden.x1 - garden.x0), 2, (garden.z0 + garden.z1) / 2]} intensity={5} distance={14} decay={1.6} color="#ffcf87" />
        ))}
    </group>
  );
});

/** Low, wide sports car in purple & gold (the CEO's). */
function SportsCar({ body = "#552583", trim = "#fdb927", night = false }: { body?: string; trim?: string; night?: boolean }) {
  const paint = mat(body, { rough: 0.18, metal: 0.65 });
  const gold = mat(trim, { rough: 0.3, metal: 0.7 });
  const tyre = mat("#0b0f19", { rough: 0.9 });
  const glass = mat("#0f172a", { rough: 0.05, metal: 0.6 });
  return (
    <group>
      <mesh geometry={BOX} material={paint} position={[0, 0.36, 0.1]} scale={[1.95, 0.38, 4.4]} castShadow receiveShadow />
      {/* sloped nose */}
      <mesh geometry={BOX} material={paint} position={[0, 0.5, 1.55]} rotation={[0.22, 0, 0]} scale={[1.9, 0.12, 1.5]} castShadow />
      {/* low cabin */}
      <mesh geometry={BOX} material={glass} position={[0, 0.7, -0.35]} scale={[1.45, 0.34, 1.7]} castShadow />
      <mesh geometry={BOX} material={paint} position={[0, 0.88, -0.45]} scale={[1.35, 0.05, 1.2]} />
      {/* racing stripes */}
      <mesh geometry={BOX} material={gold} position={[-0.22, 0.56, 0.6]} scale={[0.16, 0.012, 3.0]} />
      <mesh geometry={BOX} material={gold} position={[0.22, 0.56, 0.6]} scale={[0.16, 0.012, 3.0]} />
      {/* rear wing */}
      <mesh geometry={BOX} material={gold} position={[0, 0.92, -2.0]} scale={[1.8, 0.05, 0.38]} castShadow />
      <mesh geometry={BOX} material={paint} position={[-0.7, 0.72, -2.0]} scale={[0.06, 0.36, 0.2]} />
      <mesh geometry={BOX} material={paint} position={[0.7, 0.72, -2.0]} scale={[0.06, 0.36, 0.2]} />
      {[
        [-0.95, -1.4],
        [0.95, -1.4],
        [-0.95, 1.45],
        [0.95, 1.45],
      ].map(([wx, wz], i) => (
        <group key={i} position={[wx, 0.34, wz]}>
          <mesh geometry={CYL} material={tyre} rotation={[0, 0, Math.PI / 2]} scale={[0.68, 0.3, 0.68]} castShadow />
          <mesh geometry={CYL} material={gold} rotation={[0, 0, Math.PI / 2]} scale={[0.4, 0.31, 0.4]} />
        </group>
      ))}
      <mesh geometry={BOX} material={night ? mat("#fef9c3", { emissive: "#fef08a", ei: 2 }) : mat("#e5e7eb")} position={[0, 0.45, 2.31]} scale={[1.5, 0.08, 0.02]} />
      <mesh geometry={BOX} material={mat("#b91c1c", { emissive: "#ef4444", ei: night ? 1.5 : 0.3 })} position={[0, 0.5, -2.11]} scale={[1.6, 0.07, 0.02]} />
    </group>
  );
}

/** Cars driving along the road in both directions (loops forever). */
function Traffic({ z1, z2, x0, x1, night }: { z1: number; z2: number; x0: number; x1: number; night: boolean }) {
  const span = x1 - x0;
  const cars = useMemo(
    () =>
      [
        { lane: 0, speed: 7.5, off: 0, color: CAR_COLORS[0] },
        { lane: 0, speed: 6.2, off: 0.38, color: CAR_COLORS[1] },
        { lane: 0, speed: 9.5, off: 0.7, color: "sports" },
        { lane: 1, speed: 6.8, off: 0.12, color: CAR_COLORS[2] },
        { lane: 1, speed: 8.2, off: 0.5, color: CAR_COLORS[5] },
        { lane: 1, speed: 5.9, off: 0.83, color: CAR_COLORS[3] },
      ] as const,
    [],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  const t0 = useRef(0);
  useFrame((_, dt) => {
    t0.current += Math.min(dt, 0.1);
    cars.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      const p = (c.off * span + t0.current * c.speed) % span;
      g.position.x = c.lane === 0 ? x0 + p : x1 - p;
    });
  });
  return (
    <group>
      {cars.map((c, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[0, 0, c.lane === 0 ? z1 : z2]} rotation={[0, c.lane === 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          {c.color === "sports" ? <SportsCar body="#dc2626" trim="#111827" night={night} /> : <MovingCar color={c.color} night={night} />}
        </group>
      ))}
    </group>
  );
}

function MovingCar({ color, night }: { color: string; night: boolean }) {
  return (
    <group>
      <Car color={color} x={0} z={0} rot={0} />
      {night && <mesh geometry={BOX} material={mat("#fef9c3", { emissive: "#fef08a", ei: 2.5 })} position={[0, 0.5, 2.08]} scale={[1.45, 0.14, 0.03]} />}
    </group>
  );
}

const Exterior = memo(function Exterior({ night }: { night: boolean }) {
  const W = OFFICE_W;
  const D = OFFICE_D;
  const grass = useMemo(() => {
    const t = carpetTexture("#9fbf8f").clone();
    t.repeat.set(60, 48);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  const asphalt = useMemo(() => {
    const t = carpetTexture("#3f4652").clone();
    t.repeat.set(40, 4);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }, []);
  const white = mat("#f8fafc", { rough: 0.6 });
  const yellow = mat("#facc15", { rough: 0.6 });
  const gold = mat("#fdb927", { rough: 0.5, metal: 0.4 });
  const roadZ = D + 9;
  const laneA = roadZ - 1.75;
  const laneB = roadZ + 1.75;
  const lotX = W + 9.5;
  const bays = Math.floor((D - 2) / 3);
  return (
    <group>
      <mesh geometry={PLANE} material={grass} rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.12, D / 2 + 10]} scale={[260, 200, 1]} receiveShadow />
      {/* plinth */}
      <mesh geometry={BOX} material={mat("#cbd5e1")} position={[W / 2, -0.06, D / 2]} scale={[W + 0.8, 0.12, D + 0.8]} receiveShadow />
      {/* sidewalk + entrance path */}
      <mesh geometry={BOX} material={mat("#e2e8f0", { rough: 0.95 })} position={[W / 2, -0.08, D + 4.5]} scale={[W + 130, 0.08, 3]} receiveShadow />
      <mesh geometry={BOX} material={mat("#e7e5e4", { rough: 0.95 })} position={[5, -0.07, D + 1.6]} scale={[3.2, 0.1, 3.4]} receiveShadow />
      {/* road */}
      <mesh geometry={BOX} material={asphalt} position={[W / 2, -0.1, roadZ]} scale={[W + 130, 0.06, 7]} receiveShadow />
      {Array.from({ length: 48 }).map((_, i) => (
        <mesh key={i} geometry={BOX} material={white} position={[-62 + i * 4, -0.065, roadZ]} scale={[2, 0.01, 0.15]} />
      ))}
      <mesh geometry={BOX} material={mat("#94a3b8")} position={[W / 2, -0.05, D + 6.05]} scale={[W + 130, 0.1, 0.12]} />
      <Traffic z1={laneB} z2={laneA} x0={-60} x1={W + 60} night={night} />

      {/* parking lot (east) */}
      <mesh geometry={BOX} material={asphalt} position={[lotX, -0.1, D / 2 - 0.5]} scale={[13, 0.06, D]} receiveShadow />
      <mesh geometry={BOX} material={asphalt} position={[lotX, -0.1, D + 3]} scale={[5, 0.06, 6]} receiveShadow />
      {Array.from({ length: bays + 1 }).map((_, i) => (
        <group key={i}>
          <mesh geometry={BOX} material={white} position={[lotX - 3.9, -0.065, 1.2 + i * 3]} scale={[4.6, 0.01, 0.1]} />
          <mesh geometry={BOX} material={white} position={[lotX + 3.9, -0.065, 1.2 + i * 3]} scale={[4.6, 0.01, 0.1]} />
        </group>
      ))}
      <mesh geometry={BOX} material={yellow} position={[lotX, -0.065, D / 2 - 1]} scale={[0.12, 0.01, D - 6]} />
      {[
        [lotX - 3.9, 8.7, 3],
        [lotX - 3.9, 17.7, 1],
        [lotX + 3.9, 5.7, 2],
        [lotX + 3.9, 11.7, 4],
        [lotX + 3.9, 20.7, 5],
        [lotX - 3.9, 26.7, 2],
      ].map(([x, z, c], i) => (
        <Car key={i} x={x} z={z} rot={x < lotX ? Math.PI / 2 : -Math.PI / 2} color={CAR_COLORS[c]} />
      ))}

      {/* reserved CEO bay (gold) at the corner of the car park, right outside the CEO suite */}
      <mesh geometry={BOX} material={mat("#2b2f38", { rough: 0.9 })} position={[lotX - 3.9, -0.085, 2.7]} scale={[4.6, 0.04, 2.9]} receiveShadow />
      <mesh geometry={BOX} material={gold} position={[lotX - 3.9, -0.06, 1.25]} scale={[4.7, 0.01, 0.12]} />
      <mesh geometry={BOX} material={gold} position={[lotX - 3.9, -0.06, 4.15]} scale={[4.7, 0.01, 0.12]} />
      <mesh geometry={BOX} material={gold} position={[lotX - 6.2, -0.06, 2.7]} scale={[0.12, 0.01, 2.95]} />
      <group position={[lotX - 3.7, 0, 2.7]} rotation={[0, Math.PI / 2, 0]}>
        <SportsCar night={night} />
      </group>
      <group position={[lotX - 6.35, 0, 2.7]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={CYL} material={mat("#334155", { metal: 0.6 })} position={[0, 0.6, 0]} scale={[0.08, 1.2, 0.08]} />
        <mesh geometry={BOX} material={mat("#552583")} position={[0, 1.35, 0]} scale={[1.1, 0.5, 0.06]} />
        <Html center transform position={[0, 1.35, 0.04]} scale={0.25} occlude={false} style={{ pointerEvents: "none" }}>
          <div className="select-none font-extrabold tracking-[0.3em] text-[#fdb927]">CEO</div>
        </Html>
      </group>

      {/* lamp posts */}
      {[-14, -2, 10, 22, 34, 46, 58, 70].map((x, i) => (
        <LampPost key={i} x={x} z={D + 6.3} night={night} />
      ))}
      {/* hedges + flower beds along the garden fence (gap at the gate) */}
      <Hedge x={1.6} z={D + 0.75} w={2.6} d={0.7} />
      <Hedge x={(6.6 + W) / 2} z={D + 0.75} w={W - 6.6} d={0.7} />
      <Hedge x={-1.0} z={D / 2} w={0.7} d={D - 2} />
      <Hedge x={W + 1.2} z={D / 2} w={0.7} d={D - 2} />
      <FlowerBed x={18} z={D + 1.75} w={10} />
      <FlowerBed x={42} z={D + 1.75} w={10} />
      {/* trees */}
      <Tree x={-6} z={3} s={1.1} />
      <Tree x={-12} z={12} tone={1} />
      <Tree x={-11} z={22} s={1.15} />
      <Tree x={-11} z={31} s={0.9} tone={1} />
      <Tree x={10} z={D + 2.6} s={0.9} />
      <Tree x={28} z={D + 2.6} tone={1} />
      <Tree x={52} z={D + 2.6} s={1.1} />
      <Tree x={W / 2} z={-4} s={1.2} />
      <Tree x={12} z={-4.5} tone={1} />
      <Tree x={46} z={-4.2} s={1.1} />
      <Tree x={W + 18} z={6} tone={1} />
      <Tree x={W + 18} z={22} />
      {/* signage by the gate */}
      <group position={[9, 0, D + 1.4]}>
        <mesh geometry={BOX} material={mat(P.navy)} position={[0, 0.35, 0]} scale={[3.2, 0.7, 0.25]} castShadow />
        <Html center transform position={[0, 0.36, 0.13]} scale={0.32} occlude={false} style={{ pointerEvents: "none" }}>
          <div className="select-none font-semibold tracking-[0.25em] text-white">OFFICEVERSE</div>
        </Html>
      </group>
    </group>
  );
});

export function RoomLabels({ labels, onFocus }: { labels: { room: Room; text: string; color?: string }[]; onFocus: (r: Room) => void }) {
  return (
    <>
      {labels.map(({ room, text, color }) => (
        <Html
          key={room.id}
          position={[room.id === "corridor" ? 14 : (room.x0 + room.x1) / 2, 0.05, room.id === "corridor" ? (room.z0 + room.z1) / 2 : room.z1 - 0.75]}
          center
          zIndexRange={[10, 0]}
        >
          <button
            onClick={() => onFocus(room)}
            className="pointer-events-auto whitespace-nowrap rounded-md border border-panel/60 bg-panel/85 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-panel"
          >
            {color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />}
            {text}
          </button>
        </Html>
      ))}
    </>
  );
}

export const Building = memo(function Building({
  walls,
  wallColor,
  accent,
  wood,
  night,
  brands,
}: {
  walls: WallMode;
  wallColor: string;
  accent: string;
  wood: string;
  night: boolean;
  brands: Record<string, Brand | undefined>;
}) {
  return (
    <group>
      <Exterior night={night} />
      {ROOMS.map((r) => (
        <RoomFloor key={r.id} room={r} wood={wood} brand={brands[r.id]} />
      ))}
      {ROOMS.map((r) => {
        const b = brands[r.id];
        return b ? <BrandBorder key={`b-${r.id}`} room={r} color={b.color} /> : null;
      })}
      {DOORS.map((d) => {
        const room = ROOMS.find((r) => r.id !== "corridor" && Math.abs(d.x - (r.x0 + r.x1) / 2) <= (r.x1 - r.x0) / 2 && (Math.abs(d.z - r.z0) < 0.01 || Math.abs(d.z - r.z1) < 0.01) && d.id !== "door-entrance");
        const b = room ? brands[room.id] : undefined;
        return room && b ? <EntranceMat key={`m-${d.id}`} door={d} room={room} brand={b} /> : null;
      })}
      <Walls mode={walls} wallColor={wallColor} accent={accent} night={night} />
      <GardenLights night={night} />
      {DOORS.filter((d) => !d.open).map((d) => (
        <SlidingDoor key={d.id} {...d} mode={walls} />
      ))}
    </group>
  );
});
