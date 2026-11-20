"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { FurnitureItem } from "@/lib/data/types";
import { CATALOG, sizeOf } from "@/lib/office/catalog";
import { PALETTE as P, mat, makeScreenTexture } from "./materials";
import { FunVisual } from "./FunFurniture";

// ---------- primitive helpers (shared unit geometries, scaled) ----------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
const SPH = new THREE.IcosahedronGeometry(0.5, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);

type V3 = [number, number, number];

export function B({ p, s, c, m, r, shadow = true }: { p: V3; s: V3; c?: string; m?: THREE.Material; r?: V3; shadow?: boolean }) {
  return <mesh geometry={BOX} position={p} scale={s} rotation={r} material={m ?? mat(c ?? "#fff")} castShadow={shadow} receiveShadow />;
}
export function C({ p, s, c, m, shadow = true }: { p: V3; s: V3; c?: string; m?: THREE.Material; shadow?: boolean }) {
  return <mesh geometry={CYL} position={p} scale={s} material={m ?? mat(c ?? "#fff")} castShadow={shadow} receiveShadow />;
}
function S({ p, s, c, m }: { p: V3; s: V3; c?: string; m?: THREE.Material }) {
  return <mesh geometry={SPH} position={p} scale={s} material={m ?? mat(c ?? "#fff", { rough: 0.9 })} castShadow />;
}
function Screen({ p, s, tex, r }: { p: V3; s: [number, number]; tex?: THREE.Texture | null; r?: V3 }) {
  const m = useMemo(
    () =>
      tex
        ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
        : new THREE.MeshStandardMaterial({ color: "#0f1b2d", emissive: new THREE.Color("#4f8ff7"), emissiveIntensity: 0.6, roughness: 0.3 }),
    [tex],
  );
  return <mesh geometry={PLANE} position={p} scale={[s[0], s[1], 1]} rotation={r} material={m} />;
}

// ---------- seating ----------
export function OfficeChair({ color = P.navy, exec = false }: { color?: string; exec?: boolean }) {
  const back = exec ? 0.8 : 0.5;
  return (
    <group>
      <C p={[0, 0.03, 0]} s={[0.55, 0.05, 0.55]} c={P.darkGrey} />
      <C p={[0, 0.24, 0]} s={[0.05, 0.4, 0.05]} c={P.metal} m={mat(P.metal, { metal: 0.6, rough: 0.3 })} />
      <B p={[0, 0.45, 0]} s={[0.5, 0.08, 0.48]} c={color} />
      <B p={[0, 0.5 + back / 2, -0.24]} s={[0.48, back, 0.07]} c={color} r={[-0.08, 0, 0]} />
      {exec && <B p={[0, 1.32, -0.28]} s={[0.36, 0.16, 0.08]} c={color} />}
      <B p={[-0.27, 0.6, 0]} s={[0.04, 0.04, 0.36]} c={P.darkGrey} />
      <B p={[0.27, 0.6, 0]} s={[0.04, 0.04, 0.36]} c={P.darkGrey} />
    </group>
  );
}

function SimpleChair({ color = P.navy }: { color?: string }) {
  return (
    <group>
      {[-0.2, 0.2].flatMap((x) => [-0.2, 0.2].map((z) => <B key={`${x}${z}`} p={[x, 0.22, z]} s={[0.04, 0.44, 0.04]} c={P.darkGrey} />))}
      <B p={[0, 0.46, 0]} s={[0.48, 0.07, 0.46]} c={color} />
      <B p={[0, 0.75, -0.21]} s={[0.46, 0.5, 0.06]} c={color} />
    </group>
  );
}

// ---------- individual furniture ----------
function Desk({ w = 1.4, d = 0.7, top = P.white, legs = P.navy }: { w?: number; d?: number; top?: string; legs?: string }) {
  return (
    <group>
      <B p={[0, 0.74, 0]} s={[w, 0.04, d]} c={top} m={mat(top, { rough: 0.45 })} />
      <B p={[-w / 2 + 0.03, 0.36, 0]} s={[0.04, 0.72, d - 0.06]} c={legs} />
      <B p={[w / 2 - 0.03, 0.36, 0]} s={[0.04, 0.72, d - 0.06]} c={legs} />
      <B p={[0, 0.5, d / 2 - 0.04]} s={[w - 0.1, 0.36, 0.02]} c={legs} />
    </group>
  );
}

function Monitor({ z = 0.16, x = 0, on = true }: { z?: number; x?: number; on?: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <B p={[0, 0.77, 0.02]} s={[0.2, 0.02, 0.14]} c={P.darkGrey} />
      <B p={[0, 0.88, 0.04]} s={[0.04, 0.2, 0.03]} c={P.darkGrey} />
      <B p={[0, 1.02, 0]} s={[0.62, 0.38, 0.03]} c="#111827" />
      {on && <Screen p={[0, 1.02, -0.017]} s={[0.58, 0.34]} r={[0, Math.PI, 0]} />}
    </group>
  );
}

