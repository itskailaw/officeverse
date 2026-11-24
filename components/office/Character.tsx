"use client";

import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Appearance, EmployeeStatus } from "@/lib/data/types";
import { STATUS_META } from "@/lib/data/types";
import type { Agent } from "@/lib/office/sim";
import { getSim } from "@/lib/office/runtime";
import { mat, vinyl } from "./materials";
import { useMoments, taskEmoji } from "@/lib/office/moments";
import { useMusic } from "@/lib/audio/music";
import { klHourNow } from "@/lib/office/lighting";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CAP = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
const SPH = new THREE.SphereGeometry(0.5, 20, 16);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const SKIRT = new THREE.CylinderGeometry(0.5, 0.62, 1, 16);
const TORUS = new THREE.TorusGeometry(0.11, 0.025, 8, 24);
const MOUTH = new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI);
const RING = new THREE.RingGeometry(0.42, 0.5, 32);
/** half-ring over the top of the head (headsets, headphones) */
const BAND = new THREE.TorusGeometry(0.145, 0.013, 6, 20, Math.PI);
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
/** soft round shadow under each person (grounds them on the floor) */
const BLOB_GEO = new THREE.CircleGeometry(0.5, 24);
const BLOB_MAT = (() => {
  if (typeof document === "undefined") return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, "rgba(15,23,42,0.45)");
  grad.addColorStop(1, "rgba(15,23,42,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
})();

/** Two-letter initials from a name, ignoring brackets and symbols ("Farid Osman" → "FO"). */
function initialsOf(name?: string) {
  const words = (name ?? "")
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  return (words.map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
}

/** iris colours (mostly brown, a few hazel/green/blue), picked per person */
const IRIS = ["#6b3f1f", "#6b3f1f", "#5b3a22", "#7c4a1e", "#4d7c0f", "#1e40af", "#6b3f1f", "#8a5a2b"];
function hashOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const BROW_Y = 0.052;
const UPPER_LEG = 0.42;
const LOWER_LEG = 0.42;
const HIP_Y = 0.9;
const SEAT_HIP_Y = 0.5;

interface Props {
  id: string;
  name: string;
  title?: string;
  appearance: Appearance;
  status?: EmployeeStatus;
  isCEO?: boolean;
  /** employee id — picks role accessories */
  role?: string;
  /** company / department colour for the ID lanyard */
  lanyard?: string;
  /** bigger head, shorter legs (friendlier at a distance) */
  chibi?: boolean;
  /** festive / theme-day outfit */
  theme?: Theme | null;
  gender?: string;
  selected?: boolean;
  hovered?: boolean;
  showTag?: boolean;
  showBubble?: boolean;
  dimmed?: boolean;
  /** department id — picks the team uniform */
  dept?: string;
  /** wear the team uniform */
  uniforms?: boolean;
  /** title of the task they're working on (for the bubble) */
  task?: string | null;
  /** 1–3: top performers last month get a star on their tag */
  star?: number;
  /** profile photo for the name tag */
  photo?: string | null;
  /** standalone preview (character creator): no simulation, slowly turning */
  preview?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onHover?: (on: boolean) => void;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

/** Fringe across the forehead and a glossy highlight — what makes cartoon hair read as hair. */
function HairDetails({ a, m }: { a: Appearance; m: THREE.Material }) {
  if (a.hairStyle === "hijab" || a.hairStyle === "buzz" || a.hairStyle === "undercut" || a.hairStyle === "sidepart") return null;
  return (
    <group>
      {a.hairStyle !== "curly" && a.hairStyle !== "spiky" && (
        <>
          <mesh geometry={SPH} material={m} position={[-0.06, 0.085, 0.085]} rotation={[0, 0, 0.5]} scale={[0.13, 0.07, 0.1]} castShadow />
          <mesh geometry={SPH} material={m} position={[0.055, 0.095, 0.085]} rotation={[0, 0, -0.35]} scale={[0.12, 0.06, 0.1]} castShadow />
        </>
      )}
    </group>
  );
}

function Hair({ a }: { a: Appearance }) {
  const m = vinyl(a.hair);
  return (
    <group>
      <HairShape a={a} m={m} />
      <HairDetails a={a} m={m} />
      {a.accessories?.includes("cap") && a.hairStyle !== "hijab" && (
        <group>
          <mesh geometry={SPH} material={vinyl(a.shirt)} position={[0, 0.085, -0.01]} scale={[0.29, 0.2, 0.29]} castShadow />
          <mesh geometry={CYL} material={vinyl(a.shirt)} position={[0, 0.075, 0.13]} scale={[0.22, 0.014, 0.13]} castShadow />
        </group>
      )}
      {a.accessories?.includes("earrings") && a.hairStyle !== "hijab" &&
        [-1, 1].map((sx) => <mesh key={sx} geometry={SPH} material={mat("#facc15", { metal: 0.8, rough: 0.2 })} position={[sx * 0.13, -0.05, 0.005]} scale={0.022} />)}
    </group>
  );
}

function HairShape({ a, m }: { a: Appearance; m: THREE.Material }) {
  switch (a.hairStyle) {
    case "undercut":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.075, -0.005]} scale={[0.25, 0.17, 0.27]} castShadow />
          <mesh geometry={SPH} material={m} position={[0.04, 0.12, 0.07]} rotation={[0, 0, -0.45]} scale={[0.2, 0.08, 0.15]} castShadow />
        </group>
      );
    case "sidepart":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.045, -0.01]} scale={[0.278, 0.225, 0.282]} castShadow />
          <mesh geometry={SPH} material={m} position={[-0.06, 0.11, 0.07]} rotation={[0, 0, 0.45]} scale={[0.18, 0.075, 0.13]} castShadow />
        </group>
      );
    case "wavy":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.03, -0.02]} scale={[0.3, 0.29, 0.3]} castShadow />
          {[
            [-0.13, -0.08, -0.02],
            [0.13, -0.08, -0.02],
            [-0.11, -0.17, -0.05],
            [0.11, -0.17, -0.05],
            [0, -0.12, -0.11],
          ].map((p, i) => (
            <mesh key={i} geometry={SPH} material={m} position={p as [number, number, number]} scale={0.12} castShadow />
          ))}
        </group>
      );
    case "braids":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.04, -0.015]} scale={[0.28, 0.25, 0.28]} castShadow />
          {[-1, 1].map((sx) =>
            [0, 1, 2, 3].map((k) => <mesh key={`${sx}${k}`} geometry={SPH} material={m} position={[sx * 0.11, -0.06 - k * 0.055, -0.06]} scale={0.06 - k * 0.006} castShadow />),
          )}
        </group>
      );
    case "hijab":
      return (
        <group>
          {a.hijabStyle === "shawl" && (
            <mesh geometry={SPH} material={m} position={[0.1, -0.2, 0.04]} rotation={[0.2, 0, 0.35]} scale={[0.09, 0.22, 0.06]} castShadow />
          )}
          {a.hijabStyle === "bawal" && <mesh geometry={SPH} material={m} position={[0, 0.115, 0.075]} scale={[0.24, 0.05, 0.13]} castShadow />}
          {/* wrapped behind the face so the face stays visible, framed by the scarf */}
          <mesh geometry={SPH} material={m} position={[0, 0.02, -0.05]} scale={[0.3, 0.31, 0.27]} castShadow />
          <mesh geometry={TORUS} material={m} position={[0, -0.005, 0.07]} scale={[0.68, 0.82, 0.9]} castShadow />
          <mesh geometry={SKIRT} material={m} position={[0, -0.15, -0.03]} scale={[0.21, 0.05, 0.19]} castShadow />
        </group>
      );
    case "long":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.03, -0.015]} scale={[0.29, 0.28, 0.29]} castShadow />
          <mesh geometry={SPH} material={m} position={[0, -0.1, -0.08]} scale={[0.29, 0.38, 0.16]} castShadow />
        </group>
      );
    case "bob":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.03, -0.045]} scale={[0.3, 0.29, 0.26]} castShadow />
          {/* side pieces + fringe, leaving the face open */}
          <mesh geometry={SPH} material={m} position={[-0.12, -0.04, -0.01]} scale={[0.08, 0.22, 0.19]} castShadow />
          <mesh geometry={SPH} material={m} position={[0.12, -0.04, -0.01]} scale={[0.08, 0.22, 0.19]} castShadow />
          <mesh geometry={SPH} material={m} position={[0, 0.1, 0.05]} scale={[0.24, 0.09, 0.17]} castShadow />
        </group>
      );
    case "bun":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.04, -0.015]} scale={[0.28, 0.25, 0.28]} castShadow />
          <mesh geometry={SPH} material={m} position={[0, 0.13, -0.12]} scale={[0.13, 0.13, 0.13]} castShadow />
        </group>
      );
    case "ponytail":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.04, -0.015]} scale={[0.28, 0.25, 0.28]} castShadow />
          <mesh geometry={CAP} material={m} position={[0, -0.05, -0.15]} rotation={[0.4, 0, 0]} scale={[0.07, 0.15, 0.07]} castShadow />
        </group>
      );
    case "curly":
      return (
        <group>
          {[
            [0, 0.1, 0],
            [-0.09, 0.07, 0.03],
            [0.09, 0.07, 0.03],
            [-0.1, 0.04, -0.07],
            [0.1, 0.04, -0.07],
            [0, 0.06, -0.1],
            [0, 0.12, 0.06],
          ].map((p, i) => (
            <mesh key={i} geometry={SPH} material={m} position={p as [number, number, number]} scale={0.13} castShadow />
          ))}
        </group>
      );
    case "spiky":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.045, -0.01]} scale={[0.27, 0.2, 0.275]} castShadow />
          {[-0.07, 0, 0.07].map((x, i) => (
            <mesh key={x} geometry={CONE} material={m} position={[x, 0.14, 0.03 - i * 0.02]} rotation={[0.3, 0, x * 3]} scale={[0.08, 0.1, 0.08]} />
          ))}
        </group>
      );
    case "buzz":
      return <mesh geometry={SPH} material={m} position={[0, 0.03, -0.005]} scale={[0.265, 0.24, 0.265]} castShadow />;
    case "short":
    default:
      return <mesh geometry={SPH} material={m} position={[0, 0.045, -0.01]} scale={[0.275, 0.22, 0.28]} castShadow />;
  }
}

