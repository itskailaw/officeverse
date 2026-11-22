"use client";

// Living details: staff cars that arrive and leave with the working day, festive decorations,
// birthday balloons at desks, and the employee-of-the-month frame in the lobby.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useOffice } from "@/lib/store/office-store";
import { decorTheme, type DecorTheme } from "@/lib/office/festive";
import { bayTimes, celebrationsToday, employeeOfMonth, klParts, lastMonth, seeded } from "@/lib/office/office-life";
import { seatsFor } from "@/lib/office/catalog";
import { mat, makeScreenTexture } from "./materials";
import { Car } from "./Building";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const SPH = new THREE.SphereGeometry(0.5, 16, 12);
const PLANE = new THREE.PlaneGeometry(1, 1);
const CONE = new THREE.ConeGeometry(0.5, 1, 12);
const CAR_COLORS = ["#dc2626", "#f8fafc", "#1e3a5f", "#111827", "#9ca3af", "#0ea5e9", "#f59e0b", "#065f46"];

/** Re-render every `ms` so time-of-day things update. */
function useClock(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ------------------------------------------------------------------ car park
type Bay = { x: number; z: number; rot: number; i: number };

/** One staff car: drives in from the road up the aisle and turns into its bay (and back out in the evening). */
function StaffCar({ bay, here, lotX, entryZ, color }: { bay: Bay; here: boolean; lotX: number; entryZ: number; color: string }) {
  const g = useRef<THREE.Group>(null);
  const p = useRef(here ? 1 : 0); // 0 = off the lot, 1 = parked
  useFrame((_, dt) => {
    const target = here ? 1 : 0;
    p.current += Math.sign(target - p.current) * Math.min(Math.abs(target - p.current), dt / 7);
    const v = p.current;
    if (!g.current) return;
    g.current.visible = v > 0.001;
    if (!g.current.visible) return;
    // first 70%: along the aisle from the road; last 30%: turn into the bay
    if (v < 0.7) {
      const t = v / 0.7;
      g.current.position.set(lotX, 0, entryZ + (bay.z - entryZ) * t);
      g.current.rotation.y = Math.PI;
    } else {
      const t = (v - 0.7) / 0.3;
      const e = t * t * (3 - 2 * t);
      g.current.position.set(lotX + (bay.x - lotX) * e, 0, bay.z);
      g.current.rotation.y = Math.PI + (bay.rot - Math.PI) * e;
    }
  });
  return (
    <group ref={g}>
      <Car color={color} x={0} z={0} rot={0} />
    </group>
  );
}

/** Staff cars fill the car park through the morning and leave in the evening (Malaysia time). */
export function StaffCars({ lotX, bays, D }: { lotX: number; bays: number; D: number }) {
  const now = useClock(30_000);
  const { date, minutes, weekday } = klParts(now);
  const spots = useMemo(() => {
    const out: Bay[] = [];
    for (let i = 0; i < bays; i++) {
      if (i > 0) out.push({ x: lotX - 3.9, z: 2.7 + i * 3, rot: Math.PI / 2, i: out.length }); // bay 0 on the left is the CEO's
      out.push({ x: lotX + 3.9, z: 2.7 + i * 3, rot: -Math.PI / 2, i: out.length });
    }
    return out;
  }, [lotX, bays]);
  return (
    <group>
      {spots.map((b) => {
        const t = bayTimes(date, weekday, b.i);
        const here = !!t && minutes >= t.arrive && minutes < t.leave;
        return <StaffCar key={b.i} bay={b} here={here} lotX={lotX} entryZ={D + 6} color={CAR_COLORS[Math.floor(seeded(`car:${b.i}`) * CAR_COLORS.length)]} />;
      })}
    </group>
  );
}

// ------------------------------------------------------------------ festive decorations
/** A string of small ornaments hanging in a shallow curve between two points along Main Street. */
function Garland({ x0, x1, z, y, n, item }: { x0: number; x1: number; z: number; y: number; n: number; item: (i: number) => React.ReactNode }) {
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const t = (i + 0.5) / n;
        const sag = Math.sin(t * Math.PI) * 0.35;
        return (
          <group key={i} position={[x0 + (x1 - x0) * t, y - sag, z]}>
            {item(i)}
          </group>
        );
      })}
    </group>
  );
}