function Workstation({ item }: { item: FurnitureItem }) {
  const accent = item.roomId === "marketing" ? "#e11d48" : item.roomId === "artides" ? P.woodDark : item.roomId === "it" ? "#16a34a" : P.navy;
  return (
    <group>
      <Desk legs={accent} />
      <Monitor />
      <B p={[0, 0.765, -0.12]} s={[0.42, 0.015, 0.13]} c="#1f2937" />
      <B p={[0.32, 0.765, -0.12]} s={[0.06, 0.015, 0.09]} c="#1f2937" />
      <C p={[-0.5, 0.81, 0.05]} s={[0.07, 0.1, 0.07]} c="#f8fafc" />
      <group position={[0, 0, -0.62]}>
        <OfficeChair color={accent} />
      </group>
    </group>
  );
}

/** CEO "mission-control" desk: curved walnut front, brass trim, 3 screens. */
/**
 * CEO desk: a big rectangular walnut executive desk (2.4 m × 1.1 m, 76 cm high) with a brass edge,
 * two drawer pedestals, a full-width front panel, one curved ultrawide monitor and desk accessories.
 * The CEO sits on the -z side, facing the visitors on the +z side.
 */
function ExecDesk({ frames, screen }: { frames: (THREE.Texture | null)[]; screen: THREE.Texture | null }) {
  const walnut = mat("#5b3a22", { rough: 0.35 });
  const walnutDark = mat("#432a18", { rough: 0.45 });
  const brass = mat("#d4a017", { metal: 0.85, rough: 0.25 });
  const W = 2.4;
  const D = 1.1;
  const Z = 0.1; // desk centre (chair side at Z - D/2)
  const N = 9;
  // one dashboard image spread over the curved panels: panel i shows slice i (as the CEO sees it, left → right)
  const slices = useMemo(
    () =>
      screen
        ? Array.from({ length: N }, (_, i) => {
            const t = screen.clone();
            t.repeat.set(1 / N, 1);
            t.offset.set((N - 1 - i) / N, 0);
            t.needsUpdate = true;
            return t;
          })
        : null,
    [screen],
  );
  useEffect(() => () => slices?.forEach((t) => t.dispose()), [slices]);
  return (
    <group>
      {/* top + brass edge */}
      <B p={[0, 0.74, Z]} s={[W, 0.06, D]} m={walnut} />
      <B p={[0, 0.715, Z + D / 2 + 0.006]} s={[W + 0.012, 0.012, 0.012]} m={brass} />
      <B p={[0, 0.715, Z - D / 2 - 0.006]} s={[W + 0.012, 0.012, 0.012]} m={brass} />
      <B p={[W / 2 + 0.006, 0.715, Z]} s={[0.012, 0.012, D + 0.024]} m={brass} />
      <B p={[-W / 2 - 0.006, 0.715, Z]} s={[0.012, 0.012, D + 0.024]} m={brass} />
      {/* leather writing pad */}
      <B p={[0, 0.775, Z - 0.12]} s={[0.9, 0.008, 0.5]} c="#1f2937" />
      {/* two drawer pedestals */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (W / 2 - 0.3), 0, Z]}>
          <B p={[0, 0.36, 0]} s={[0.56, 0.72, D - 0.08]} m={walnutDark} />
          {[0.58, 0.38, 0.16].map((y) => (
            <group key={y}>
              <B p={[0, y, -(D - 0.08) / 2 - 0.006]} s={[0.5, y === 0.16 ? 0.24 : 0.16, 0.012]} m={walnut} />
              <B p={[0, y, -(D - 0.08) / 2 - 0.02]} s={[0.14, 0.018, 0.018]} m={brass} />
            </group>
          ))}
        </group>
      ))}
      {/* full-width front (modesty) panel facing visitors, with a brass inlay line */}
      <B p={[0, 0.42, Z + D / 2 - 0.05]} s={[W - 0.08, 0.6, 0.04]} m={walnutDark} />
      <B p={[0, 0.52, Z + D / 2 - 0.028]} s={[W - 0.3, 0.014, 0.006]} m={brass} />
      <B p={[0, 0.04, Z + D / 2 - 0.05]} s={[W - 0.06, 0.04, 0.05]} m={brass} />

      {/* one big curved ultrawide monitor on a single stand, facing the CEO */}
      <group position={[0, 0, Z + 0.25]}>
        <B p={[0, 0.79, 0.08]} s={[0.4, 0.03, 0.24]} c="#111827" />
        <B p={[0, 0.98, 0.06]} s={[0.07, 0.36, 0.05]} c="#1f2937" />
        {Array.from({ length: 9 }).map((_, i) => {
          // panels on an arc (radius 1.6 m) form one continuous curved screen
          const R = 1.6;
          const a = ((i - 4) * 0.165) / R;
          return (
            <group key={i} position={[R * Math.sin(a), 0, -R + R * Math.cos(a)]} rotation={[0, a, 0]}>
              <B p={[0, 1.2, 0]} s={[0.17, 0.46, 0.035]} c="#111827" />
              <mesh position={[0, 1.2, -0.019]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[0.17, 0.42]} />
                {slices ? (
                  <meshBasicMaterial map={slices[i]} toneMapped={false} />
                ) : (
                  <meshStandardMaterial color="#0b1220" emissive={new THREE.Color("#1e3a5f")} emissiveIntensity={0.55} />
                )}
              </mesh>
            </group>
          );
        })}
      </group>
      {/* keyboard, phone, pen holder */}
      <B p={[0, 0.785, Z - 0.2]} s={[0.46, 0.015, 0.14]} c="#1f2937" />
      <B p={[0.7, 0.79, Z - 0.15]} s={[0.18, 0.04, 0.2]} c="#111827" />
      <C p={[-0.62, 0.83, Z + 0.15]} s={[0.07, 0.12, 0.07]} c="#d4a017" />
      {/* desk lamp */}
      <group position={[0.98, 0.77, Z + 0.3]}>
        <C p={[0, 0.01, 0]} s={[0.16, 0.02, 0.16]} c="#d4a017" />
        <B p={[0, 0.2, 0]} s={[0.02, 0.38, 0.02]} c="#d4a017" />
        <C p={[0, 0.4, -0.06]} s={[0.16, 0.08, 0.16]} c="#14532d" />
      </group>
      {/* small photo frames, facing the CEO */}
      {[-1.0, -0.78].map((x, i) => (
        <group key={x} position={[x, 0.77, Z + 0.3]} rotation={[-0.15, Math.PI + (i ? -0.3 : 0.2), 0]}>
          <B p={[0, 0.09, 0]} s={[0.16, 0.2, 0.02]} c="#78350f" />
          <Screen p={[0, 0.09, 0.011]} s={[0.12, 0.15]} tex={frames[i] ?? null} />
        </group>
      ))}
      <group position={[0, 0, -0.85]}>
        <OfficeChair color="#111827" exec />
      </group>
    </group>
  );
}