function Limb({ len, w, m }: { len: number; w: number; m: THREE.Material }) {
  return <mesh geometry={CAP} material={m} position={[0, -len / 2, 0]} scale={[w, len - w, w]} castShadow />;
}

/** What the activity bubble should say right now (honest: only real sim / status state). */
const BREAK_TEXT: Record<string, string> = {
  hoop: "🏀 Shooting hoops",
  ping_pong: "🏓 Playing ping-pong",
  foosball: "⚽ Foosball match",
  arcade: "🕹️ Arcade break",
  coffee_bar: "☕ Grabbing a kopi",
  snack_shelf: "🍪 Snack run",
  nap_pod: "😴 Power nap",
  hammock: "🌿 Chilling in the garden",
  bench: "🌿 Fresh air break",
  bbq: "🍢 At the BBQ",
  bean_bag: "🛋️ Relaxing",
  vending_machine: "🥤 Getting a drink",
  water_cooler: "💧 Water break",
  toilet_stall: "🚻 Restroom break",
  urinal: "🚻 Restroom break",
  vanity: "🧼 Washing hands",
  pantry_counter: "🍱 Heating up lunch",
};

function activityText(ag: Agent, status: EmployeeStatus | undefined, seatKind: string | undefined, furnitureType?: string, task?: string | null): string | null {
  if (ag.pose === "held") return "😮 Whoa!";
  if (status === "error") return "⚠️ Needs attention";
  if (status === "waiting_approval") return "✋ Needs your approval";
  if (status === "waiting_data") return "⏳ Waiting for data";
  if (ag.intent === "meeting") return seatKind === "meeting" && ag.pose === "sit" ? "📋 In meeting" : "🚶 Off to the meeting";
  if (ag.intent === "break") return ag.pose === "walk" ? "🚶 Taking a break" : (furnitureType && BREAK_TEXT[furnitureType]) || "☕ On a break";
  if (ag.intent === "summoned") return ag.pose === "walk" ? "📨 Coming to see you" : "📨 Here to report";
  if (status === "working") return task ? `${taskEmoji(task)} ${task.length > 34 ? task.slice(0, 33) + "…" : task}` : "⌨️ Working on a task";
  if (ag.gesture === "talk") return "💬 Chatting";
  if (ag.intent === "desk" && ag.pose === "walk") return "🚶 Heading back to desk";
  return null;
}

export type Theme = "raya" | "cny" | "deepavali" | "kobe";

type Uniform = "wgs" | "marketing" | "finance" | "amare" | "artides";
const UNIFORM_OF: Record<string, Uniform> = { "dept-wgs": "wgs", "dept-marketing": "marketing", "dept-finance": "finance", "dept-amare": "amare", "dept-artides": "artides" };
/** Team uniforms: WGS navy polo, Marketing pink hoodie, Finance shirt & tie, Amare teal smart casual, Artides apron. Dresses and kurung keep their cut. */
function uniformed(a: Appearance, u: Uniform): Appearance {
  const skirt = a.outfit === "kurung" || a.outfit === "dress";
  const cut = (o: Appearance["outfit"]) => (skirt ? a.outfit : o);
  switch (u) {
    case "wgs":
      return { ...a, shirt: "#1e3a5f", pants: "#0f172a", outfit: cut("polo") };
    case "marketing":
      return { ...a, shirt: "#ec4899", pants: "#1f2937", outfit: cut("hoodie") };
    case "finance":
      return { ...a, shirt: "#f8fafc", pants: "#334155", outfit: cut("shirt") };
    case "amare":
      return { ...a, shirt: "#0f766e", pants: "#1f2937", outfit: cut("blazer") };
    case "artides":
      return { ...a, shirt: "#e7e5e4", pants: "#57534e", outfit: cut("shirt") };
  }
}

/** A stand-in agent for the character-creator preview (no simulation). */
const PREVIEW_AGENT = {
  id: "preview", isCEO: false, x: 0, z: 0, y: 0, heading: 0, pose: "stand", gesture: "idle", intent: "desk", homeSeatId: null, seatId: null,
  path: [], pathIdx: 0, arrival: null, glide: null, timer: 0, breakIn: 0, stuckClock: 0, lastX: 0, lastZ: 0, walkPhase: 0, lookAt: null, working: false, waveT: 0,
} as unknown as Agent;

