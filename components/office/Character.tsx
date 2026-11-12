"use client";

import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Appearance, EmployeeStatus } from "@/lib/data/types";
import { STATUS_META } from "@/lib/data/types";
import { getSim } from "@/lib/office/runtime";
import { mat } from "./materials";

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CAP = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
const SPH = new THREE.SphereGeometry(0.5, 20, 16);
const TORUS = new THREE.TorusGeometry(0.11, 0.025, 8, 24);
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
  dimmed?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onHover?: (on: boolean) => void;
}

function Hair({ a }: { a: Appearance }) {
  const m = mat(a.hair, { rough: 0.8 });
  switch (a.hairStyle) {
    case "hijab":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.01, -0.01]} scale={[0.3, 0.31, 0.3]} castShadow />
          <mesh geometry={CAP} material={m} position={[0, -0.13, -0.02]} scale={[0.3, 0.06, 0.26]} castShadow />
        </group>
      );
    case "long":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.03, -0.015]} scale={[0.29, 0.28, 0.29]} castShadow />
          <mesh geometry={BOX} material={m} position={[0, -0.12, -0.08]} scale={[0.27, 0.32, 0.12]} castShadow />
        </group>
      );
    case "bob":
      return <mesh geometry={SPH} material={m} position={[0, 0.0, -0.02]} scale={[0.3, 0.3, 0.29]} castShadow />;
    case "bun":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.04, -0.015]} scale={[0.28, 0.25, 0.28]} castShadow />
          <mesh geometry={SPH} material={m} position={[0, 0.12, -0.12]} scale={[0.13, 0.13, 0.13]} castShadow />
        </group>
      );
    case "ponytail":
      return (
        <group>
          <mesh geometry={SPH} material={m} position={[0, 0.04, -0.015]} scale={[0.28, 0.25, 0.28]} castShadow />
          <mesh geometry={CAP} material={m} position={[0, -0.05, -0.15]} rotation={[0.4, 0, 0]} scale={[0.07, 0.15, 0.07]} castShadow />
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

export const Character = memo(function Character(props: Props) {
  const { id, appearance: a, status, isCEO, selected, hovered, showTag, dimmed } = props;
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
  const shadowRef = useRef<THREE.Mesh>(null);
  const smoothed = useRef({ sit: 0, walk: 0 });

  const m = useMemo(
    () => ({
      skin: mat(a.skin, { rough: 0.6 }),
      shirt: mat(a.shirt, { rough: 0.8 }),
      pants: mat(a.pants, { rough: 0.85 }),
      shoes: mat(a.shoes, { rough: 0.5 }),
      dark: mat("#111827"),
    }),
    [a.skin, a.shirt, a.pants, a.shoes],
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

  useFrame(({ clock }, dt) => {
    const ag = getSim().agents.get(id);
    if (!ag || !root.current) return;
    const t = clock.elapsedTime;
    root.current.position.set(ag.x, 0, ag.z);
    root.current.rotation.y = ag.heading;

    const sitting = ag.pose === "sit" || (ag.glide?.then === "sit" && ag.glide.t > 0.6);
    const walking = ag.pose === "walk" && ag.path.length > 0 && !ag.glide;
    const held = ag.pose === "held";
    const sm = smoothed.current;
    sm.sit += ((sitting ? 1 : 0) - sm.sit) * Math.min(1, dt * 8);
    sm.walk += ((walking || (ag.glide && ag.glide.then !== "sit") ? 1 : 0) - sm.walk) * Math.min(1, dt * 8);

    const phase = ag.walkPhase * (ag.isCEO ? 9.5 : 8.5);
    const swing = Math.sin(phase) * 0.55 * sm.walk;
    const bob = Math.abs(Math.cos(phase)) * 0.04 * sm.walk;

    // hips height
    if (hips.current) hips.current.position.y = THREE.MathUtils.lerp(HIP_Y, SEAT_HIP_Y, sm.sit) + bob;
    if (body.current) body.current.position.y = ag.y;

    // legs
    const sitUp = -Math.PI / 2 * sm.sit;
    const dangle = held ? Math.sin(t * 7) * 0.35 : 0;
    if (lUp.current) lUp.current.rotation.x = sitUp + swing + dangle;
    if (rUp.current) rUp.current.rotation.x = sitUp - swing - dangle;
    if (lLow.current) lLow.current.rotation.x = (Math.PI / 2) * sm.sit + Math.max(0, -Math.sin(phase)) * 0.7 * sm.walk;
    if (rLow.current) rLow.current.rotation.x = (Math.PI / 2) * sm.sit + Math.max(0, Math.sin(phase)) * 0.7 * sm.walk;

    // arms
    const typing = ag.gesture === "type" || (sitting && ag.working);
    const talking = ag.gesture === "talk";
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
      if (typing) {
        lf += Math.sin(t * 18) * 0.08;
        rf += Math.cos(t * 17) * 0.08;
      }
    }
    if (talking) {
      ra = -0.6 + Math.sin(t * 3) * 0.25;
      rf = -1.0 + Math.sin(t * 4.3) * 0.3;
      rz = -0.2;
    }
    if (held) {
      la = -2.6 + Math.sin(t * 6) * 0.3;
      ra = -2.6 - Math.sin(t * 6) * 0.3;
      lf = -0.2;
      rf = -0.2;
      lz = -0.3;
      rz = 0.3;
    }
    if (lArm.current) {
      lArm.current.rotation.x = la;
      lArm.current.rotation.z = lz;
    }
    if (rArm.current) {
      rArm.current.rotation.x = ra;
      rArm.current.rotation.z = rz;
    }
    if (lFore.current) lFore.current.rotation.x = lf;
    if (rFore.current) rFore.current.rotation.x = rf;

    // torso + head idle life
    const breathe = Math.sin(t * 1.6 + ag.walkPhase) * 0.012;
    if (torso.current) {
      torso.current.scale.y = 1 + breathe;
      torso.current.rotation.x = sitting ? 0.05 : sm.walk * 0.06;
    }
    if (head.current) {
      let yaw = 0;
      if (talking) yaw = Math.sin(t * 1.3) * 0.15;
      else if (sitting && !typing) yaw = Math.sin(t * 0.35 + id.length) * 0.35;
      head.current.rotation.y = yaw;
      head.current.rotation.x = talking ? Math.sin(t * 5) * 0.06 : held ? -0.3 : 0;
    }
    if (badge.current) {
      badge.current.position.y = (sitting ? 1.65 : 2.05) + ag.y + Math.sin(t * 2 + id.length) * 0.04;
      badge.current.rotation.y = t * 1.5;
    }
    if (shadowRef.current) {
      const sc = 1 - Math.min(0.6, ag.y * 0.35);
      shadowRef.current.scale.set(sc, sc, 1);
    }
  });

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
      {/* selection ring */}
      {(selected || hovered) && (
        <mesh ref={shadowRef} geometry={RING} material={ringMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={selected ? 1 : 0.85} />
      )}
      {/* invisible hit capsule — makes clicking small avatars easy */}
      <mesh position={[0, 0.9, 0]} scale={[0.6, 1.8, 0.6]} geometry={BOX} material={HIT_MAT} />
      <group ref={body}>
        <group ref={hips} position={[0, HIP_Y, 0]}>
          {/* legs */}
          {[
            [lUp, lLow, -0.1],
            [rUp, rLow, 0.1],
          ].map(([up, low, x], i) => (
            <group key={i} ref={up as React.RefObject<THREE.Group>} position={[x as number, 0, 0]}>
              <Limb len={UPPER_LEG} w={0.14} m={m.pants} />
              <group ref={low as React.RefObject<THREE.Group>} position={[0, -UPPER_LEG + 0.04, 0]}>
                <Limb len={LOWER_LEG} w={0.12} m={m.pants} />
                <mesh geometry={BOX} material={m.shoes} position={[0, -LOWER_LEG + 0.02, 0.05]} scale={[0.12, 0.08, 0.24]} castShadow />
              </group>
            </group>
          ))}
          {/* pelvis */}
          <mesh geometry={BOX} material={m.pants} position={[0, 0.02, 0]} scale={[0.34, 0.16, 0.2]} castShadow />
          {/* torso */}
          <group ref={torso} position={[0, 0.05, 0]}>
            <mesh geometry={CAP} material={m.shirt} position={[0, 0.27, 0]} scale={[0.36, 0.22, 0.22]} castShadow />
            {isCEO && <mesh geometry={BOX} material={mat("#b91c1c")} position={[0, 0.3, 0.11]} scale={[0.05, 0.3, 0.02]} />}
            {/* arms */}
            {[
              [lArm, lFore, -0.23],
              [rArm, rFore, 0.23],
            ].map(([arm, fore, x], i) => (
              <group key={i} ref={arm as React.RefObject<THREE.Group>} position={[x as number, 0.47, 0]}>
                <Limb len={0.3} w={0.1} m={m.shirt} />
                <group ref={fore as React.RefObject<THREE.Group>} position={[0, -0.28, 0]}>
                  <Limb len={0.28} w={0.085} m={m.skin} />
                </group>
              </group>
            ))}
            {/* neck + head */}
            <mesh geometry={CAP} material={m.skin} position={[0, 0.55, 0]} scale={[0.09, 0.06, 0.09]} />
            <group ref={head} position={[0, 0.73, 0]}>
              <mesh geometry={SPH} material={m.skin} scale={[0.25, 0.27, 0.25]} castShadow />
              <Hair a={a} />
              {/* eyes */}
              <mesh geometry={SPH} material={m.dark} position={[-0.05, 0.01, 0.115]} scale={[0.03, 0.035, 0.02]} />
              <mesh geometry={SPH} material={m.dark} position={[0.05, 0.01, 0.115]} scale={[0.03, 0.035, 0.02]} />
              {a.glasses && (
                <group position={[0, 0.01, 0.125]}>
                  <mesh geometry={TORUS} material={m.dark} position={[-0.05, 0, 0]} scale={[0.32, 0.32, 0.3]} />
                  <mesh geometry={TORUS} material={m.dark} position={[0.05, 0, 0]} scale={[0.32, 0.32, 0.3]} />
                </group>
              )}
            </group>
          </group>
        </group>
      </group>
      {/* status badge */}
      <group ref={badge} position={[0, 2.05, 0]}>
        <mesh geometry={TORUS} material={badgeMat} rotation={[Math.PI / 2, 0, 0]} scale={isCEO ? 1.25 : 1} />
        <mesh geometry={SPH} material={badgeMat} scale={isCEO ? 0.12 : 0.09} />
        {(showTag || hovered || selected) && !dimmed && (
          <Html center position={[0, 0.32, 0]} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
            <div className="whitespace-nowrap rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg backdrop-blur">
              {props.name}
              {props.title && <span className="ml-1 text-slate-300">· {props.title}</span>}
              {status && !isCEO && (
                <span className="ml-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS_META[status].color }} />
              )}
            </div>
          </Html>
        )}
      </group>
    </group>
  );
});