function MeetingTable() {
  const seats = CATALOG.meeting_table.seats;
  return (
    <group>
      <B p={[0, 0.74, 0]} s={[5.2, 0.06, 1.6]} c={P.woodDark} m={mat(P.woodDark, { rough: 0.3 })} />
      <B p={[-1.6, 0.36, 0]} s={[0.25, 0.72, 0.9]} c={P.navyDark} />
      <B p={[1.6, 0.36, 0]} s={[0.25, 0.72, 0.9]} c={P.navyDark} />
      <C p={[0, 0.8, 0]} s={[0.3, 0.05, 0.3]} c="#111827" />
      {seats.map((s, i) => (
        <group key={i} position={[s.lx, 0, s.lz]} rotation={[0, s.f, 0]}>
          <OfficeChair color={i === 9 ? "#111827" : P.navy} exec={i === 9} />
        </group>
      ))}
    </group>
  );
}

function Sofa({ w = 2.0, color = P.navy }: { w?: number; color?: string }) {
  return (
    <group>
      <B p={[0, 0.22, 0]} s={[w, 0.3, 0.85]} c={color} />
      <B p={[0, 0.42, 0.04]} s={[w - 0.25, 0.12, 0.7]} c={color} m={mat(color, { rough: 0.95 })} />
      <B p={[0, 0.62, -0.34]} s={[w, 0.6, 0.2]} c={color} />
      <B p={[-w / 2 + 0.08, 0.45, 0]} s={[0.16, 0.36, 0.85]} c={color} />
      <B p={[w / 2 - 0.08, 0.45, 0]} s={[0.16, 0.36, 0.85]} c={color} />
      {[-w / 2 + 0.2, w / 2 - 0.2].map((x) => (
        <B key={x} p={[x, 0.04, 0]} s={[0.06, 0.08, 0.7]} c={P.woodDark} />
      ))}
      {w > 1.2 && <B p={[w / 2 - 0.45, 0.62, -0.18]} s={[0.35, 0.3, 0.12]} c="#f5deb3" r={[-0.2, 0.2, 0]} />}
    </group>
  );
}