/** Festive outfits: recolour the base look; extra pieces (songkok, sampin, sash, jersey number) are added in the model. */
function themed(a: Appearance, theme: Theme | null | undefined, female: boolean): Appearance {
  if (!theme) return a;
  const pick = <T,>(list: T[]) => list[(a.skin.charCodeAt(2) + a.hair.charCodeAt(3)) % list.length];
  switch (theme) {
    case "raya":
      return female
        ? { ...a, outfit: "kurung", shirt: pick(["#f9a8d4", "#5eead4", "#c4b5fd", "#fcd34d"]), pants: "#1e293b" }
        : { ...a, outfit: "shirt", shirt: pick(["#6ee7b7", "#93c5fd", "#fde68a", "#e9d5ff"]), pants: pick(["#6ee7b7", "#93c5fd", "#fde68a", "#e9d5ff"]) };
    case "cny":
      return female ? { ...a, outfit: "dress", shirt: "#dc2626", pants: "#1f2937" } : { ...a, outfit: "polo", shirt: "#dc2626", pants: "#1f2937" };
    case "deepavali":
      return female ? { ...a, outfit: "dress", shirt: pick(["#be185d", "#7c3aed", "#ea580c"]), pants: "#1f2937" } : { ...a, outfit: "shirt", shirt: pick(["#f59e0b", "#fbbf24", "#f97316"]), pants: "#fef3c7" };
    case "kobe":
      return { ...a, outfit: "shirt", shirt: "#552583", pants: "#fdb927" };
  }
}

let jerseyTex: THREE.CanvasTexture | null = null;
function jerseyNumber() {
  if (jerseyTex || typeof document === "undefined") return jerseyTex;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#552583";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#fdb927";
  g.font = "900 86px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("24", 64, 70);
  jerseyTex = new THREE.CanvasTexture(c);
  jerseyTex.colorSpace = THREE.SRGBColorSpace;
  return jerseyTex;
}

/** Things people carry or wear because of their job. */
const ROLE: Record<string, { headset?: boolean; headphones?: boolean; vest?: boolean; camera?: boolean; glasses?: boolean; badge?: boolean; carry?: "parcel" | "laptop" | "clipboard" }> = {
  "emp-cs": { headset: true },
  "emp-orders": { vest: true, carry: "parcel" },
  "emp-ads": { carry: "laptop" },
  "emp-cd": { camera: true },
  "emp-video": { camera: true },
  "emp-fin": { glasses: true, carry: "clipboard" },
  "emp-it": { headphones: true },
  "emp-recep": { badge: true },
  "emp-ea": { carry: "clipboard" },
  "emp-mkt-spec": { carry: "laptop" },
  "emp-inv": { carry: "clipboard" },
};
const DRINK = new Set(["coffee_bar", "vending_machine", "water_cooler", "snack_shelf", "bbq", "kitchen_counter"]);
const REST = new Set(["nap_pod", "hammock"]);
const LOUNGE = new Set(["bench", "bean_bag", "sofa", "armchair"]);

