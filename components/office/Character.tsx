"use client";

import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Appearance, EmployeeStatus } from "@/lib/data/types";
import { STATUS_META } from "@/lib/data/types";
import type { Agent } from "@/lib/office/sim";
import { getSim } from "@/lib/office/runtime";
import { mat } from "./materials";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CAP = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
const SPH = new THREE.SphereGeometry(0.5, 20, 16);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const SKIRT = new THREE.CylinderGeometry(0.5, 0.62, 1, 16);
const TORUS = new THREE.TorusGeometry(0.11, 0.025, 8, 24);
const MOUTH = new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI);
const RING = new THREE.RingGeometry(0.42, 0.5, 32);
const HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

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
  selected?: boolean;
  hovered?: boolean;
  showTag?: boolean;
  showBubble?: boolean;
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onHover?: (on: boolean) => void;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

function Hair({ a }: { a: Appearance }) {
  const m = mat(a.hair, { rough: 0.8 });
  switch (a.hairStyle) {
    case "hijab":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.01, -0.01]} scale={[0.3, 0.31, 0.3]} castShadow />
          <mesh geometry={CAP} material={m} position={[0, -0.14, -0.02]} scale={[0.3, 0.07, 0.27]} castShadow />
          <mesh geometry={SKIRT} material={m} position={[0, -0.2, -0.01]} scale={[0.3, 0.12, 0.26]} castShadow />
        </group>
      );
    case "long":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.03, -0.015]} scale={[0.29, 0.28, 0.29]} castShadow />
          <mesh geometry={BOX} material={m} position={[0, -0.12, -0.08]} scale={[0.27, 0.34, 0.13]} castShadow />
        </group>
      );
    case "bob":
      return <mesh geometry={SPH} material={m} position={[0, 0.0, -0.02]} scale={[0.3, 0.3, 0.29]} castShadow />;
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
};

function activityText(ag: Agent, status: EmployeeStatus | undefined, seatKind: string | undefined, furnitureType?: string): string | null {
  if (ag.pose === "held") return "😮 Whoa!";
  if (status === "error") return "⚠️ Needs attention";
  if (status === "waiting_approval") return "✋ Needs your approval";
  if (status === "waiting_data") return "⏳ Waiting for data";
  if (ag.intent === "meeting") return seatKind === "meeting" && ag.pose === "sit" ? "📋 In meeting" : "🚶 Off to the meeting";
  if (ag.intent === "break") return ag.pose === "walk" ? "🚶 Taking a break" : (furnitureType && BREAK_TEXT[furnitureType]) || "☕ On a break";
  if (ag.intent === "summoned") return ag.pose === "walk" ? "📨 Coming to see you" : "📨 Here to report";
  if (status === "working") return "⌨️ Working on a task";
  if (ag.gesture === "talk") return "💬 Chatting";
  if (ag.intent === "desk" && ag.pose === "walk") return "🚶 Heading back to desk";
  return null;
}