function Plant({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <C p={[0, 0.25, 0]} s={[0.4, 0.5, 0.4]} c={P.pot} />
      <C p={[0, 0.51, 0]} s={[0.36, 0.02, 0.36]} c="#57361f" />
      <C p={[0, 0.75, 0]} s={[0.04, 0.5, 0.04]} c="#57361f" />
      <S p={[0, 1.05, 0]} s={[0.55, 0.55, 0.55]} c={P.leaf} />
      <S p={[0.15, 1.3, 0.05]} s={[0.4, 0.4, 0.4]} c={P.leafDark} />
      <S p={[-0.15, 0.9, -0.1]} s={[0.38, 0.38, 0.38]} c={P.leafDark} />
    </group>
  );
}

const BOOK_COLORS = ["#1e3a5f", "#b91c1c", "#0f766e", "#f59e0b", "#6d28d9", "#334155", "#e2e8f0", "#0ea5e9"];
function Bookshelf({ w = 1.6 }: { w?: number }) {
  const books = useMemo(() => {
    const out: { x: number; y: number; h: number; c: string; w: number }[] = [];
    for (let shelf = 0; shelf < 4; shelf++) {
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.15) {
        const bw = 0.04 + ((x * 97 + shelf * 13) % 1 + 1) % 1 * 0.04;
        const h = 0.22 + (((x * 31 + shelf) % 1 + 1) % 1) * 0.1;
        if (((x * 7 + shelf * 3) % 1 + 1) % 1 > 0.15)
          out.push({ x: x + bw / 2, y: 0.12 + shelf * 0.42 + h / 2, h, c: BOOK_COLORS[Math.abs(Math.round(x * 50 + shelf)) % BOOK_COLORS.length], w: bw });
        x += bw + 0.008;
      }
    }
    return out;
  }, [w]);
  return (
    <group>
      <B p={[0, 0.9, -0.17]} s={[w, 1.8, 0.04]} c={P.white} />
      <B p={[-w / 2, 0.9, 0]} s={[0.04, 1.8, 0.38]} c={P.white} />
      <B p={[w / 2, 0.9, 0]} s={[0.04, 1.8, 0.38]} c={P.white} />
      {[0.1, 0.52, 0.94, 1.36, 1.78].map((y) => (
        <B key={y} p={[0, y, 0]} s={[w, 0.03, 0.38]} c={P.woodLight} />
      ))}
      {books.map((b, i) => (
        <B key={i} p={[b.x, b.y, 0.02]} s={[b.w, b.h, 0.26]} c={b.c} shadow={false} />
      ))}
    </group>
  );
}

function TrophyCabinet() {
  const gold = mat("#d4a017", { metal: 0.9, rough: 0.25 });
  const silver = mat("#d1d5db", { metal: 0.9, rough: 0.2 });
  return (
    <group>
      <B p={[0, 0.8, 0]} s={[2.4, 1.6, 0.5]} c={P.woodDark} />
      <B p={[0, 1.0, 0.23]} s={[2.2, 1.1, 0.04]} m={mat(P.glass, { opacity: 0.25, rough: 0.05 })} shadow={false} />
      <B p={[0, 0.45, 0.24]} s={[2.3, 0.02, 0.02]} c="#d4a017" />
      {[-0.8, -0.3, 0.3, 0.8].map((x, i) => (
        <group key={x} position={[x, 0.5, 0.05]}>
          <C p={[0, 0.05, 0]} s={[0.14, 0.1, 0.14]} c="#111827" />
          <C p={[0, 0.2, 0]} s={[0.04, 0.2, 0.04]} m={i % 2 ? silver : gold} />
          <mesh position={[0, 0.38, 0]} scale={[0.18, 0.2, 0.18]} material={i % 2 ? silver : gold} castShadow>
            <cylinderGeometry args={[0.6, 0.3, 1, 16]} />
          </mesh>
        </group>
      ))}
      {[-0.6, 0, 0.6].map((x) => (
        <group key={x} position={[x, 1.05, 0.05]}>
          <B p={[0, 0.12, 0]} s={[0.3, 0.24, 0.04]} m={x === 0 ? gold : silver} />
          <B p={[0, 0, 0]} s={[0.14, 0.04, 0.1]} c="#111827" />
        </group>
      ))}
    </group>
  );
}

function PerfScreen({ tex }: { tex: THREE.Texture | null }) {
  return (
    <group>
      <B p={[0, 0.3, 0]} s={[3.0, 0.6, 0.5]} c={P.navyDark} />
      <B p={[0, 0.61, 0]} s={[3.02, 0.03, 0.52]} c={P.woodDark} />
      <B p={[0, 0.85, -0.1]} s={[0.1, 0.5, 0.06]} c={P.darkGrey} />
      <B p={[0, 1.55, -0.1]} s={[2.7, 1.55, 0.06]} c="#0b0f19" />
      <Screen p={[0, 1.55, -0.066]} s={[2.6, 1.46]} tex={tex} />
    </group>
  );
}