export const Character = memo(function Character(props: Props) {
  const { id, appearance: a0, status, isCEO, selected, hovered, showTag, showBubble, dimmed, chibi, theme } = props;
  const female = props.gender === "female" || a0.outfit === "kurung" || a0.outfit === "dress" || a0.hairStyle === "hijab";
  const uni = !theme && props.uniforms && props.dept ? UNIFORM_OF[props.dept] : undefined;
  const a = useMemo(() => (uni ? uniformed(themed(a0, theme, female), uni) : themed(a0, theme, female)), [a0, theme, female, uni]);
  const LEG = chibi ? 0.5 : 1;
  const DROP = chibi ? -(1 - LEG) * (UPPER_LEG + LOWER_LEG) : 0;
  const outfit = a.outfit ?? "shirt";
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lUp = useRef<THREE.Group>(null);
  const rUp = useRef<THREE.Group>(null);
  const lLow = useRef<THREE.Group>(null);
  const rLow = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const lFore = useRef<THREE.Group>(null);
  const rFore = useRef<THREE.Group>(null);
  const badge = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Group>(null);
  const laptop = useRef<THREE.Group>(null);
  const clipboard = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const eyes = useRef<THREE.Group>(null);
  const lBrow = useRef<THREE.Mesh>(null);
  const rBrow = useRef<THREE.Mesh>(null);
  const smile = useRef<THREE.Mesh>(null);
  const frown = useRef<THREE.Mesh>(null);
  const oMouth = useRef<THREE.Mesh>(null);
  const carryRef = useRef<THREE.Group>(null);
  const paddle = useRef<THREE.Group>(null);
  const tumbler = useRef<THREE.Group>(null);
  const tagEl = useRef<HTMLDivElement>(null);
  const emoteEl = useRef<HTMLDivElement>(null);
  const fx = useRef({ blinkAt: 2 + Math.random() * 3, greet: 0, greetCd: 0, seatId: "" as string | null, seatType: undefined as string | undefined });
  const role = (props.role && ROLE[props.role]) || {};
  const smoothed = useRef({ sit: 0, walk: 0, scale: 1 });
  const lastBubble = useRef<string | null>(null);
  const bubbleClock = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);

  const m = useMemo(
    () => ({
      skin: vinyl(a.skin, { gloss: 0.6 }),
      shirt: vinyl(a.shirt),
      shirtDark: vinyl(shade(a.shirt, -0.12)),
      inner: vinyl(outfit === "blazer" ? "#f8fafc" : shade(a.shirt, 0.15)),
      pants: vinyl(a.pants),
      shoes: vinyl("#f8fafc"),
      sole: vinyl("#e2e8f0"),
      sclera: mat("#ffffff", { rough: 0.3 }),
      iris: mat(a.eyeColor ?? IRIS[Math.floor(hashOf(id) * IRIS.length)], { rough: 0.2 }),
      dark: mat("#111827"),
      mouth: mat("#7c2d12"),
      blush: mat("#fb7185", { opacity: 0.45 }),
      brow: mat(a.hairStyle === "hijab" ? "#1f2937" : shade(a.hair, -0.05)),
    }),
    [a.skin, a.shirt, a.pants, a.shoes, a.hair, a.hairStyle, a.eyeColor, outfit, id],
  );
  const statusColor = isCEO ? "#d4a017" : STATUS_META[status ?? "available"].color;
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: isCEO ? "#d4a017" : "#38bdf8", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    [isCEO],
  );

  useFrame(({ clock, camera }, dt) => {
    const sim = getSim();
    const ag = props.preview ? PREVIEW_AGENT : sim.agents.get(id);
    if (!ag || !root.current) return;
    const t = clock.elapsedTime;
    const nowMs = Date.now();
    const mo = useMoments.getState();
    const dancing = nowMs < mo.danceUntil && ag.pose !== "held";
    const cheering = !dancing && nowMs < mo.cheerUntil && ag.pose !== "held";
    const happyMood = (mo.happyUntil[id] ?? 0) > nowMs;
    const klH = klHourNow();
    const evening = klH >= 18.5 || klH < 7;
    const sm = smoothed.current;

    // zoom-aware scale: avatars grow a little when the camera is far out
    const zoom = (camera as THREE.OrthographicCamera).zoom || 30;
    const targetScale = THREE.MathUtils.clamp(30 / zoom, 1, 1.45);
    sm.scale += (targetScale - sm.scale) * Math.min(1, dt * 4);

    root.current.position.set(ag.x, 0, ag.z);
    root.current.rotation.y = props.preview ? Math.sin(t * 0.5) * 0.7 : ag.heading;
    root.current.scale.setScalar(props.preview ? 1 : sm.scale * 1.06);

    const seat = sim.seat(ag.seatId);
    const sitting = ag.pose === "sit" || (ag.glide?.then === "sit" && ag.glide.t > 0.6);
    const walking = ag.pose === "walk" && ag.path.length > 0 && !ag.glide;
    const held = ag.pose === "held";
    const inMeetingSeat = sitting && seat?.kind === "meeting";
    const onBreak = ag.intent === "break" && !walking;
    sm.sit += ((sitting ? 1 : 0) - sm.sit) * Math.min(1, dt * 8);
    sm.walk += ((walking || (ag.glide && ag.glide.then !== "sit") ? 1 : 0) - sm.walk) * Math.min(1, dt * 8);

    // what they're doing on a break (which piece of furniture they're at), cached per seat
    const f = fx.current;
    if (f.seatId !== ag.seatId) {
      f.seatId = ag.seatId;
      f.seatType = seat ? sim.layout.furniture.find((x) => x.id === seat.furnitureId)?.type : undefined;
    }
    const arrived = !walking && !ag.glide;
    const act = onBreak && arrived ? f.seatType : undefined;
    // a quick wave when passing a colleague in the corridor
    f.greet = Math.max(0, f.greet - dt);
    f.greetCd -= dt;
    if (walking && f.greetCd <= 0) {
      for (const o of sim.agents.values()) {
        if (o.id !== id && o.pose === "walk" && Math.hypot(o.x - ag.x, o.z - ag.z) < 1.4) {
          f.greet = 1.1;
          f.greetCd = 14;
          break;
        }
      }
    }
    // reacting to the CEO walking past: look up, a wave, sit up straight
    let ceoYaw = 0;
    let ceoNear = false;
    if (!isCEO && !props.preview && !walking && !held) {
      for (const o of sim.agents.values()) {
        if (!o.isCEO) continue;
        const dx = o.x - ag.x;
        const dz = o.z - ag.z;
        if (Math.hypot(dx, dz) < 2.3) {
          ceoNear = true;
          let ang = Math.atan2(dx, dz) - ag.heading;
          ang = Math.atan2(Math.sin(ang), Math.cos(ang));
          ceoYaw = THREE.MathUtils.clamp(ang, -1.1, 1.1);
          if (f.greetCd <= 0) {
            f.greet = 1.2;
            f.greetCd = 25;
          }
        }
        break;
      }
    }
    const carrying = walking && !held && role.carry ? role.carry : null;

    const phase = ag.walkPhase * (ag.isCEO ? 9.5 : 8.5);
    const swing = Math.sin(phase) * (happyMood ? 0.7 : evening ? 0.35 : 0.55) * sm.walk;
    const bob = Math.abs(Math.cos(phase)) * (happyMood ? 0.11 : evening ? 0.02 : 0.04) * sm.walk;

    // jump shot at the hoop: crouch, jump, release
    const shot = act === "hoop" ? ((t + id.length * 0.37) / 1.6) % 1 : -1;
    const crouch = shot >= 0 && shot < 0.3 ? Math.sin((shot / 0.3) * Math.PI) * 0.12 : 0;
    const jump = shot >= 0.3 && shot < 0.6 ? Math.sin(((shot - 0.3) / 0.3) * Math.PI) * 0.28 : 0;
    if (hips.current) hips.current.position.y = THREE.MathUtils.lerp(HIP_Y, SEAT_HIP_Y, sm.sit) + bob - crouch;
    // shorter chibi legs: lower the body while standing, but keep the seat height when sitting
    const typingNow = (ag.gesture === "type" || (sitting && ag.working)) && !dancing;
    const extraHop =
      (dancing && !sitting ? Math.abs(Math.sin(t * 7)) * 0.1 : 0) +
      (cheering && !sitting ? Math.abs(Math.sin(t * 9 + id.length)) * 0.16 : 0) +
      (typingNow ? Math.abs(Math.sin(t * 3.2 + id.length)) * 0.012 : 0);
    if (body.current) body.current.position.y = ag.y + jump + extraHop + DROP * (1 - sm.sit);

    // legs
    const sitUp = (-Math.PI / 2) * sm.sit;
    const dangle = held ? Math.sin(t * 7) * 0.35 : 0;
    if (lUp.current) lUp.current.rotation.x = sitUp + swing + dangle;
    if (rUp.current) rUp.current.rotation.x = sitUp - swing - dangle;
    if (lLow.current) lLow.current.rotation.x = (Math.PI / 2) * sm.sit + Math.max(0, -Math.sin(phase)) * 0.7 * sm.walk;
    if (rLow.current) rLow.current.rotation.x = (Math.PI / 2) * sm.sit + Math.max(0, Math.sin(phase)) * 0.7 * sm.walk;

    // arms
    const typing = ag.gesture === "type" || (sitting && ag.working);
    const talking = ag.gesture === "talk";
    const waving = ag.waveT > 0 || f.greet > 0;
    const deskStretch = sitting && !typing && !inMeetingSeat && (t * 0.11 + id.length * 0.7) % 7 < 0.3;
    const stretching = (onBreak && !sitting && Math.sin(t * 0.5 + id.length) > 0.82) || deskStretch;
    let la = -swing * 0.9;
    let ra = swing * 0.9;
    let lf = -0.15;
    let rf = -0.15;
    let lz = -0.06;
    let rz = 0.06;
    if (sitting) {
      la = -0.45;
      ra = -0.45;
      lf = -0.9;
      rf = -0.9;
      if (typing || inMeetingSeat) {
        lf += Math.sin(t * 18) * (typing ? 0.08 : 0.01);
        rf += Math.cos(t * 17) * (typing ? 0.08 : 0.01);
      }
    }
    const drinking = onBreak && !sitting && (!act || DRINK.has(act));
    if (drinking) {
      // holding a cup, taking a sip now and then
      const sip = Math.max(0, Math.sin(t * 0.9 + id.length)) > 0.93;
      ra = sip ? -1.9 : -0.5;
      rf = sip ? -1.7 : -1.3;
    }
    if (act === "hoop") {
      const up = shot >= 0.25 && shot < 0.65;
      la = up ? -2.9 : -0.7;
      ra = up ? -2.9 : -0.7;
      lf = up ? -0.5 : -1.2;
      rf = up ? -0.5 : -1.2;
    } else if (act === "ping_pong") {
      ra = -0.9 + Math.sin(t * 5.2 + id.length) * 0.5;
      rz = 0.35 + Math.sin(t * 5.2 + id.length) * 0.45;
      rf = -0.8;
      la = -0.4;
      lf = -0.9;
    } else if (act === "foosball") {
      la = -1.2 + Math.sin(t * 9) * 0.08;
      ra = -1.2 + Math.cos(t * 8) * 0.08;
      lf = -0.35;
      rf = -0.35;
    } else if (act === "arcade") {
      la = -1.0;
      ra = -1.0 + Math.sin(t * 16) * 0.06;
      lf = -0.6;
      rf = -0.6 + Math.cos(t * 19) * 0.08;
    }
    if (carrying === "parcel") {
      la = -0.95;
      ra = -0.95;
      lf = -0.75;
      rf = -0.75;
      lz = -0.25;
      rz = 0.25;
    } else if (carrying === "laptop") {
      ra = -0.15;
      rf = -0.2;
      rz = 0.18;
    } else if (carrying === "clipboard") {
      la = -0.45;
      lf = -1.2;
    }
    if (ag.intent === "summoned") {
      la = -0.4;
      lf = -1.2;
    }
    if (talking) {
      ra = -0.6 + Math.sin(t * 3) * 0.25;
      rf = -1.0 + Math.sin(t * 4.3) * 0.3;
      rz = -0.2;
    }
    if (stretching) {
      la = -2.9;
      ra = -2.9;
      lf = -0.3;
      rf = -0.3;
      lz = -0.2;
      rz = 0.2;
    }
    if (waving) {
      ra = -2.7;
      rz = 0.35 + Math.sin(t * 12) * 0.35;
      rf = -0.4;
    }
    if (dancing) {
      la = -2.3 + Math.sin(t * 7) * 0.6;
      ra = -2.3 - Math.sin(t * 7) * 0.6;
      lf = -0.5;
      rf = -0.5;
      lz = -0.45 + Math.sin(t * 3.5) * 0.2;
      rz = 0.45 + Math.sin(t * 3.5) * 0.2;
    } else if (cheering) {
      la = -2.8;
      ra = -2.8;
      lf = -0.2;
      rf = -0.2;
      lz = -0.35 - Math.abs(Math.sin(t * 9)) * 0.2;
      rz = 0.35 + Math.abs(Math.sin(t * 9)) * 0.2;
    }
    if (held) {
      la = -2.6 + Math.sin(t * 6) * 0.3;
      ra = -2.6 - Math.sin(t * 6) * 0.3;
      lf = -0.2;
      rf = -0.2;
      lz = -0.3;
      rz = 0.3;
    }
    const k = Math.min(1, dt * 12);
    if (lArm.current) {
      lArm.current.rotation.x += (la - lArm.current.rotation.x) * k;
      lArm.current.rotation.z += (lz - lArm.current.rotation.z) * k;
    }
    if (rArm.current) {
      rArm.current.rotation.x += (ra - rArm.current.rotation.x) * k;
      rArm.current.rotation.z += (rz - rArm.current.rotation.z) * k;
    }
    if (lFore.current) lFore.current.rotation.x += (lf - lFore.current.rotation.x) * k;
    if (rFore.current) rFore.current.rotation.x += (rf - rFore.current.rotation.x) * k;

    // props
    if (cup.current) cup.current.visible = drinking && !stretching;
    if (laptop.current) laptop.current.visible = !!inMeetingSeat;
    if (clipboard.current) clipboard.current.visible = (ag.intent === "summoned" || carrying === "clipboard") && !held;
    if (carryRef.current) {
      carryRef.current.visible = carrying === "parcel" || carrying === "laptop";
      carryRef.current.children.forEach((c) => (c.visible = c.name === carrying));
    }
    if (paddle.current) paddle.current.visible = act === "ping_pong";
    if (tumbler.current) tumbler.current.visible = walking && !carrying && !drinking && !held;

    // torso + head
    const breathe = Math.sin(t * 1.6 + ag.walkPhase) * 0.012;
    const resting = !!act && REST.has(act);
    const lounging = !!act && LOUNGE.has(act);
    const leanTarget =
      (resting ? -0.75 : lounging ? -0.22 : act === "foosball" ? 0.28 : act === "arcade" ? 0.12 : sitting ? 0.05 : sm.walk * 0.06) +
      (ceoNear ? -0.06 : 0) +
      (evening && walking ? 0.08 : 0);
    if (torso.current) {
      torso.current.scale.y = 1 + (resting ? breathe * 2 : breathe);
      torso.current.rotation.x += (leanTarget - torso.current.rotation.x) * Math.min(1, dt * 5);
      const sway = dancing ? Math.sin(t * 3.5) * 0.18 : 0;
      torso.current.rotation.z += (sway - torso.current.rotation.z) * Math.min(1, dt * 8);
    }
    if (head.current) {
      let yaw = 0;
      let pitch = 0;
      if (talking) {
        yaw = Math.sin(t * 1.3) * 0.15;
        pitch = Math.sin(t * 5) * 0.06;
      } else if (inMeetingSeat) {
        // occasional nods while listening
        yaw = Math.sin(t * 0.4 + id.length) * 0.4;
        pitch = Math.max(0, Math.sin(t * 2.2 + id.length * 1.7)) * 0.18 * (Math.sin(t * 0.3 + id.length) > 0.3 ? 1 : 0);
      } else if (sitting && !typing) yaw = Math.sin(t * 0.35 + id.length) * 0.35;
      else if (held) pitch = -0.3;
      else if (waving) pitch = -0.08;
      if (resting) pitch = -0.35;
      else if (act === "hoop") pitch = -0.25;
      if (ceoNear) {
        yaw = ceoYaw;
        pitch = -0.1;
      }
      if (dancing) {
        yaw = Math.sin(t * 3.5) * 0.3;
        pitch = Math.sin(t * 7) * 0.08;
      } else if (useMusic.getState().playing && !walking && !held && !resting) pitch += Math.sin(t * 5.2 + id.length) * 0.05;
      head.current.rotation.y = yaw;
      head.current.rotation.x = pitch;
    }

    // ── face: blink, mood, talking ──
    const worried = status === "waiting_approval" || status === "error" || status === "waiting_data";
    const happy = waving || dancing || happyMood || act === "hoop" || act === "ping_pong" || act === "foosball" || act === "arcade" || status === "task_completed";
    const mouthOpen = held || cheering || (talking && Math.sin(t * 14) > 0) || jump > 0.15;
    if (t > f.blinkAt + 0.13) f.blinkAt = t + 2.4 + ((id.length * 7 + Math.floor(t)) % 10) * 0.35;
    const blinking = t > f.blinkAt;
    if (eyes.current) eyes.current.scale.y = resting ? 0.12 : blinking ? 0.15 : happy ? 0.8 : 1;
    if (lBrow.current && rBrow.current) {
      // inner ends up = worried; slight default tilt = friendly
      const tilt = worried ? 0.38 : 0.12;
      lBrow.current.rotation.z = tilt;
      rBrow.current.rotation.z = -tilt;
      const lift = happy ? 0.012 : worried ? 0.006 : 0;
      lBrow.current.position.y = BROW_Y + lift;
      rBrow.current.position.y = BROW_Y + lift;
    }
    if (smile.current) {
      smile.current.visible = !worried && !mouthOpen;
      const sc = resting ? 0.55 : happy ? 1.35 : 1;
      smile.current.scale.set(sc, sc, 1);
    }
    if (frown.current) frown.current.visible = worried && !mouthOpen;
    if (oMouth.current) oMouth.current.visible = mouthOpen;
    if (badge.current) {
      badge.current.position.y = (sitting ? 1.65 : 2.05) + (chibi ? 0.22 : 0) + ag.y + Math.sin(t * 2 + id.length) * 0.04;
      badge.current.rotation.y = t * 1.5;
    }
    // name tag: hide the name when zoomed far out; emote above it
    if (tagEl.current) tagEl.current.dataset.far = zoom < 22 ? "1" : "0";
    if (emoteEl.current) {
      const em = mo.emotes[id];
      const want = em && em.until > nowMs ? em.emoji : cheering ? "🎉" : dancing ? "🎵" : resting ? "💤" : "";
      if (emoteEl.current.textContent !== want) {
        emoteEl.current.textContent = want;
        emoteEl.current.style.display = want ? "block" : "none";
      }
    }
    if (ringRef.current) {
      const sc = 1 - Math.min(0.6, ag.y * 0.35);
      ringRef.current.scale.set(sc, sc, 1);
    }

    // activity bubble (throttled React update)
    bubbleClock.current -= dt;
    if (bubbleClock.current <= 0) {
      bubbleClock.current = 0.4;
      const next = isCEO || props.preview ? null : activityText(ag, status, seat?.kind, seat ? getSim().layout.furniture.find((f) => f.id === seat.furnitureId)?.type : undefined, props.task);
      if (next !== lastBubble.current) {
        lastBubble.current = next;
        setBubble(next);
      }
    }
  });

  const skirt = outfit === "kurung" || outfit === "dress";
  const longTop = outfit === "kurung" || outfit === "hoodie";

  return (
    <group
      ref={root}
      onPointerDown={props.onPointerDown}
      onClick={props.onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        props.onHover?.(true);
      }}
      onPointerOut={() => props.onHover?.(false)}
    >
      {(selected || hovered) && (
        <mesh ref={ringRef} geometry={RING} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={selected ? 1 : 0.85} />
      )}
      <mesh position={[0, 0.9, 0]} scale={[0.6, 1.8, 0.6]} geometry={BOX} material={HIT_MAT} />
      <mesh geometry={BLOB_GEO} material={BLOB_MAT} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} scale={0.75} renderOrder={-1} />
      <group ref={body} position={[0, DROP, 0]}>
        <group ref={hips} position={[0, HIP_Y, 0]}>
          {/* legs */}
          {[
            [lUp, lLow, -0.1],
            [rUp, rLow, 0.1],
          ].map(([up, low, x], i) => (
            <group key={i} ref={up as React.RefObject<THREE.Group>} position={[x as number, 0, 0]} scale={[1, LEG, 1]}>
              <Limb len={UPPER_LEG} w={chibi ? 0.17 : 0.145} m={m.pants} />
              <group ref={low as React.RefObject<THREE.Group>} position={[0, -UPPER_LEG + 0.04, 0]}>
                <Limb len={LOWER_LEG} w={skirt ? 0.1 : chibi ? 0.16 : 0.125} m={skirt ? m.skin : m.pants} />
                {/* round toy sneakers */}
                <mesh geometry={SPH} material={m.shoes} position={[0, -LOWER_LEG + 0.06, 0.04]} scale={chibi ? [0.18, 0.28, 0.25] : [0.17, 0.13, 0.24]} castShadow />
                <mesh geometry={CYL} material={m.sole} position={[0, -LOWER_LEG - 0.005, 0.04]} scale={[0.16, 0.03, 0.22]} />
              </group>
            </group>
          ))}
          {/* pelvis / skirt */}
          {skirt ? (
            <mesh geometry={SKIRT} material={outfit === "kurung" ? m.shirtDark : m.shirt} position={[0, -0.12, 0]} scale={[0.4, 0.36, 0.28]} castShadow />
          ) : (
            !chibi && <mesh geometry={BOX} material={m.pants} position={[0, 0.02, 0]} scale={[0.34, 0.16, 0.2]} castShadow />
          )}
          {/* torso */}
          <group ref={torso} position={[0, 0.05, 0]}>
            <mesh geometry={CAP} material={outfit === "blazer" ? m.inner : m.shirt} position={[0, chibi ? -0.01 : 0.25, 0]} scale={chibi ? [0.42, 0.28, 0.24] : [0.4, 0.2, 0.26]} castShadow />
            {outfit === "blazer" && (
              <>
                {/* jacket panels open at the front */}
                <mesh geometry={BOX} material={m.shirt} position={[-0.11, 0.25, 0.005]} scale={[0.15, 0.48, 0.225]} castShadow />
                <mesh geometry={BOX} material={m.shirt} position={[0.11, 0.25, 0.005]} scale={[0.15, 0.48, 0.225]} castShadow />
                <mesh geometry={BOX} material={m.shirt} position={[0, 0.25, -0.06]} scale={[0.36, 0.48, 0.1]} castShadow />
                <mesh geometry={BOX} material={isCEO ? mat("#b91c1c") : m.shirtDark} position={[0, 0.3, 0.112]} scale={[0.045, 0.26, 0.01]} />
              </>
            )}
            {outfit === "polo" && <mesh geometry={BOX} material={m.shirtDark} position={[0, 0.5, 0.05]} scale={[0.22, 0.04, 0.14]} />}
            {outfit === "hoodie" && (
              <>
                <mesh geometry={SPH} material={m.shirtDark} position={[0, 0.5, -0.1]} scale={[0.3, 0.18, 0.16]} castShadow />
                <mesh geometry={BOX} material={m.shirtDark} position={[0, 0.12, 0.11]} scale={[0.22, 0.1, 0.02]} />
              </>
            )}
            {longTop && <mesh geometry={SKIRT} material={m.shirt} position={[0, 0.0, 0]} scale={[0.39, 0.2, 0.25]} castShadow />}
            {theme === "raya" && !female && (
              <>
                {/* baju Melayu: long top + songket sampin */}
                <mesh geometry={SKIRT} material={m.shirt} position={[0, 0.02, 0]} scale={[0.39, 0.22, 0.25]} castShadow />
                <mesh geometry={SKIRT} material={mat("#7c2d12", { rough: 0.5 })} position={[0, -0.1, 0]} scale={[0.4, 0.18, 0.27]} castShadow />
                <mesh geometry={BOX} material={mat("#d4a017", { metal: 0.5 })} position={[0, -0.02, 0.13]} scale={[0.3, 0.02, 0.01]} />
              </>
            )}
            {theme === "deepavali" && !female && <mesh geometry={SKIRT} material={m.shirt} position={[0, -0.04, 0]} scale={[0.39, 0.3, 0.25]} castShadow />}
            {theme === "deepavali" && female && (
              <mesh geometry={BOX} material={mat("#d4a017", { metal: 0.4 })} position={[0.02, 0.3, 0.115]} rotation={[0, 0, 0.75]} scale={[0.08, 0.52, 0.01]} />
            )}
            {theme === "cny" && <mesh geometry={BOX} material={mat("#d4a017", { metal: 0.5 })} position={[0, 0.5, 0.06]} scale={[0.2, 0.03, 0.12]} />}
            {theme === "kobe" && (
              <>
                <mesh position={[0, 0.27, 0.112]} scale={[0.17, 0.17, 1]}>
                  <planeGeometry />
                  <meshStandardMaterial map={jerseyNumber()} roughness={0.8} />
                </mesh>
                <mesh geometry={BOX} material={mat("#fdb927")} position={[0, 0.49, 0.06]} scale={[0.24, 0.025, 0.14]} />
              </>
            )}
            {isCEO && !theme && <mesh geometry={BOX} material={mat("#d4a017", { metal: 0.8, rough: 0.2 })} position={[0, 0.34, 0.118]} scale={[0.06, 0.012, 0.006]} />}
            {uni === "wgs" && (
              <group position={[-0.09, 0.08, 0.122]}>
                <mesh geometry={CYL} material={mat("#38bdf8", { rough: 0.3 })} rotation={[Math.PI / 2, 0, 0]} scale={[0.07, 0.01, 0.07]} />
                <mesh geometry={CYL} material={mat("#f8fafc")} position={[0, 0, 0.006]} rotation={[Math.PI / 2, 0, 0]} scale={[0.035, 0.008, 0.035]} />
              </group>
            )}
            {uni === "finance" && !skirt && (
              <group>
                <mesh geometry={BOX} material={vinyl("#b91c1c")} position={[0, 0.02, 0.124]} scale={[0.045, 0.2, 0.012]} />
                <mesh geometry={BOX} material={vinyl("#991b1b")} position={[0, 0.13, 0.126]} rotation={[0, 0, Math.PI / 4]} scale={[0.04, 0.04, 0.012]} />
              </group>
            )}
            {uni === "artides" && (
              <group>
                <mesh geometry={BOX} material={vinyl("#92400e")} position={[0, -0.04, 0.124]} scale={[0.26, 0.34, 0.012]} />
                <mesh geometry={BOX} material={vinyl("#78350f")} position={[0, -0.08, 0.131]} scale={[0.12, 0.08, 0.008]} />
              </group>
            )}
            {/* ID lanyard in the company colour */}
            {!isCEO && props.lanyard && (
              <group>
                <mesh geometry={BOX} material={mat(props.lanyard)} position={[-0.055, 0.4, 0.112]} rotation={[0, 0, -0.35]} scale={[0.018, 0.2, 0.006]} />
                <mesh geometry={BOX} material={mat(props.lanyard)} position={[0.055, 0.4, 0.112]} rotation={[0, 0, 0.35]} scale={[0.018, 0.2, 0.006]} />
                <mesh geometry={BOX} material={mat("#f8fafc")} position={[0, 0.25, 0.118]} scale={[0.065, 0.085, 0.008]} />
                <mesh geometry={BOX} material={mat(props.lanyard)} position={[0, 0.275, 0.123]} scale={[0.065, 0.02, 0.004]} />
              </group>
            )}
            {role.vest && (
              <group>
                <mesh geometry={BOX} material={mat("#a3e635", { emissive: "#a3e635", ei: 0.25 })} position={[-0.1, 0.27, 0.105]} scale={[0.07, 0.42, 0.012]} />
                <mesh geometry={BOX} material={mat("#a3e635", { emissive: "#a3e635", ei: 0.25 })} position={[0.1, 0.27, 0.105]} scale={[0.07, 0.42, 0.012]} />
                <mesh geometry={BOX} material={mat("#e5e7eb", { emissive: "#ffffff", ei: 0.3 })} position={[0, 0.16, 0.112]} scale={[0.36, 0.025, 0.006]} />
              </group>
            )}
            {role.camera && (
              <group position={[0.07, 0.2, 0.135]}>
                <mesh geometry={BOX} material={mat("#111827")} scale={[0.11, 0.07, 0.05]} />
                <mesh geometry={CYL} material={mat("#1f2937")} position={[0, 0, 0.035]} rotation={[Math.PI / 2, 0, 0]} scale={[0.045, 0.04, 0.045]} />
                <mesh geometry={BOX} material={mat("#111827")} position={[-0.09, 0.15, -0.02]} rotation={[0, 0, -0.5]} scale={[0.012, 0.32, 0.006]} />
              </group>
            )}
            {role.badge && <mesh geometry={BOX} material={mat("#d4a017", { metal: 0.7, rough: 0.3 })} position={[-0.09, 0.36, 0.115]} scale={[0.07, 0.03, 0.008]} />}
            {/* carried items while walking */}
            <group ref={carryRef} visible={false}>
              <group name="parcel" position={[0, 0.22, 0.27]}>
                <mesh geometry={BOX} material={mat("#c69c6d")} scale={[0.26, 0.18, 0.2]} castShadow />
                <mesh geometry={BOX} material={mat("#ee4d2d")} position={[0, 0.091, 0]} scale={[0.26, 0.004, 0.05]} />
              </group>
              <group name="laptop" position={[0.27, 0.2, 0.02]} rotation={[0, 0, 0.1]}>
                <mesh geometry={BOX} material={mat("#94a3b8", { metal: 0.6, rough: 0.3 })} scale={[0.02, 0.2, 0.28]} castShadow />
              </group>
            </group>
            {isCEO && outfit !== "blazer" && !theme && <mesh geometry={BOX} material={mat("#b91c1c")} position={[0, 0.3, 0.11]} scale={[0.05, 0.3, 0.02]} />}
            {/* arms */}
            {[
              [lArm, lFore, chibi ? -0.25 : -0.23],
              [rArm, rFore, chibi ? 0.25 : 0.23],
            ].map(([arm, fore, x], i) => (
              <group key={i} ref={arm as React.RefObject<THREE.Group>} position={[x as number, chibi ? 0.14 : 0.45, 0]} scale={chibi ? [0.95, 0.5, 0.95] : 1}>
                <Limb len={0.3} w={0.105} m={m.shirt} />
                <group ref={fore as React.RefObject<THREE.Group>} position={[0, -0.28, 0]}>
                  <Limb len={0.26} w={0.09} m={outfit === "kurung" || outfit === "blazer" || outfit === "hoodie" ? m.shirt : m.skin} />
                  {/* hand */}
                  <mesh geometry={SPH} material={m.skin} position={[0, -0.27, 0]} scale={[0.12, 0.12, 0.12]} castShadow />
                  {isCEO && i === 0 && <mesh geometry={CYL} material={mat("#d4a017", { metal: 0.9, rough: 0.2 })} position={[0, -0.22, 0]} scale={[0.1, 0.03, 0.1]} />}
                  {!isCEO && i === 0 && a.accessories?.includes("watch") && (
                    <group position={[0, -0.21, 0]}>
                      <mesh geometry={CYL} material={vinyl("#111827")} scale={[0.1, 0.035, 0.1]} />
                      <mesh geometry={CYL} material={mat("#e0f2fe", { rough: 0.1, metal: 0.3 })} position={[0, 0, 0.045]} rotation={[Math.PI / 2, 0, 0]} scale={[0.045, 0.01, 0.045]} />
                    </group>
                  )}
                  {i === 1 && a.accessories?.includes("tumbler") && (
                    <group ref={tumbler} position={[0, -0.33, 0.05]} visible={false}>
                      <mesh geometry={CYL} material={vinyl(shade(a.shirt, 0.2))} scale={[0.07, 0.17, 0.07]} />
                      <mesh geometry={CYL} material={vinyl("#111827")} position={[0, 0.09, 0]} scale={[0.072, 0.03, 0.072]} />
                    </group>
                  )}
                  {i === 1 && (
                    <group ref={paddle} position={[0, -0.33, 0.04]} visible={false}>
                      <mesh geometry={CYL} material={mat("#7c2d12")} scale={[0.025, 0.08, 0.025]} />
                      <mesh geometry={CYL} material={mat("#dc2626")} position={[0, -0.09, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.015, 0.12]} />
                    </group>
                  )}
                  {i === 1 && (
                    <group ref={cup} position={[0, -0.3, 0.06]} visible={false}>
                      <mesh geometry={CYL} material={mat("#f8fafc")} scale={[0.07, 0.09, 0.07]} />
                      <mesh geometry={CYL} material={mat("#78350f")} position={[0, 0.042, 0]} scale={[0.06, 0.01, 0.06]} />
                    </group>
                  )}
                  {i === 0 && (
                    <group ref={clipboard} position={[0, -0.3, 0.06]} rotation={[0.3, 0, 0]} visible={false}>
                      <mesh geometry={BOX} material={mat("#a16207")} scale={[0.17, 0.22, 0.012]} />
                      <mesh geometry={BOX} material={mat("#ffffff")} position={[0, -0.01, 0.008]} scale={[0.14, 0.17, 0.004]} />
                    </group>
                  )}
                </group>
              </group>
            ))}
            {/* neck + head */}
            {!chibi && <mesh geometry={CAP} material={m.skin} position={[0, 0.55, 0]} scale={[0.09, 0.06, 0.09]} />}
            <group ref={head} position={[0, chibi ? 0.59 : 0.75, 0]} scale={chibi ? 2.85 : 1.15}>
              <mesh geometry={SPH} material={m.skin} scale={[0.26, 0.28, 0.255]} castShadow />
              {/* ears */}
              {a.hairStyle !== "hijab" &&
                [-1, 1].map((s) => <mesh key={s} geometry={SPH} material={m.skin} position={[s * 0.125, 0, 0]} scale={[0.04, 0.06, 0.04]} />)}
              <Hair a={a} />
              {/* face — eyes blink / close, brows and mouth follow the mood */}
              <group ref={eyes} position={[0, 0.01, 0]}>
                {[-1, 1].map((sx) => (
                  <group key={sx} position={[sx * 0.047, -0.017, 0.03]} scale={0.88}>
                    {/* big anime-style eyes: white, warm-brown iris, pupil and two catch-lights */}
                    <mesh geometry={SPH} material={m.sclera} position={[0, 0, 0.106]} scale={[0.06, 0.074, 0.032]} />
                    <mesh geometry={SPH} material={m.iris} position={[0, 0, 0.117]} scale={[0.047, 0.062, 0.022]} />
                    <mesh geometry={SPH} material={m.dark} position={[0, -0.001, 0.124]} scale={[0.024, 0.034, 0.012]} />
                    <mesh geometry={SPH} material={m.sclera} position={[0.013, 0.014, 0.131]} scale={0.019} />
                    <mesh geometry={SPH} material={m.sclera} position={[-0.011, -0.02, 0.129]} scale={0.009} />
                    {/* thin upper lid, plus lashes for the ladies */}
                    <mesh geometry={BOX} material={m.dark} position={[0, 0.04, 0.113]} rotation={[0, 0, sx * -0.1]} scale={[0.054, 0.005, 0.01]} />
                    {female && <mesh geometry={BOX} material={m.dark} position={[sx * 0.033, 0.038, 0.114]} rotation={[0, 0, sx * 0.75]} scale={[0.026, 0.006, 0.008]} />}
                  </group>
                ))}
              </group>
              <mesh ref={lBrow} geometry={BOX} material={m.brow} position={[-0.05, BROW_Y, 0.118]} rotation={[0, 0, 0.12]} scale={[0.034, 0.009, 0.012]} />
              <mesh ref={rBrow} geometry={BOX} material={m.brow} position={[0.05, BROW_Y, 0.118]} rotation={[0, 0, -0.12]} scale={[0.034, 0.009, 0.012]} />
              <group position={[0, -0.033, 0.061]} scale={0.5}>
                <mesh ref={smile} geometry={MOUTH} material={m.mouth} position={[0, -0.055, 0.118]} rotation={[0, 0, Math.PI]} />
                <mesh ref={frown} geometry={MOUTH} material={m.mouth} position={[0, -0.07, 0.118]} visible={false} />
                <mesh ref={oMouth} geometry={SPH} material={m.mouth} position={[0, -0.058, 0.118]} scale={[0.026, 0.03, 0.012]} visible={false} />
              </group>
              {theme === "raya" && !female && a.hairStyle !== "hijab" && (
                <mesh geometry={CYL} material={mat("#111827", { rough: 0.6 })} position={[0, 0.11, -0.005]} scale={[0.25, 0.1, 0.24]} castShadow />
              )}
              {/* role accessories on the head */}
              {role.headset && (
                <group>
                  <mesh geometry={BAND} material={m.dark} position={[0, 0.0, 0]} />
                  <mesh geometry={CYL} material={m.dark} position={[0.138, -0.005, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.07, 0.03, 0.07]} />
                  <mesh geometry={CYL} material={m.dark} position={[-0.138, -0.005, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.07, 0.03, 0.07]} />
                  <mesh geometry={BOX} material={m.dark} position={[0.1, -0.06, 0.07]} rotation={[0, -0.9, 0.3]} scale={[0.012, 0.012, 0.12]} />
                  <mesh geometry={SPH} material={mat("#ec4899")} position={[0.05, -0.075, 0.115]} scale={0.018} />
                </group>
              )}
              {role.headphones && (
                <group>
                  <mesh geometry={BAND} material={mat("#16a34a")} position={[0, 0.0, 0]} scale={[1.05, 1.05, 1.6]} />
                  <mesh geometry={CYL} material={mat("#0f172a")} position={[0.145, -0.005, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.05, 0.1]} />
                  <mesh geometry={CYL} material={mat("#0f172a")} position={[-0.145, -0.005, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.05, 0.1]} />
                </group>
              )}
              <mesh geometry={SPH} material={m.blush} position={[-0.072, -0.045, 0.104]} scale={[0.03, 0.017, 0.01]} />
              <mesh geometry={SPH} material={m.blush} position={[0.072, -0.045, 0.104]} scale={[0.03, 0.017, 0.01]} />
              {(a.glasses || role.glasses) && (
                <group position={[0, 0.015, 0.128]}>
                  <mesh geometry={TORUS} material={m.dark} position={[-0.052, 0, 0]} scale={[0.34, 0.34, 0.3]} />
                  <mesh geometry={TORUS} material={m.dark} position={[0.052, 0, 0]} scale={[0.34, 0.34, 0.3]} />
                </group>
              )}
            </group>
          </group>
        </group>
        {/* laptop on the meeting table */}
        <group ref={laptop} position={[0, 0.78, 0.5]} visible={false}>
          <mesh geometry={BOX} material={mat("#cbd5e1", { metal: 0.6, rough: 0.3 })} scale={[0.3, 0.015, 0.21]} />
          <mesh geometry={BOX} material={mat("#94a3b8", { metal: 0.6, rough: 0.3 })} position={[0, 0.1, 0.1]} rotation={[-0.25, 0, 0]} scale={[0.3, 0.2, 0.012]} />
          <mesh position={[0, 0.1, 0.092]} rotation={[-0.25 + Math.PI, 0, Math.PI]} scale={[0.27, 0.17, 1]}>
            <planeGeometry />
            <meshBasicMaterial color="#60a5fa" toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* name tag (photo · name · status) with the activity bubble and emotes above it */}
      <group ref={badge} position={[0, 2.05, 0]}>
        {!dimmed && !props.preview && (
          <Html center position={[0, 0.12, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
            <div ref={tagEl} className="ov-tag flex flex-col items-center gap-0.5" data-far="0">
              <div ref={emoteEl} className="ov-emote text-[22px] leading-none drop-shadow" style={{ display: "none" }} />
              {showBubble && bubble && (
                <div className="ov-bubble anim-up relative max-w-[220px] truncate whitespace-nowrap rounded-xl bg-white px-2 py-0.5 text-[11px] font-medium text-[#0f172a] shadow-md ring-1 ring-black/5">
                  {bubble}
                </div>
              )}
              <div
                className={`flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-white shadow-lg backdrop-blur ${isCEO ? "bg-[#7c5a0a]/90 ring-1 ring-[#fbbf24]" : "bg-[#0f172a]/80"}`}
              >
                {props.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={props.photo} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/70" />
                ) : (
                  <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold ring-1 ring-white/70" style={{ background: "#0f172a", color: "#fff" }}>
                    {isCEO ? "👑" : initialsOf(props.name)}
                  </span>
                )}
                {(showTag || hovered || selected) && (
                  <span className="ov-tag-name">
                    {props.star ? <span className="mr-0.5">{props.star === 1 ? "🥇" : props.star === 2 ? "🥈" : "🥉"}</span> : null}
                    {isCEO ? props.name : (props.name ?? "").split(" ")[0]}
                    {(hovered || selected) && props.title && <span className="ml-1 font-normal text-[#cbd5e1]">· {props.title}</span>}
                  </span>
                )}
                {!isCEO && <span className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor }} />}
              </div>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
});