function Lantern() {
  return (
    <group>
      <mesh geometry={CYL} material={mat("#facc15")} position={[0, 0.24, 0]} scale={[0.02, 0.2, 0.02]} />
      <mesh geometry={SPH} material={mat("#dc2626", { emissive: "#ef4444", ei: 0.5 })} scale={[0.34, 0.28, 0.34]} castShadow />
      <mesh geometry={CYL} material={mat("#facc15")} position={[0, -0.18, 0]} scale={[0.12, 0.05, 0.12]} />
      <mesh geometry={CYL} material={mat("#facc15")} position={[0, -0.28, 0]} scale={[0.03, 0.16, 0.03]} />
    </group>
  );
}
function Ketupat({ i }: { i: number }) {
  return (
    <group rotation={[0, i * 0.7, Math.PI / 4]}>
      <mesh geometry={BOX} material={mat(i % 2 ? "#65a30d" : "#ca8a04")} scale={0.18} castShadow />
      <mesh geometry={BOX} material={mat("#fde047")} scale={[0.19, 0.03, 0.19]} />
    </group>
  );
}
function Flag({ i }: { i: number }) {
  // tiny Jalur Gemilang: red/white stripes with a blue canton
  return (
    <group rotation={[0, 0, 0]}>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} geometry={BOX} material={mat(k % 2 ? "#f8fafc" : "#dc2626")} position={[0, -0.06 - k * 0.05, 0]} scale={[0.34, 0.05, 0.01]} />
      ))}
      <mesh geometry={BOX} material={mat("#1e3a8a")} position={[-0.09, -0.1, 0.006]} scale={[0.16, 0.12, 0.01]} />
      <mesh geometry={SPH} material={mat("#facc15", { emissive: "#facc15", ei: 0.3 })} position={[-0.09, -0.1, 0.012]} scale={0.05} />
      {i % 7 === 0 && <mesh geometry={CYL} material={mat("#94a3b8")} position={[0, 0.05, 0]} scale={[0.01, 0.1, 0.01]} />}
    </group>
  );
}
function Bulb({ i, night }: { i: number; night: boolean }) {
  const c = ["#ef4444", "#22c55e", "#facc15", "#3b82f6", "#f97316"][i % 5];
  return <mesh geometry={SPH} material={mat(c, { emissive: c, ei: night ? 1.6 : 0.4 })} scale={0.09} />;
}
function Marigold({ i }: { i: number }) {
  return <mesh geometry={SPH} material={mat(i % 2 ? "#f97316" : "#facc15")} scale={0.15} />;
}

function OilLamp({ x, z, night, tall = false }: { x: number; z: number; night: boolean; tall?: boolean }) {
  const flame = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (flame.current) flame.current.scale.y = 0.09 + Math.sin(clock.elapsedTime * 11 + seed) * 0.02;
  });
  const h = tall ? 0.9 : 0.06;
  return (
    <group position={[x, 0, z]}>
      {tall && <mesh geometry={CYL} material={mat("#a16207")} position={[0, h / 2, 0]} scale={[0.05, h, 0.05]} castShadow />}
      <mesh geometry={CYL} material={mat("#b45309")} position={[0, h + 0.03, 0]} scale={[0.14, 0.06, 0.14]} />
      <mesh ref={flame} geometry={SPH} material={mat("#fb923c", { emissive: "#f97316", ei: 2 })} position={[0, h + 0.12, 0]} scale={[0.05, 0.09, 0.05]} />
      {night && <pointLight position={[0, h + 0.3, 0]} intensity={0.8} distance={2.2} color="#fb923c" />}
    </group>
  );
}