function ReceptionDesk() {
  return (
    <group>
      <B p={[0, 0.55, 0.22]} s={[3.2, 1.1, 0.24]} c={P.white} m={mat(P.white, { rough: 0.3 })} />
      <B p={[0, 1.11, 0.22]} s={[3.25, 0.04, 0.3]} c={P.woodDark} />
      <B p={[0, 0.6, 0.345]} s={[3.2, 0.12, 0.01]} c={P.navy} m={mat(P.navy, { emissive: "#3b82f6", ei: 0.2 })} />
      <B p={[0, 0.74, -0.1]} s={[3.0, 0.04, 0.5]} c={P.woodLight} />
      <B p={[-1.55, 0.37, -0.1]} s={[0.06, 0.74, 0.5]} c={P.white} />
      <B p={[1.55, 0.37, -0.1]} s={[0.06, 0.74, 0.5]} c={P.white} />
      <Monitor z={0.0} x={0.3} />
      <group position={[0, 0, -0.62]}>
        <OfficeChair />
      </group>
      <Plant scale={0.35} />
    </group>
  );
}

function ServerRack() {
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const led2 = useRef<THREE.MeshStandardMaterial>(null);
  const phase = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (led.current) led.current.emissiveIntensity = Math.sin(t * 6) > 0 ? 2.2 : 0.3;
    if (led2.current) led2.current.emissiveIntensity = Math.sin(t * 2.3 + 1) > 0.2 ? 2 : 0.2;
  });
  return (
    <group>
      <B p={[0, 1.0, 0]} s={[0.68, 2.0, 0.98]} c="#111827" m={mat("#111827", { rough: 0.4, metal: 0.4 })} />
      {Array.from({ length: 8 }).map((_, i) => (
        <group key={i} position={[0, 0.25 + i * 0.22, 0.495]}>
          <B p={[0, 0, 0]} s={[0.6, 0.16, 0.01]} c="#1f2937" shadow={false} />
          <mesh position={[0.22, 0, 0.008]} scale={[0.03, 0.03, 0.01]} geometry={BOX}>
            <meshStandardMaterial ref={i % 2 ? led : led2} color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
          </mesh>
          <mesh position={[0.17, 0, 0.008]} scale={[0.03, 0.03, 0.01]} geometry={BOX}>
            <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={i % 3 ? 1.2 : 0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Whiteboard() {
  return (
    <group>
      <B p={[-0.8, 0.8, 0]} s={[0.04, 1.6, 0.04]} c={P.metal} />
      <B p={[0.8, 0.8, 0]} s={[0.04, 1.6, 0.04]} c={P.metal} />
      <B p={[-0.8, 0.02, 0]} s={[0.06, 0.04, 0.35]} c={P.metal} />
      <B p={[0.8, 0.02, 0]} s={[0.06, 0.04, 0.35]} c={P.metal} />
      <B p={[0, 1.3, 0]} s={[1.75, 1.0, 0.03]} c="#ffffff" m={mat("#ffffff", { rough: 0.2 })} />
      <B p={[-0.3, 1.5, 0.02]} s={[0.8, 0.03, 0.005]} c="#1e3a5f" shadow={false} />
      <B p={[-0.2, 1.35, 0.02]} s={[1.0, 0.025, 0.005]} c="#ef4444" shadow={false} />
      <B p={[-0.35, 1.2, 0.02]} s={[0.7, 0.025, 0.005]} c="#10b981" shadow={false} />
      <B p={[0.45, 1.15, 0.02]} s={[0.4, 0.3, 0.005]} c="#fde68a" shadow={false} />
    </group>
  );
}

function KitchenCounter({ w, color }: { w: number; color?: string }) {
  return (
    <group>
      <B p={[0, 0.45, 0]} s={[w, 0.9, 0.62]} c={color ?? P.white} />
      <B p={[0, 0.92, 0]} s={[w + 0.04, 0.04, 0.66]} c="#e5e7eb" m={mat("#e5e7eb", { rough: 0.2 })} />
      {Array.from({ length: Math.round(w / 0.6) }).map((_, i, arr) => (
        <B key={i} p={[-w / 2 + (i + 0.5) * (w / arr.length), 0.45, 0.315]} s={[w / arr.length - 0.03, 0.8, 0.01]} c={color ?? P.grey} shadow={false} />
      ))}
      {!color && (
        <>
          <B p={[-0.5, 1.12, -0.05]} s={[0.32, 0.36, 0.3]} c="#111827" />
          <C p={[-0.5, 1.0, 0.08]} s={[0.08, 0.08, 0.08]} c="#fff" />
          <B p={[0.6, 0.95, 0]} s={[0.5, 0.02, 0.4]} c="#94a3b8" m={mat("#94a3b8", { metal: 0.8, rough: 0.2 })} />
          <C p={[0.0, 1.0, -0.1]} s={[0.12, 0.16, 0.12]} c="#b91c1c" />
        </>
      )}
      {color && (
        <>
          <B p={[-0.8, 1.25, -0.1]} s={[0.5, 0.6, 0.35]} c={P.woodLight} />
          <B p={[0.5, 1.15, -0.1]} s={[0.9, 0.4, 0.35]} c={P.white} />
        </>
      )}
    </group>
  );
}

function WaterCooler() {
  return (
    <group>
      <B p={[0, 0.5, 0]} s={[0.36, 1.0, 0.36]} c={P.white} />
      <C p={[0, 1.22, 0]} s={[0.3, 0.42, 0.3]} m={mat("#7dd3fc", { opacity: 0.6, rough: 0.1 })} />
      <B p={[0, 0.75, 0.185]} s={[0.12, 0.08, 0.02]} c="#3b82f6" />
    </group>
  );
}

function CoffeeTable({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.4, 0]} s={[w, 0.04, d]} c={P.woodDark} m={mat(P.woodDark, { rough: 0.3 })} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[sx * (w / 2 - 0.06), 0.19, sz * (d / 2 - 0.06)]} s={[0.04, 0.38, 0.04]} c="#111827" />))}
      <B p={[0.15, 0.44, 0]} s={[0.25, 0.04, 0.18]} c="#e11d48" />
    </group>
  );
}

