"use client";

import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Room, WallMode } from "@/lib/data/types";
import { DOORS, ROOMS, WALLS, wallSegments } from "@/lib/office/layout";
import { getSim } from "@/lib/office/runtime";
import { carpetTexture, mat, plankTexture, tileTexture, PALETTE as P } from "./materials";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE = new THREE.PlaneGeometry(1, 1);

export const WALL_HEIGHT: Record<WallMode, number> = { full: 2.7, cutaway: 1.05, hidden: 0.08 };
const THICK = 0.15;

const CARPET: Record<string, string> = {
  wgs: "#cfd8e3",
  finance: "#d6d3d1",
  marketing: "#e5dcd3",
  artides: "#ddd3c4",
  amare: "#d9d4e6",
};

function RoomFloor({ room, wood }: { room: Room; wood: string }) {
  const w = room.x1 - room.x0;
  const d = room.z1 - room.z0;
  const material = useMemo(() => {
    let tex: THREE.Texture;
    let repeat: [number, number];
    if (room.floor === "wood") {
      tex = plankTexture(room.id === "ceo" ? "#8b5a36" : wood).clone();
      repeat = [w / 4, d / 4];
    } else if (room.floor === "carpet") {
      tex = carpetTexture(CARPET[room.id] ?? "#d4d4d8").clone();
      repeat = [w / 2, d / 2];
    } else if (room.floor === "dark") {
      tex = tileTexture("#475569", "rgba(15,23,42,0.5)").clone();
      repeat = [w / 0.6, d / 0.6];
    } else {
      tex = tileTexture("#f1f5f9").clone();
      repeat = [w / 1.2, d / 1.2];
    }
    tex.repeat.set(repeat[0], repeat[1]);
    tex.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: room.floor === "wood" ? 0.55 : 0.9 });
  }, [room.floor, room.id, w, d, wood]);
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

const Walls = memo(function Walls({ mode, wallColor, accent }: { mode: WallMode; wallColor: string; accent: string }) {
  const segs = useMemo(() => wallSegments(WALLS, DOORS), []);
  const h = WALL_HEIGHT[mode];
  const glass = mat("#bfdbfe", { opacity: 0.28, rough: 0.05 });
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
        const exterior = s.kind === "exterior";
        return (
          <group key={i}>
            <mesh geometry={BOX} material={mat(exterior ? "#e2e8f0" : wallColor, { rough: 0.85 })} position={[cx, h / 2, cz]} scale={[sx, h, sz]} castShadow receiveShadow />
            {/* wall cap reads nicely in cut-away mode */}
            <mesh geometry={BOX} material={mat(exterior ? accent : "#cbd5e1")} position={[cx, h + 0.01, cz]} scale={[sx + 0.01, 0.02, sz + 0.01]} />
            {mode !== "hidden" && (
              <mesh geometry={BOX} material={mat(accent)} position={[cx, 0.06, cz]} scale={[sx + 0.02, 0.12, sz + 0.02]} />
            )}
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

function Exterior() {
  const grass = useMemo(() => {
    const t = carpetTexture("#a7c49a").clone();
    t.repeat.set(40, 40);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  return (
    <group>
      <mesh geometry={PLANE} material={grass} rotation={[-Math.PI / 2, 0, 0]} position={[24, -0.12, 11.5]} scale={[160, 120, 1]} receiveShadow />
      {/* plinth */}
      <mesh geometry={BOX} material={mat("#cbd5e1")} position={[24, -0.06, 11.5]} scale={[48.8, 0.12, 23.8]} receiveShadow />
      {/* entrance plaza + path */}
      <mesh geometry={BOX} material={mat("#e2e8f0", { rough: 0.95 })} position={[5, -0.07, 26]} scale={[6, 0.1, 5.5]} receiveShadow />
      <mesh geometry={BOX} material={mat("#d6d3d1", { rough: 0.95 })} position={[24, -0.08, 30]} scale={[60, 0.08, 3]} receiveShadow />
      {/* trees */}
      {[
        [-4, 4],
        [-4, 16],
        [1.5, 27],
        [9, 27],
        [16, 27.5],
        [34, 27.5],
        [52, 6],
        [52, 18],
        [44, 27.5],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={BOX} material={mat("#7c5a3a")} position={[0, 0.7, 0]} scale={[0.25, 1.4, 0.25]} castShadow />
          <mesh material={mat(i % 2 ? P.leaf : P.leafDark, { rough: 0.9 })} position={[0, 2.1, 0]} castShadow>
            <icosahedronGeometry args={[1.1, 0]} />
          </mesh>
        </group>
      ))}
      {/* signage */}
      <group position={[5, 0, 24.4]}>
        <mesh geometry={BOX} material={mat(P.navy)} position={[0, 0.35, 0]} scale={[3.2, 0.7, 0.25]} castShadow />
        <Html center transform position={[0, 0.36, 0.13]} scale={0.32} occlude={false} style={{ pointerEvents: "none" }}>
          <div className="select-none font-semibold tracking-[0.25em] text-white">OFFICEVERSE</div>
        </Html>
      </group>
    </group>
  );
}

export function RoomLabels({ labels, onFocus }: { labels: { room: Room; text: string; color?: string }[]; onFocus: (r: Room) => void }) {
  return (
    <>
      {labels.map(({ room, text, color }) => (
        <Html
          key={room.id}
          position={[(room.x0 + room.x1) / 2, 0.05, room.id === "corridor" ? 11.5 : room.z0 < 10 ? room.z1 - 0.8 : room.z1 - 0.7]}
          center
          zIndexRange={[10, 0]}
        >
          <button
            onClick={() => onFocus(room)}
            className="pointer-events-auto whitespace-nowrap rounded-md border border-white/60 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white"
          >
            {color && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />}
            {text}
          </button>
        </Html>
      ))}
    </>
  );
}

export const Building = memo(function Building({ walls, wallColor, accent, wood }: { walls: WallMode; wallColor: string; accent: string; wood: string }) {
  return (
    <group>
      <Exterior />
      {ROOMS.map((r) => (
        <RoomFloor key={r.id} room={r} wood={wood} />
      ))}
      <Walls mode={walls} wallColor={wallColor} accent={accent} />
      {DOORS.filter((d) => !d.open).map((d) => (
        <SlidingDoor key={d.id} {...d} mode={walls} />
      ))}
    </group>
  );
});