function ChristmasTree({ x, z, night }: { x: number; z: number; night: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={CYL} material={mat("#7c2d12")} position={[0, 0.2, 0]} scale={[0.14, 0.4, 0.14]} />
      {[0, 1, 2].map((k) => (
        <mesh key={k} geometry={CONE} material={mat("#166534")} position={[0, 0.7 + k * 0.42, 0]} scale={[1.1 - k * 0.3, 0.75, 1.1 - k * 0.3]} castShadow />
      ))}
      {Array.from({ length: 14 }).map((_, i) => {
        const a = i * 2.4;
        const y = 0.5 + (i / 14) * 1.2;
        const r = 0.5 - (i / 14) * 0.35;
        const c = ["#ef4444", "#facc15", "#3b82f6", "#f8fafc"][i % 4];
        return <mesh key={i} geometry={SPH} material={mat(c, { emissive: c, ei: night ? 1.4 : 0.3 })} position={[Math.cos(a) * r, y, Math.sin(a) * r]} scale={0.08} />;
      })}
      <mesh geometry={SPH} material={mat("#facc15", { emissive: "#facc15", ei: 1.5 })} position={[0, 1.85, 0]} scale={0.14} />
      {[
        [0.45, "#dc2626"],
        [-0.4, "#2563eb"],
      ].map(([dx, c], i) => (
        <mesh key={i} geometry={BOX} material={mat(c as string)} position={[dx as number, 0.12, 0.35]} scale={[0.26, 0.24, 0.26]} castShadow />
      ))}
    </group>
  );
}

/** Kolam (rangoli) pattern on the lobby floor for Deepavali. */
function Kolam({ x, z }: { x: number; z: number }) {
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.clearRect(0, 0, W, H);
          const cx = W / 2;
          const cy = H / 2;
          const rings = ["#db2777", "#f97316", "#facc15", "#16a34a", "#2563eb", "#7c3aed"];
          rings.forEach((c, k) => {
            g.fillStyle = c;
            const r = W * (0.48 - k * 0.07);
            for (let p = 0; p < 12; p++) {
              const a = (p / 12) * Math.PI * 2 + k * 0.26;
              g.beginPath();
              g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.32, r * 0.14, a, 0, Math.PI * 2);
              g.fill();
            }
          });
          g.fillStyle = "#fef3c7";
          g.beginPath();
          g.arc(cx, cy, W * 0.08, 0, Math.PI * 2);
          g.fill();
        },
        512,
        512,
      ),
    [],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh geometry={PLANE} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.006, z]} scale={[1.8, 1.8, 1]}>
      <meshBasicMaterial map={tex} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Decorations that go up around Raya, CNY, Deepavali, Merdeka and Christmas (?decor=… previews one). */