function RoundTable() {
  const seats = CATALOG.round_table.seats;
  return (
    <group>
      <C p={[0, 0.74, 0]} s={[1.0, 0.04, 1.0]} c={P.white} m={mat(P.white, { rough: 0.3 })} />
      <C p={[0, 0.37, 0]} s={[0.08, 0.72, 0.08]} c={P.darkGrey} />
      <C p={[0, 0.02, 0]} s={[0.5, 0.04, 0.5]} c={P.darkGrey} />
      {seats.map((s, i) => (
        <group key={i} position={[s.lx, 0, s.lz]} rotation={[0, s.f, 0]}>
          <SimpleChair color={P.woodLight} />
        </group>
      ))}
    </group>
  );
}

function PackingTable() {
  return (
    <group>
      <Desk w={1.8} d={0.9} top={P.woodLight} legs={P.darkGrey} />
      <B p={[-0.5, 0.88, 0.1]} s={[0.4, 0.24, 0.3]} c="#c8a26a" />
      <B p={[-0.5, 1.1, 0.1]} s={[0.3, 0.2, 0.25]} c="#d6b27a" />
      <B p={[0.1, 0.84, -0.1]} s={[0.35, 0.16, 0.25]} c="#c8a26a" />
      <C p={[0.6, 0.8, 0.2]} s={[0.12, 0.06, 0.12]} c="#a16207" />
      <B p={[0.55, 0.77, -0.2]} s={[0.3, 0.02, 0.22]} c="#ffffff" />
    </group>
  );
}

function ProductShelf() {
  return (
    <group>
      <B p={[0, 0.8, -0.2]} s={[1.8, 1.6, 0.04]} c={P.white} />
      {[0.05, 0.55, 1.05, 1.55].map((y) => (
        <B key={y} p={[0, y, 0]} s={[1.8, 0.03, 0.44]} c={P.white} />
      ))}
      {[0.1, 0.6, 1.1].flatMap((y, row) =>
        [-0.65, -0.3, 0.05, 0.4, 0.7].map((x, i) =>
          row === 0 ? (
            <C key={`${y}${x}`} p={[x, y + 0.2, 0]} s={[0.14, 0.38, 0.14]} c={i % 2 ? "#0ea5e9" : "#e0f2fe"} />
          ) : (
            <B key={`${y}${x}`} p={[x, y + 0.14, 0]} s={[0.22, 0.26, 0.2]} c={row === 1 ? "#ffffff" : "#38bdf8"} />
          ),
        ),
      )}
    </group>
  );
}

function PhotoSet() {
  return (
    <group>
      <B p={[0, 1.2, -0.7]} s={[2.6, 2.4, 0.05]} c="#f1f5f9" />
      <B p={[0, 0.02, -0.25]} s={[2.6, 0.03, 0.9]} c="#f1f5f9" />
      {[-1.05, 1.05].map((x) => (
        <group key={x} position={[x, 0, 0.3]}>
          <C p={[0, 0.8, 0]} s={[0.03, 1.6, 0.03]} c="#111827" />
          <B p={[0, 1.65, 0]} s={[0.45, 0.45, 0.2]} c="#f8fafc" m={mat("#ffffff", { emissive: "#ffffff", ei: 0.5 })} />
        </group>
      ))}
      <group position={[0, 0, 0.6]}>
        <C p={[0, 0.65, 0]} s={[0.03, 1.3, 0.03]} c="#111827" />
        <B p={[0, 1.35, 0]} s={[0.22, 0.14, 0.12]} c="#111827" />
        <C p={[0, 1.35, -0.1]} s={[0.08, 0.1, 0.08]} c="#1f2937" />
      </group>
      <C p={[0, 0.25, -0.3]} s={[0.25, 0.5, 0.25]} c="#0ea5e9" />
    </group>
  );
}

