"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useOfficeFx, reducedMotion } from "@/lib/motion";
import { getSim } from "@/lib/office/runtime";
import { useOffice } from "@/lib/store/office-store";
import { useMoments } from "@/lib/office/moments";

// where things are in the office (see lib/office/layout.ts)
const WGS_DESKS: [number, number][] = [[21.6, 2.8], [25, 2.8], [28.4, 2.8]];
const PACKING = { x: 21.7, z: 7.6, top: 0.92 };
const SHELF = { x: 25, z: 0.3 };
const ENTRANCE = { x: 4.5, z: 24 };
const DEFAULT_TV = { x: 51.4, y: 2.2, z: 3 };

const COIN_GEO = new THREE.CylinderGeometry(0.16, 0.16, 0.035, 24);
const COIN_MAT = new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 0.85, roughness: 0.25, emissive: "#b45309", emissiveIntensity: 0.25 });
const COIN_DOT = { shopee: new THREE.MeshBasicMaterial({ color: "#eb6834" }), lazada: new THREE.MeshBasicMaterial({ color: "#2a78d6" }) };
const DOT_GEO = new THREE.CircleGeometry(0.07, 16);

/** A gold coin per new sale: rises from the WGS team, arcs across and drops into the sales screen. */
function Coin({ platform, start, end, born }: { platform: "shopee" | "lazada"; start: THREE.Vector3; end: THREE.Vector3; born: number }) {
  const g = useRef<THREE.Group>(null);
  const mid = useMemo(() => new THREE.Vector3((start.x + end.x) / 2, Math.max(start.y, end.y) + 5, (start.z + end.z) / 2), [start, end]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    if (!g.current) return;
    const t = (Date.now() - born) / 1000;
    const rise = Math.min(1, t / 0.5); // pop up first
    const k = Math.min(1, Math.max(0, (t - 0.5) / 2.2));
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    // quadratic bezier start → mid → end
    tmp.set(0, 0, 0).addScaledVector(start, (1 - e) * (1 - e)).addScaledVector(mid, 2 * (1 - e) * e).addScaledVector(end, e * e);
    if (k === 0) tmp.copy(start).setY(start.y + rise * 0.8);
    g.current.position.copy(tmp);
    g.current.rotation.set(Math.PI / 2, 0, t * 8);
    const sc = (k === 0 ? 0.4 + rise * 0.8 : 1.2) * (k > 0.92 ? Math.max(0, (1 - k) / 0.08) : 1);
    g.current.scale.setScalar(sc);
  });
  return (
    <group ref={g}>
      <mesh geometry={COIN_GEO} material={COIN_MAT} />
      <mesh geometry={DOT_GEO} material={COIN_DOT[platform]} position={[0, 0.019, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </group>
  );
}
function SaleCoins({ tv }: { tv: { x: number; y: number; z: number } }) {
  const coins = useOfficeFx((s) => s.coins);
  const end = useMemo(() => new THREE.Vector3(tv.x, tv.y, tv.z), [tv.x, tv.y, tv.z]);
  return (
    <>
      {coins.map((c) => {
        const [x, z] = WGS_DESKS[c.id % WGS_DESKS.length];
        return <Coin key={c.id} platform={c.platform} born={c.at} start={new THREE.Vector3(x, 1.4, z)} end={end} />;
      })}
    </>
  );
}

const BOX_GEO = new THREE.BoxGeometry(0.3, 0.2, 0.24);
const BOX_MAT = new THREE.MeshStandardMaterial({ color: "#c08a52", roughness: 0.9 });
const TAPE_MAT = new THREE.MeshStandardMaterial({ color: "#ee4d2d", roughness: 0.6 });
const TAPE_GEO = new THREE.BoxGeometry(0.31, 0.012, 0.05);

/** Labels printed → parcels stack up on the packing table, then Farid carries them out to the entrance. */
function ParcelRun() {
  const run = useOfficeFx((s) => s.parcels);
  const [phase, setPhase] = useState<"stack" | "gone">("gone");
  const boxes = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!run) return;
    setPhase("stack");
    const sim = getSim();
    const t1 = setTimeout(() => sim.goToPoint("emp-orders", PACKING.x, PACKING.z + 1.1, "free", Math.PI), 2500);
    const t2 = setTimeout(() => {
      setPhase("gone");
      useMoments.getState().emote("emp-orders", "📦", 4000);
      sim.goToPoint("emp-orders", ENTRANCE.x, ENTRANCE.z, "free");
    }, 11000);
    const t3 = setTimeout(() => sim.returnToDesk("emp-orders"), 30000);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [run]);
  useFrame(() => {
    if (!boxes.current || !run) return;
    const t = (Date.now() - run.at) / 1000;
    boxes.current.children.forEach((b, i) => {
      const k = Math.min(1, Math.max(0, (t - i * 0.18) / 0.35));
      b.scale.setScalar(k < 1 ? k * (1.15 - 0.15 * k) : 1);
    });
  });
  if (!run || phase === "gone") return null;
  return (
    <group ref={boxes} position={[PACKING.x, PACKING.top, PACKING.z]}>
      {Array.from({ length: run.count }, (_, i) => {
        const layer = Math.floor(i / 4);
        const slot = i % 4;
        return (
          <group key={`${run.id}-${i}`} position={[(slot % 2) * 0.34 - 0.5, 0.1 + layer * 0.21, Math.floor(slot / 2) * 0.27 - 0.13]} scale={0}>
            <mesh geometry={BOX_GEO} material={BOX_MAT} castShadow />
            <mesh geometry={TAPE_GEO} material={TAPE_MAT} position={[0, 0.101, 0]} />
          </group>
        );
      })}
    </group>
  );
}