export function FestiveDecor({ night }: { night: boolean }) {
  const on = useOffice((s) => s.settings.festiveOutfits ?? true);
  const now = useClock(10 * 60_000);
  const theme = useMemo<DecorTheme | null>(() => {
    const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("decor") : null;
    if (q === "raya" || q === "cny" || q === "deepavali" || q === "merdeka" || q === "christmas") return q;
    return decorTheme(now);
  }, [now]);
  if (!on || !theme) return null;
  // Main Street runs x 0–52 at z 11–15; strings hang at z 13, between the posts every ~6.5 m
  const spans: [number, number][] = [
    [1, 8],
    [9, 16],
    [17, 24],
    [25, 32],
    [33, 40],
    [41, 51],
  ];
  const strings = (n: number, item: (i: number) => React.ReactNode, y = 2.4) => spans.map(([a, b], k) => <Garland key={k} x0={a} x1={b} z={13} y={y} n={n} item={item} />);
  return (
    <group>
      {theme === "cny" && (
        <>
          {strings(3, () => <Lantern />)}
          {[3.2, 5.8].map((x, i) => (
            <group key={i} position={[x, 0, 25.9]}>
              <mesh geometry={CYL} material={mat("#b45309")} position={[0, 0.2, 0]} scale={[0.4, 0.4, 0.4]} castShadow />
              {Array.from({ length: 6 }).map((_, k) => (
                <mesh key={k} geometry={SPH} material={mat("#f97316")} position={[Math.cos(k) * 0.13, 0.48 + (k % 2) * 0.08, Math.sin(k) * 0.13]} scale={0.14} />
              ))}
            </group>
          ))}
        </>
      )}
      {theme === "raya" && (
        <>
          {strings(6, (i) => <Ketupat i={i} />)}
          {[26.2, 27.4, 28.6].flatMap((z, k) => [<OilLamp key={`a${k}`} x={3.1} z={z} night={night} tall />, <OilLamp key={`b${k}`} x={5.9} z={z} night={night} tall />])}
        </>
      )}
      {theme === "deepavali" && (
        <>
          {strings(9, (i) => <Marigold i={i} />)}
          <Kolam x={4.5} z={23.4} />
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <OilLamp key={i} x={4.5 + Math.cos(a) * 1.05} z={23.4 + Math.sin(a) * 1.05} night={night} />;
          })}
        </>
      )}
      {theme === "merdeka" && (
        <>
          {strings(10, (i) => <Flag i={i} />)}
          <group position={[8.2, 0, 26.2]}>
            <mesh geometry={CYL} material={mat("#cbd5e1", { metal: 0.6 })} position={[0, 2, 0]} scale={[0.06, 4, 0.06]} castShadow />
            <group position={[0.55, 3.75, 0]} scale={3}>
              <Flag i={1} />
            </group>
          </group>
        </>
      )}
      {theme === "christmas" && (
        <>
          {strings(12, (i) => <Bulb i={i} night={night} />, 2.5)}
          <ChristmasTree x={1.3} z={17} night={night} />
        </>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ birthdays
function Balloons({ gold }: { gold: boolean }) {
  const g = useRef<THREE.Group>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = Math.sin(clock.elapsedTime * 1.4 + seed) * 0.05;
  });
  const colors = gold ? ["#facc15", "#eab308", "#fde68a"] : ["#ec4899", "#3b82f6", "#22c55e"];
  return (
    <group ref={g}>
      {colors.map((c, i) => {
        const x = (i - 1) * 0.22;
        const y = 1.75 + (i % 2) * 0.18;
        return (
          <group key={i}>
            <mesh geometry={SPH} material={mat(c, { rough: 0.2 })} position={[x, y, 0]} scale={[0.26, 0.32, 0.26]} castShadow />
            <mesh geometry={CYL} material={mat("#e5e7eb")} position={[x * 0.5, (y + 0.8) / 2, 0]} scale={[0.006, y - 0.8, 0.006]} />
          </group>
        );
      })}
    </group>
  );
}
function Cake() {
  return (
    <group>
      <mesh geometry={CYL} material={mat("#fdf2f8")} position={[0, 0.06, 0]} scale={[0.26, 0.12, 0.26]} castShadow />
      <mesh geometry={CYL} material={mat("#ec4899")} position={[0, 0.125, 0]} scale={[0.27, 0.015, 0.27]} />
      {[-0.06, 0.06].map((x, i) => (
        <group key={i} position={[x, 0.19, 0]}>
          <mesh geometry={CYL} material={mat(i ? "#3b82f6" : "#facc15")} scale={[0.015, 0.1, 0.015]} />
          <mesh geometry={SPH} material={mat("#fb923c", { emissive: "#f97316", ei: 2 })} position={[0, 0.07, 0]} scale={[0.02, 0.035, 0.02]} />
        </group>
      ))}
    </group>
  );
}