function PhotoFrames({ frames }: { frames: (THREE.Texture | null)[] }) {
  return (
    <group>
      <B p={[0, 0.45, 0]} s={[1.2, 0.9, 0.34]} c={P.woodDark} />
      {[-0.4, 0, 0.4].map((x, i) => (
        <group key={x} position={[x, 0.92, 0]} rotation={[-0.1, 0, 0]}>
          <B p={[0, 0.17, -0.03]} s={[0.3, 0.36, 0.03]} c={i === 1 ? "#d4a017" : "#111827"} />
          <Screen p={[0, 0.17, -0.013]} s={[0.24, 0.3]} tex={frames[i] ?? null} />
        </group>
      ))}
    </group>
  );
}

function TvScreen({ tex }: { tex: THREE.Texture | null }) {
  return (
    <group>
      <B p={[0, 0.25, 0]} s={[1.6, 0.5, 0.3]} c={P.navyDark} />
      <B p={[0, 1.35, -0.05]} s={[2.0, 1.15, 0.05]} c="#0b0f19" />
      <Screen p={[0, 1.35, -0.023]} s={[1.92, 1.08]} tex={tex} />
    </group>
  );
}

function FilingCabinet({ color }: { color?: string }) {
  const c = color ?? P.grey;
  return (
    <group>
      <B p={[0, 0.5, 0]} s={[0.58, 1.0, 0.5]} c={c} />
      {[0.25, 0.5, 0.75].map((y) => (
        <B key={y} p={[0, y, 0.252]} s={[0.5, 0.01, 0.01]} c={P.darkGrey} shadow={false} />
      ))}
      <Plant scale={0.3} />
    </group>
  );
}

function Rug({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <B p={[0, 0.006, 0]} s={[w, 0.012, d]} c="#cbd5e1" shadow={false} m={mat("#c7d2e0", { rough: 1 })} />
      <B p={[0, 0.008, 0]} s={[w - 0.3, 0.012, d - 0.3]} shadow={false} m={mat("#1e3a5f", { rough: 1 })} />
    </group>
  );
}

function FloorLamp({ night }: { night?: boolean }) {
  return (
    <group>
      <C p={[0, 0.03, 0]} s={[0.32, 0.06, 0.32]} c={P.darkGrey} />
      <C p={[0, 0.8, 0]} s={[0.035, 1.55, 0.035]} c={P.darkGrey} />
      <mesh position={[0, 1.6, 0]} scale={[0.38, 0.32, 0.38]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 1, 20, 1, true]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={night ? 1.6 : 0.15} side={THREE.DoubleSide} toneMapped={!night} />
      </mesh>
      {night && <pointLight position={[0, 1.4, 0]} intensity={2.2} distance={4} decay={1.5} color="#ffd59a" />}
    </group>
  );
}

function PendantLight({ night }: { night?: boolean }) {
  return (
    <group>
      <C p={[0, 2.35, 0]} s={[0.01, 0.7, 0.01]} c="#111827" shadow={false} />
      <mesh position={[0, 1.95, 0]} scale={[0.36, 0.22, 0.36]}>
        <cylinderGeometry args={[0.25, 0.5, 1, 20, 1, true]} />
        <meshStandardMaterial color="#111827" metalness={0.5} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.86, 0]} scale={0.1}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#fff7d6" emissive="#ffe8a8" emissiveIntensity={night ? 3 : 0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Fridge() {
  return (
    <group>
      <B p={[0, 0.9, 0]} s={[0.68, 1.8, 0.66]} c="#e5e7eb" m={mat("#e5e7eb", { metal: 0.5, rough: 0.25 })} />
      <B p={[0, 1.22, 0.335]} s={[0.66, 0.01, 0.01]} c={P.darkGrey} shadow={false} />
      <B p={[0.26, 1.45, 0.345]} s={[0.03, 0.3, 0.03]} c={P.darkGrey} />
      <B p={[0.26, 0.85, 0.345]} s={[0.03, 0.4, 0.03]} c={P.darkGrey} />
      <B p={[-0.15, 1.5, 0.336]} s={[0.12, 0.12, 0.005]} c="#facc15" shadow={false} />
    </group>
  );
}