/** Monthly target hit: confetti falls from the ceiling all over the office. */
function CeilingConfetti() {
  const partyAt = useOfficeFx((s) => s.partyAt);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const N = 420;
  const seeds = useMemo(
    () => Array.from({ length: N }, () => ({ x: Math.random() * 52, z: Math.random() * 25, d: Math.random() * 2.5, sp: 0.8 + Math.random() * 0.9, r: Math.random() * 6, w: Math.random() * 6 })),
    [],
  );
  const colors = useMemo(() => ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"].map((c) => new THREE.Color(c)), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colored = useRef(false);
  const active = partyAt > 0 && Date.now() - partyAt < 9000 && !reducedMotion();
  useFrame(() => {
    if (!mesh.current || !active) return;
    if (!colored.current) {
      seeds.forEach((_, i) => mesh.current!.setColorAt(i, colors[i % colors.length]));
      if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
      colored.current = true;
    }
    const t = (Date.now() - partyAt) / 1000;
    seeds.forEach((s, i) => {
      const tt = Math.max(0, t - s.d);
      const y = 5.5 - tt * s.sp * 1.4;
      dummy.position.set(s.x + Math.sin(tt * 2 + s.w) * 0.4, Math.max(0.02, y), s.z + Math.cos(tt * 1.7 + s.w) * 0.3);
      dummy.rotation.set(tt * 3 + s.r, tt * 2.3, tt * 1.7);
      dummy.scale.setScalar(y < 0.05 ? 0.6 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  if (!active) {
    colored.current = false;
    return null;
  }
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N]} frustumCulled={false}>
      <planeGeometry args={[0.2, 0.11]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

/** Items running low: an amber light blinks on the product shelf, and Priya goes to check it now and then. */
function LowStockBeacon() {
  const [low, setLow] = useState(0);
  const lamp = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch("/api/stock", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { levels?: { level: string }[] } | null) => !dead && setLow((j?.levels ?? []).filter((l) => l.level === "low" || l.level === "out").length))
        .catch(() => {});
    void load();
    const t = setInterval(load, 10 * 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, []);
  // Priya walks over to the shelf every few minutes while something is low
  useEffect(() => {
    if (!low) return;
    const go = () => {
      const sim = getSim();
      const a = sim.agents.get("emp-inv");
      if (!a || a.pose === "walk" || a.intent === "meeting") return;
      sim.goToPoint("emp-inv", SHELF.x, SHELF.z + 1, "free", Math.PI);
      useMoments.getState().emote("emp-inv", "📋", 4000);
      setTimeout(() => sim.returnToDesk("emp-inv"), 14000);
    };
    const first = setTimeout(go, 20000);
    const t = setInterval(go, 4 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [low]);
  useFrame(({ clock }) => {
    const on = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5);
    if (lamp.current) (lamp.current.material as THREE.MeshBasicMaterial).color.setRGB(0.98, 0.55 + on * 0.25, 0.1 + on * 0.1);
    if (light.current) light.current.intensity = 0.4 + on * 1.6;
  });
  if (!low) return null;
  return (
    <group position={[SHELF.x, 2.05, SHELF.z + 0.05]}>
      <mesh ref={lamp}>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshBasicMaterial color="#f59e0b" toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.09, 0.11, 0.06, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <pointLight ref={light} color="#f59e0b" distance={3} decay={1.6} />
    </group>
  );
}

/** Business moments in the 3D office. */
export function OfficeFx() {
  const screen = useOffice((s) => s.furniture.find((f) => f.type === "perf_screen"));
  const tv = screen ? { x: screen.x - 0.25, y: 2.1, z: screen.z } : DEFAULT_TV;
  return (
    <>
      <SaleCoins tv={tv} />
      <ParcelRun />
      <CeilingConfetti />
      <LowStockBeacon />
    </>
  );
}