export const Character = memo(function Character(props: Props) {
  const { id, appearance: a, status, isCEO, selected, hovered, showTag, showBubble, dimmed } = props;
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
  const smoothed = useRef({ sit: 0, walk: 0, scale: 1 });
  const lastBubble = useRef<string | null>(null);
  const bubbleClock = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);

  const m = useMemo(
    () => ({
      skin: mat(a.skin, { rough: 0.6 }),
      shirt: mat(a.shirt, { rough: 0.8 }),
      shirtDark: mat(shade(a.shirt, -0.12), { rough: 0.8 }),
      inner: mat(outfit === "blazer" ? "#f8fafc" : shade(a.shirt, 0.15), { rough: 0.8 }),
      pants: mat(a.pants, { rough: 0.85 }),
      shoes: mat(a.shoes, { rough: 0.45 }),
      dark: mat("#111827"),
      mouth: mat("#7c2d12"),
      blush: mat("#f472b6", { opacity: 0.35 }),
      brow: mat(a.hairStyle === "hijab" ? "#1f2937" : shade(a.hair, -0.05)),
    }),
    [a.skin, a.shirt, a.pants, a.shoes, a.hair, a.hairStyle, outfit],
  );
  const statusColor = isCEO ? "#d4a017" : STATUS_META[status ?? "available"].color;
  const badgeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: statusColor, emissive: statusColor, emissiveIntensity: 0.9, toneMapped: false }),
    [statusColor],
  );
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: isCEO ? "#d4a017" : "#38bdf8", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    [isCEO],
  );

  useFrame(({ clock, camera }, dt) => {
    const sim = getSim();
    const ag = sim.agents.get(id);
    if (!ag || !root.current) return;
    const t = clock.elapsedTime;
    const sm = smoothed.current;

    // zoom-aware scale: avatars grow a little when the camera is far out
    const zoom = (camera as THREE.OrthographicCamera).zoom || 30;
    const targetScale = THREE.MathUtils.clamp(30 / zoom, 1, 1.45);
    sm.scale += (targetScale - sm.scale) * Math.min(1, dt * 4);

    root.current.position.set(ag.x, 0, ag.z);
    root.current.rotation.y = ag.heading;
    root.current.scale.setScalar(sm.scale * 1.06);

    const seat = sim.seat(ag.seatId);
    const sitting = ag.pose === "sit" || (ag.glide?.then === "sit" && ag.glide.t > 0.6);
    const walking = ag.pose === "walk" && ag.path.length > 0 && !ag.glide;
    const held = ag.pose === "held";
    const inMeetingSeat = sitting && seat?.kind === "meeting";
    const onBreak = ag.intent === "break" && !walking;
    sm.sit += ((sitting ? 1 : 0) - sm.sit) * Math.min(1, dt * 8);
    sm.walk += ((walking || (ag.glide && ag.glide.then !== "sit") ? 1 : 0) - sm.walk) * Math.min(1, dt * 8);

    const phase = ag.walkPhase * (ag.isCEO ? 9.5 : 8.5);
    const swing = Math.sin(phase) * 0.55 * sm.walk;
    const bob = Math.abs(Math.cos(phase)) * 0.04 * sm.walk;

    if (hips.current) hips.current.position.y = THREE.MathUtils.lerp(HIP_Y, SEAT_HIP_Y, sm.sit) + bob;
    if (body.current) body.current.position.y = ag.y;

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
    const waving = ag.waveT > 0;
    const stretching = onBreak && !sitting && Math.sin(t * 0.5 + id.length) > 0.82;
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
    if (onBreak && !sitting) {
      // holding a coffee cup
      ra = -0.5;
      rf = -1.3;
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
    if (cup.current) cup.current.visible = onBreak && !sitting && !stretching;
    if (laptop.current) laptop.current.visible = !!inMeetingSeat;
    if (clipboard.current) clipboard.current.visible = ag.intent === "summoned" && !held;

    // torso + head
    const breathe = Math.sin(t * 1.6 + ag.walkPhase) * 0.012;
    if (torso.current) {
      torso.current.scale.y = 1 + breathe;
      torso.current.rotation.x = sitting ? 0.05 : sm.walk * 0.06;
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
      head.current.rotation.y = yaw;
      head.current.rotation.x = pitch;
    }
    if (badge.current) {
      badge.current.position.y = (sitting ? 1.65 : 2.05) + ag.y + Math.sin(t * 2 + id.length) * 0.04;
      badge.current.rotation.y = t * 1.5;
    }
    if (ringRef.current) {
      const sc = 1 - Math.min(0.6, ag.y * 0.35);
      ringRef.current.scale.set(sc, sc, 1);
    }

    // activity bubble (throttled React update)
    bubbleClock.current -= dt;
    if (bubbleClock.current <= 0) {
      bubbleClock.current = 0.4;
      const next = isCEO ? null : activityText(ag, status, seat?.kind, seat ? getSim().layout.furniture.find((f) => f.id === seat.furnitureId)?.type : undefined);
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
      <group ref={body}>
        <group ref={hips} position={[0, HIP_Y, 0]}>
          {/* legs */}
          {[
            [lUp, lLow, -0.1],
            [rUp, rLow, 0.1],
          ].map(([up, low, x], i) => (
            <group key={i} ref={up as React.RefObject<THREE.Group>} position={[x as number, 0, 0]}>
              <Limb len={UPPER_LEG} w={0.145} m={m.pants} />
              <group ref={low as React.RefObject<THREE.Group>} position={[0, -UPPER_LEG + 0.04, 0]}>
                <Limb len={LOWER_LEG} w={skirt ? 0.1 : 0.125} m={skirt ? m.skin : m.pants} />
                <mesh geometry={CAP} material={m.shoes} position={[0, -LOWER_LEG + 0.03, 0.05]} rotation={[Math.PI / 2, 0, 0]} scale={[0.12, 0.13, 0.09]} castShadow />
              </group>
            </group>
          ))}
          {/* pelvis / skirt */}
          {skirt ? (
            <mesh geometry={SKIRT} material={outfit === "kurung" ? m.shirtDark : m.shirt} position={[0, -0.12, 0]} scale={[0.4, 0.36, 0.28]} castShadow />
          ) : (
            <mesh geometry={BOX} material={m.pants} position={[0, 0.02, 0]} scale={[0.34, 0.16, 0.2]} castShadow />
          )}
          {/* torso */}
          <group ref={torso} position={[0, 0.05, 0]}>
            <mesh geometry={CAP} material={outfit === "blazer" ? m.inner : m.shirt} position={[0, 0.27, 0]} scale={[0.36, 0.22, 0.22]} castShadow />
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
            {isCEO && outfit !== "blazer" && <mesh geometry={BOX} material={mat("#b91c1c")} position={[0, 0.3, 0.11]} scale={[0.05, 0.3, 0.02]} />}
            {/* arms */}
            {[
              [lArm, lFore, -0.23],
              [rArm, rFore, 0.23],
            ].map(([arm, fore, x], i) => (
              <group key={i} ref={arm as React.RefObject<THREE.Group>} position={[x as number, 0.47, 0]}>
                <Limb len={0.3} w={0.105} m={m.shirt} />
                <group ref={fore as React.RefObject<THREE.Group>} position={[0, -0.28, 0]}>
                  <Limb len={0.26} w={0.09} m={outfit === "kurung" || outfit === "blazer" || outfit === "hoodie" ? m.shirt : m.skin} />
                  {/* hand */}
                  <mesh geometry={SPH} material={m.skin} position={[0, -0.28, 0]} scale={[0.085, 0.1, 0.075]} castShadow />
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
            <mesh geometry={CAP} material={m.skin} position={[0, 0.55, 0]} scale={[0.09, 0.06, 0.09]} />
            <group ref={head} position={[0, 0.74, 0]}>
              <mesh geometry={SPH} material={m.skin} scale={[0.26, 0.28, 0.255]} castShadow />
              {/* ears */}
              {a.hairStyle !== "hijab" &&
                [-1, 1].map((s) => <mesh key={s} geometry={SPH} material={m.skin} position={[s * 0.125, 0, 0]} scale={[0.04, 0.06, 0.04]} />)}
              <Hair a={a} />
              {/* face */}
              <mesh geometry={SPH} material={m.dark} position={[-0.052, 0.015, 0.118]} scale={[0.032, 0.04, 0.02]} />
              <mesh geometry={SPH} material={m.dark} position={[0.052, 0.015, 0.118]} scale={[0.032, 0.04, 0.02]} />
              <mesh geometry={SPH} material={mat("#ffffff")} position={[-0.046, 0.024, 0.127]} scale={0.01} />
              <mesh geometry={SPH} material={mat("#ffffff")} position={[0.058, 0.024, 0.127]} scale={0.01} />
              <mesh geometry={BOX} material={m.brow} position={[-0.052, 0.06, 0.118]} rotation={[0, 0, 0.12]} scale={[0.045, 0.01, 0.01]} />
              <mesh geometry={BOX} material={m.brow} position={[0.052, 0.06, 0.118]} rotation={[0, 0, -0.12]} scale={[0.045, 0.01, 0.01]} />
              <mesh geometry={SPH} material={m.skin} position={[0, -0.015, 0.128]} scale={[0.028, 0.03, 0.025]} />
              <mesh geometry={MOUTH} material={m.mouth} position={[0, -0.055, 0.118]} rotation={[0, 0, Math.PI]} />
              <mesh geometry={SPH} material={m.blush} position={[-0.075, -0.03, 0.105]} scale={[0.035, 0.022, 0.01]} />
              <mesh geometry={SPH} material={m.blush} position={[0.075, -0.03, 0.105]} scale={[0.035, 0.022, 0.01]} />
              {a.glasses && (
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
      {/* status badge + labels */}
      <group ref={badge} position={[0, 2.05, 0]}>
        <mesh geometry={TORUS} material={badgeMat} rotation={[Math.PI / 2, 0, 0]} scale={isCEO ? 1.25 : 1} />
        <mesh geometry={SPH} material={badgeMat} scale={isCEO ? 0.12 : 0.09} />
        {!dimmed && (showTag || hovered || selected || (showBubble && bubble)) && (
          <Html center position={[0, 0.34, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
            <div className="flex flex-col items-center gap-1">
              {showBubble && bubble && (
                <div className="anim-up relative whitespace-nowrap rounded-xl bg-white px-2 py-0.5 text-[11px] font-medium text-[#0f172a] shadow-md ring-1 ring-black/5">
                  {bubble}
                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
                </div>
              )}
              {(showTag || hovered || selected) && (
                <div className="whitespace-nowrap rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur">
                  {props.name}
                  {props.title && <span className="ml-1 text-[#cbd5e1]">· {props.title}</span>}
                  {status && !isCEO && (
                    <span className="ml-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS_META[status].color }} />
                  )}
                </div>
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
});