function VendingMachine({ night }: { night?: boolean }) {
  const colors = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7"];
  return (
    <group>
      <B p={[0, 0.95, 0]} s={[0.98, 1.9, 0.78]} c="#b91c1c" />
      <mesh position={[-0.12, 1.15, 0.392]} scale={[0.62, 1.2, 1]}>
        <planeGeometry />
        <meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={night ? 1.1 : 0.25} />
      </mesh>
      {[0.75, 1.05, 1.35, 1.6].flatMap((y, r) =>
        [-0.32, -0.17, -0.02, 0.1].map((x, i) => <B key={`${r}${i}`} p={[x, y, 0.36]} s={[0.09, 0.14, 0.04]} c={colors[(r + i) % colors.length]} shadow={false} />),
      )}
      <B p={[0.34, 1.25, 0.395]} s={[0.18, 0.5, 0.01]} c="#111827" shadow={false} />
      <B p={[0, 0.25, 0.395]} s={[0.6, 0.18, 0.01]} c="#111827" shadow={false} />
    </group>
  );
}

function Standee({ brand }: { brand?: { name: string; color: string } }) {
  const tex = useMemo(() => {
    if (!brand) return null;
    return makeScreenTexture(
      (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, brand.color);
        grad.addColorStop(1, "#0f1f36");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "rgba(255,255,255,0.15)";
        g.beginPath();
        g.arc(w / 2, h * 0.32, w * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        g.font = "700 120px system-ui, sans-serif";
        g.textAlign = "center";
        const initials = brand.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
        g.fillText(initials, w / 2, h * 0.32 + 42);
        g.font = "600 44px system-ui, sans-serif";
        const words = brand.name.split(" ");
        let line = "";
        let y = h * 0.62;
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (g.measureText(test).width > w - 50) {
            g.fillText(line, w / 2, y);
            line = word;
            y += 54;
          } else line = test;
        }
        g.fillText(line, w / 2, y);
      },
      400,
      1000,
    );
  }, [brand]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return (
    <group>
      <B p={[0, 0.03, 0]} s={[0.62, 0.06, 0.28]} c={P.darkGrey} />
      <B p={[0, 0.9, -0.02]} s={[0.6, 1.6, 0.03]} c="#0f172a" />
      <Screen p={[0, 0.9, 0.0]} s={[0.56, 1.52]} tex={tex} />
    </group>
  );
}

// ---------- dispatcher ----------
export interface FurnitureVisualProps {
  item: FurnitureItem;
  frames: (THREE.Texture | null)[];
  screenTex?: THREE.Texture | null;
  night?: boolean;
  brand?: { name: string; color: string };
}

export const FurnitureVisual = memo(function FurnitureVisual({ item, frames, screenTex, night, brand }: FurnitureVisualProps) {
  const [w, d] = sizeOf(item);
  switch (item.type) {
    case "workstation":
      return <Workstation item={item} />;
    case "exec_desk":
      return <ExecDesk frames={frames} screen={screenTex ?? null} />;
    case "meeting_table":
      return <MeetingTable />;
    case "sofa":
      return <Sofa color={item.color ?? (item.roomId === "reception" ? "#475569" : P.navy)} />;
    case "armchair":
      return <Sofa w={0.9} color="#0f766e" />;
    case "visitor_chair":
      return <SimpleChair color="#111827" />;
    case "coffee_table":
      return <CoffeeTable w={w} d={d} />;
    case "plant":
      return <Plant />;
    case "bookshelf":
      return <Bookshelf w={w} />;
    case "trophy_cabinet":
      return <TrophyCabinet />;
    case "perf_screen":
      return <PerfScreen tex={screenTex ?? null} />;
    case "reception_desk":
      return <ReceptionDesk />;
    case "server_rack":
      return <ServerRack />;
    case "filing_cabinet":
      return <FilingCabinet color={item.color} />;
    case "whiteboard":
      return <Whiteboard />;
    case "kitchen_counter":
      return <KitchenCounter w={w} color={item.color} />;
    case "water_cooler":
      return <WaterCooler />;
    case "round_table":
      return <RoundTable />;
    case "packing_table":
      return <PackingTable />;
    case "product_shelf":
      return <ProductShelf />;
    case "photo_set":
      return <PhotoSet />;
    case "rug":
      return <Rug w={w} d={d} />;
    case "tv_screen":
      return <TvScreen tex={screenTex ?? null} />;
    case "photo_frames":
      return <PhotoFrames frames={frames} />;
    case "floor_lamp":
      return <FloorLamp night={night} />;
    case "pendant_light":
      return <PendantLight night={night} />;
    case "fridge":
      return <Fridge />;
    case "vending_machine":
      return <VendingMachine night={night} />;
    case "standee":
      return <Standee brand={brand} />;
    default:
      return <FunVisual item={item} w={w} d={d} night={night} />;
  }
});

export { makeScreenTexture };