/** Balloons at the desk of anyone with a birthday (and a cake) or work anniversary (gold) today. */
export function BirthdayDecor() {
  const employees = useOffice((s) => s.employees);
  const dates = useOffice((s) => s.settings.staffDates);
  const furniture = useOffice((s) => s.furniture);
  const now = useClock(10 * 60_000);
  const items = useMemo(() => {
    const people = employees.map((e) => ({ id: e.id, name: e.name, active: e.active, ...(dates?.[e.id] ?? {}) }));
    const today = celebrationsToday(people, now);
    const seats = furniture.flatMap(seatsFor);
    return today
      .map((c) => {
        const ws = employees.find((e) => e.id === c.id)?.workstationId;
        const seat = seats.find((s) => s.id === ws);
        const desk = seat ? furniture.find((f) => f.id === seat.furnitureId) : undefined;
        return desk ? { ...c, x: desk.x, z: desk.z, rot: desk.rot } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [employees, dates, furniture, now]);
  return (
    <group>
      {items.map((c) => (
        <group key={`${c.id}-${c.kind}`} position={[c.x, 0, c.z]} rotation={[0, c.rot, 0]}>
          <group position={[c.kind === "birthday" ? 0.5 : -0.5, 0, 0.1]}>
            <Balloons gold={c.kind === "anniversary"} />
          </group>
          {c.kind === "birthday" && (
            <group position={[0.35, 0.76, 0.05]}>
              <Cake />
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ employee of the month
export function EotmFrame() {
  const employees = useOffice((s) => s.employees);
  const tasks = useOffice((s) => s.tasks);
  const chats = useOffice((s) => s.chatMessages);
  const walls = useOffice((s) => s.settings.walls);
  const month = lastMonth();
  const top = useMemo(() => employeeOfMonth(employees, tasks, chats, month), [employees, tasks, chats, month]);
  const emp = employees.find((e) => e.id === top?.id);
  const tex = useMemo(
    () =>
      makeScreenTexture(
        (g, W, H) => {
          g.fillStyle = "#1e1b4b";
          g.fillRect(0, 0, W, H);
          g.strokeStyle = "#fbbf24";
          g.lineWidth = 14;
          g.strokeRect(10, 10, W - 20, H - 20);
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = "#fbbf24";
          g.font = "800 34px system-ui, sans-serif";
          g.fillText("EMPLOYEE OF THE MONTH", W / 2, 58);
          const label = new Date(`${month}-15T12:00:00+08:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
          g.fillStyle = "#e0e7ff";
          g.font = "600 26px system-ui, sans-serif";
          g.fillText(label, W / 2, 98);
          if (!top || !emp) {
            g.fillStyle = "#c7d2fe";
            g.font = "500 28px system-ui, sans-serif";
            g.fillText("Chosen from next month's", W / 2, H / 2 + 20);
            g.fillText("scorecards", W / 2, H / 2 + 56);
            return;
          }
          // initials medal
          g.fillStyle = "#fbbf24";
          g.beginPath();
          g.arc(W / 2, 205, 72, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#1e1b4b";
          g.font = "800 60px system-ui, sans-serif";
          g.fillText(
            emp.name
              .split(/\s+/)
              .map((w) => w[0])
              .slice(0, 2)
              .join(""),
            W / 2,
            208,
          );
          g.fillStyle = "#ffffff";
          g.font = "800 40px system-ui, sans-serif";
          g.fillText(emp.name, W / 2, 322, W - 40);
          g.fillStyle = "#c7d2fe";
          g.font = "500 26px system-ui, sans-serif";
          g.fillText(emp.title, W / 2, 362, W - 40);
          g.fillStyle = "#fde68a";
          g.font = "700 28px system-ui, sans-serif";
          g.fillText(`🏆 ${top.done} tasks done${top.chats ? ` · ${top.chats} chats` : ""}`, W / 2, 420, W - 40);
        },
        512,
        480,
      ),
    [top, emp, month],
  );
  useEffect(() => () => tex.dispose(), [tex]);
  const y = walls === "full" ? 1.6 : walls === "cutaway" ? 0.62 : 0.56;
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={BOX} material={mat("#a16207", { metal: 0.3, rough: 0.4 })} position={[0, 0, 0]} scale={[1.12, 1.06, 0.04]} castShadow />
      <mesh geometry={PLANE} position={[0, 0, 0.025]} scale={[1.0, 0.94, 1]}>
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}
