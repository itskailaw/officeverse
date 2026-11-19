"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { CEO_ID } from "@/lib/data/seed";
import type { FurnitureItem, LightingMode, Room } from "@/lib/data/types";
import { CATALOG, sizeOf } from "@/lib/office/catalog";
import { CEO_DESK_ID, MEETING_TABLE_ID, ROOMS } from "@/lib/office/layout";
import { getSim } from "@/lib/office/runtime";
import { resolveLighting } from "@/lib/office/lighting";
import { departmentColor } from "@/lib/data/brand";
import { useLive } from "@/lib/integrations/client";
import { Building, RoomLabels, type Brand } from "./Building";
import { FurnitureVisual } from "./Furniture";
import { Character } from "./Character";
import { meetingTexture, perfScreenTexture, receptionTexture } from "./screens";

const CENTER = new THREE.Vector3(24, 0, 11.5);
const pressedKeys = new Set<string>();
const ISO_OFFSET = new THREE.Vector3(26, 30, 30);

// ------------------------------------------------------------------ lighting
/** Current lighting mode, re-evaluated every minute when set to "auto". */
function useLightMode(mode: LightingMode) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (mode !== "auto") return;
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, [mode]);
  return useMemo(() => resolveLighting(mode), [mode, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

const SKY: Record<Exclude<LightingMode, "auto">, [string, string]> = {
  day: ["#9cc7ee", "#e8f1f8"],
  evening: ["#5b6fb0", "#f6b48a"],
  night: ["#050a18", "#1a2a4a"],
};

function skyTexture(top: string, bottom: string) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  if (top === SKY.night[0]) {
    g.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 4, Math.random() * 300, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Lighting({ lm }: { lm: Exclude<LightingMode, "auto"> }) {
  const { scene } = useThree();
  useEffect(() => {
    const tex = skyTexture(...SKY[lm]);
    scene.background = tex;
    return () => tex.dispose();
  }, [lm, scene]);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (sunRef.current) {
      sunRef.current.target.position.copy(CENTER);
      sunRef.current.target.updateMatrixWorld();
    }
  }, [lm]);
  const cfg = {
    day: { hemi: 1.15, sky: "#eaf4ff", ground: "#c8ced6", sun: 2.4, sunColor: "#fff7ec", sunPos: [4, 38, -14], lamps: 0 },
    evening: { hemi: 0.55, sky: "#ffd7b0", ground: "#6b5b4b", sun: 1.3, sunColor: "#ffb36b", sunPos: [-18, 14, 6], lamps: 9 },
    night: { hemi: 0.18, sky: "#5470a8", ground: "#111827", sun: 0.35, sunColor: "#9db4ff", sunPos: [10, 30, 30], lamps: 14 },
  }[lm];
  return (
    <>
      <hemisphereLight args={[cfg.sky, cfg.ground, cfg.hemi]} />
      <directionalLight
        ref={sunRef}
        position={[CENTER.x + cfg.sunPos[0], cfg.sunPos[1], CENTER.z + cfg.sunPos[2]]}
        intensity={cfg.sun}
        color={cfg.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      {cfg.lamps > 0 &&
        ROOMS.map((r) => (
          <pointLight
            key={r.id}
            position={[(r.x0 + r.x1) / 2, 2.6, (r.z0 + r.z1) / 2]}
            intensity={cfg.lamps * (r.id === "corridor" ? 0.7 : 1)}
            distance={Math.max(r.x1 - r.x0, r.z1 - r.z0) + 3}
            decay={1.2}
            color="#ffe2b8"
          />
        ))}
    </>
  );
}

// ------------------------------------------------------------------ camera
function CameraRig() {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const cmd = useUI((s) => s.cameraCommand);
  const anim = useRef<{ fromT: THREE.Vector3; toT: THREE.Vector3; fromO: THREE.Vector3; toO: THREE.Vector3; fromZ: number; toZ: number; t: number } | null>(null);
  const size = useThree((s) => s.size);

  const fitZoom = () => Math.max(9, Math.min(size.width / 56, size.height / 34));

  useEffect(() => {
    camera.zoom = fitZoom();
    camera.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cmd || !controls) return;
    const target = controls.target.clone();
    const offset = camera.position.clone().sub(target);
    let toT = target.clone();
    let toO = offset.clone();
    let toZ = camera.zoom;
    if (cmd.kind === "rotate") toO = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (cmd.dir * Math.PI) / 2);
    if (cmd.kind === "zoom") toZ = THREE.MathUtils.clamp(camera.zoom * (cmd.dir > 0 ? 1.35 : 1 / 1.35), 6, 120);
    if (cmd.kind === "reset") {
      toT = CENTER.clone();
      toO = ISO_OFFSET.clone();
      toZ = fitZoom();
    }
    if (cmd.kind === "focus") {
      toT = new THREE.Vector3(cmd.x, 0, cmd.z);
      toZ = Math.max(camera.zoom, 38);
    }
    anim.current = { fromT: target, toT, fromO: offset, toO, fromZ: camera.zoom, toZ, t: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd]);

  // keyboard: Q/E rotate, +/- zoom, WASD/arrows pan
  useEffect(() => {
    const keys = pressedKeys;
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const ui = useUI.getState();
      if (e.key === "q" || e.key === "Q") ui.camera({ kind: "rotate", dir: -1 });
      else if (e.key === "e" || e.key === "E") ui.camera({ kind: "rotate", dir: 1 });
      else if (e.key === "+" || e.key === "=") ui.camera({ kind: "zoom", dir: 1 });
      else if (e.key === "-") ui.camera({ kind: "zoom", dir: -1 });
      else keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const blur = () => keys.clear();
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // `?debug=1` exposes the simulation + a projector for automated UI tests
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    const w = window as unknown as Record<string, unknown>;
    w.__ovSim = getSim();
    w.__ovLive = useLive;
    w.__ovProject = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
  }, [camera, size]);

  useFrame((_, dt) => {
    if (!controls) return;
    const keys = pressedKeys;
    if (keys.size) {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const move = new THREE.Vector3();
      if (keys.has("w") || keys.has("arrowup")) move.add(fwd);
      if (keys.has("s") || keys.has("arrowdown")) move.sub(fwd);
      if (keys.has("d") || keys.has("arrowright")) move.add(right);
      if (keys.has("a") || keys.has("arrowleft")) move.sub(right);
      if (move.lengthSq()) {
        move.normalize().multiplyScalar((dt * 600) / camera.zoom);
        controls.target.add(move);
        camera.position.add(move);
        controls.update();
      }
    }
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / 0.55);
    const k = 1 - Math.pow(1 - a.t, 3);
    const tgt = a.fromT.clone().lerp(a.toT, k);
    // rotate offset spherically (slerp around Y) for nice orbits
    const fromAng = Math.atan2(a.fromO.x, a.fromO.z);
    let toAng = Math.atan2(a.toO.x, a.toO.z);
    while (toAng - fromAng > Math.PI) toAng -= Math.PI * 2;
    while (toAng - fromAng < -Math.PI) toAng += Math.PI * 2;
    const ang = fromAng + (toAng - fromAng) * k;
    const flat = THREE.MathUtils.lerp(Math.hypot(a.fromO.x, a.fromO.z), Math.hypot(a.toO.x, a.toO.z), k);
    const y = THREE.MathUtils.lerp(a.fromO.y, a.toO.y, k);
    const off = new THREE.Vector3(Math.sin(ang) * flat, y, Math.cos(ang) * flat);
    controls.target.copy(tgt);
    camera.position.copy(tgt).add(off);
    camera.zoom = THREE.MathUtils.lerp(a.fromZ, a.toZ, k);
    camera.updateProjectionMatrix();
    controls.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

// ------------------------------------------------------------------ furniture
function useTextureFromUrl(url: string | null) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }
    let disposed = false;
    new THREE.TextureLoader().load(url, (t) => {
      if (disposed) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      setTex(t);
    });
    return () => {
      disposed = true;
    };
  }, [url]);
  return tex;
}

/** Room → brand (department name + company colour, or a fixed colour for shared departments). */
function useBrands(): Record<string, Brand | undefined> {
  const departments = useOffice((s) => s.departments);
  const companies = useOffice((s) => s.companies);
  return useMemo(() => {
    const out: Record<string, Brand | undefined> = {};
    for (const r of ROOMS) {
      const dept = departments.find((d) => d.id === r.departmentId);
      if (!dept || !dept.active) continue;
      const color = departmentColor(dept, companies);
      out[r.id] = { name: r.id === "ceo" ? "CEO Office" : dept.name, color };
    }
    return out;
  }, [departments, companies]);
}

/** Loads an image element (for drawing into canvas textures). */
function useTextureImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return setImg(null);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
  }, [url]);
  return img;
}

function FurnitureLayer({ night, brands }: { night: boolean; brands: Record<string, Brand | undefined> }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const furniture = useOffice((s) => s.furniture);
  const settings = useOffice((s) => s.settings);
  const companies = useOffice((s) => s.companies);
  const liveMeeting = useOffice((s) => s.meetings.find((m) => m.status === "in_progress")?.topic ?? null);
  const mode = useUI((s) => s.mode);
  const selectedId = useUI((s) => s.selectedFurnitureId);
  const drag = useUI((s) => s.furnitureDrag);

  const f0 = useTextureFromUrl(settings.photoFrames[0] ?? null);
  const f1 = useTextureFromUrl(settings.photoFrames[1] ?? null);
  const f2 = useTextureFromUrl(settings.photoFrames[2] ?? null);
  const frames = useMemo(() => [f0, f1, f2], [f0, f1, f2]);

  const liveSummary = useLive((x) => x.summary);
  const perfTex = useMemo(() => perfScreenTexture(settings.demoMode, liveSummary), [settings.demoMode, liveSummary]);
  const logo = useTextureImage(settings.logoUrl);
  const recTex = useMemo(() => receptionTexture(companies, logo), [companies, logo]);
  const meetTex = useMemo(() => meetingTexture(liveMeeting), [liveMeeting]);
  useEffect(() => () => perfTex.dispose(), [perfTex]);
  useEffect(() => () => recTex.dispose(), [recTex]);
  useEffect(() => () => meetTex.dispose(), [meetTex]);

  const onDown = (item: FurnitureItem) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const ui = useUI.getState();
    if (ui.mode !== "build") return;
    e.stopPropagation();
    if (!CATALOG[item.type].movable) return;
    ui.set({
      selectedFurnitureId: item.id,
      draggingFurniture: true,
      furnitureDrag: { id: item.id, x: item.x, z: item.z, dx: item.x - e.point.x, dz: item.z - e.point.z },
    });
  };

  const onClick = (item: FurnitureItem) => (e: ThreeEvent<MouseEvent>) => {
    const ui = useUI.getState();
    if (ui.mode !== "live" || e.delta > 6) return;
    if (item.id === CEO_DESK_ID || item.type === "perf_screen") {
      e.stopPropagation();
      getSim().goToSeat(CEO_ID, CEO_DESK_ID, "desk");
      ui.set({ dialog: "dashboard", selectedEmployeeId: null });
    } else if (item.id === MEETING_TABLE_ID) {
      e.stopPropagation();
      const live = useOffice.getState().meetings.find((m) => m.status === "in_progress");
      if (!live) ui.set({ dialog: "meeting-call" });
    }
  };

  return (
    <group>
      {furniture.map((item) => {
        const d = drag && drag.id === item.id ? drag : null;
        const x = d ? d.x : item.x;
        const z = d ? d.z : item.z;
        const tex = item.type === "perf_screen" ? perfTex : item.id === "rec-logo" ? recTex : item.id === "meet-screen" ? meetTex : null;
        const interactive = item.id === CEO_DESK_ID || item.type === "perf_screen" || item.id === MEETING_TABLE_ID || mode === "build";
        const [w, dd] = sizeOf(item);
        return (
          <group
            key={item.id}
            position={[x, 0, z]}
            rotation={[0, item.rot, 0]}
            onPointerDown={interactive ? onDown(item) : undefined}
            onClick={interactive ? onClick(item) : undefined}
            onPointerOver={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    document.body.style.cursor = "pointer";
                    setHoverId(item.id);
                  }
                : undefined
            }
            onPointerOut={
              interactive
                ? () => {
                    document.body.style.cursor = "";
                    setHoverId((h) => (h === item.id ? null : h));
                  }
                : undefined
            }
          >
            <FurnitureVisual item={item} frames={frames} screenTex={tex} night={night} brand={item.type === "standee" ? brands[item.roomId] : undefined} />
            {mode === "live" && hoverId === item.id && (
              <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[w + 0.5, dd + 0.5]} />
                <meshBasicMaterial color="#fbbf24" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
              </mesh>
            )}
            {mode === "build" && (
              <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[w + 0.08, dd + 0.08]} />
                <meshBasicMaterial color={selectedId === item.id ? "#f59e0b" : "#38bdf8"} transparent opacity={selectedId === item.id ? 0.45 : 0.12} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ------------------------------------------------------------------ agents
const pending: { id: string | null; x: number; y: number } = { id: null, x: 0, y: 0 };

function Agents() {
  const employees = useOffice((s) => s.employees);
  const ceoName = useOffice((s) => s.settings.ceoName);
  const ceoLook = useOffice((s) => s.settings.ceoAppearance);
  const showTags = useOffice((s) => s.settings.showNameTags);
  const showBubbles = useOffice((s) => s.settings.showBubbles);
  const selected = useUI((s) => s.selectedEmployeeId);
  const hovered = useUI((s) => s.hoveredId);
  const held = useUI((s) => s.heldId);
  const mode = useUI((s) => s.mode);

  useFrame((_, dt) => getSim().update(dt));

  // turn a press-and-move on an employee into a pick-up
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!pending.id || useUI.getState().heldId) return;
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 8) {
        getSim().pickUp(pending.id);
        useUI.getState().set({ heldId: pending.id, selectedEmployeeId: pending.id });
        document.body.style.cursor = "grabbing";
      }
    };
    const up = () => {
      pending.id = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const active = employees.filter((e) => e.active);
  return (
    <group>
      <Character
        id={CEO_ID}
        name={`${ceoName} (You)`}
        appearance={ceoLook}
        isCEO
        hovered={hovered === CEO_ID}
        showTag={showTags}
        onHover={(on) => useUI.getState().set({ hoveredId: on ? CEO_ID : null })}
      />
      {active.map((e) => (
        <Character
          key={e.id}
          id={e.id}
          name={e.name}
          title={e.title}
          appearance={e.appearance}
          status={e.status}
          selected={selected === e.id}
          hovered={hovered === e.id}
          showTag={showTags}
          showBubble={showBubbles}
          dimmed={held === e.id}
          onHover={(on) => {
            useUI.getState().set({ hoveredId: on ? e.id : null });
            document.body.style.cursor = on ? "pointer" : "";
          }}
          onPointerDown={(ev) => {
            if (ev.button !== 0 || mode !== "live") return;
            ev.stopPropagation();
            pending.id = e.id;
            pending.x = ev.nativeEvent.clientX;
            pending.y = ev.nativeEvent.clientY;
          }}
          onClick={(ev) => {
            ev.stopPropagation();
            if (ev.delta > 6 || useUI.getState().heldId) return;
            useUI.getState().set({ selectedEmployeeId: e.id, selectedFurnitureId: null });
            getSim().wave(e.id);
          }}
        />
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ ground interaction
function InteractionPlane() {
  const lastPoint = useRef(new THREE.Vector3());
  const moveFurniture = useOffice((s) => s.moveFurniture);

  useEffect(() => {
    const up = () => {
      const ui = useUI.getState();
      if (ui.heldId) {
        const id = ui.heldId;
        getSim().drop(id, lastPoint.current.x, lastPoint.current.z);
        ui.set({ heldId: null });
        document.body.style.cursor = "";
        const emp = useOffice.getState().employees.find((e) => e.id === id);
        if (emp) useOffice.getState().logActivity(id, `CEO moved ${emp.name}`);
      }
      if (ui.draggingFurniture && ui.furnitureDrag) {
        const d = ui.furnitureDrag;
        const item = useOffice.getState().furniture.find((f) => f.id === d.id);
        if (item && (Math.abs(item.x - d.x) > 0.01 || Math.abs(item.z - d.z) > 0.01)) moveFurniture(d.id, d.x, d.z, item.rot);
        ui.set({ draggingFurniture: false, furnitureDrag: null });
      }
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [moveFurniture]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[24, 0.01, 11.5]}
      onPointerMove={(e) => {
        lastPoint.current.copy(e.point);
        const ui = useUI.getState();
        if (ui.heldId) getSim().moveHeld(ui.heldId, e.point.x, e.point.z);
        if (ui.draggingFurniture && ui.furnitureDrag) {
          const d = ui.furnitureDrag;
          const snap = (v: number) => Math.round(v * 4) / 4;
          ui.set({
            furnitureDrag: {
              ...d,
              x: THREE.MathUtils.clamp(snap(e.point.x + d.dx), 0.3, 47.7),
              z: THREE.MathUtils.clamp(snap(e.point.z + d.dz), 0.3, 22.7),
            },
          });
        }
      }}
      onClick={(e) => {
        const ui = useUI.getState();
        if (e.delta > 6 || ui.heldId) return;
        if (ui.mode === "build") {
          ui.set({ selectedFurnitureId: null });
          return;
        }
        if (e.point.x < 0 || e.point.x > 48 || e.point.z < 0 || e.point.z > 23) return;
        getSim().goToPoint(CEO_ID, e.point.x, e.point.z, "free");
        ui.set({ selectedEmployeeId: null });
      }}
    >
      <planeGeometry args={[60, 40]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// ------------------------------------------------------------------ root
function Labels() {
  const departments = useOffice((s) => s.departments);
  const companies = useOffice((s) => s.companies);
  const camera = useUI((s) => s.camera);
  const labels = useMemo(
    () =>
      ROOMS.filter((r) => r.id !== "corridor").map((room) => {
        const dept = departments.find((d) => d.id === room.departmentId);
        const co = companies.find((c) => c.id === dept?.companyId);
        const text = room.id === "ceo" ? "CEO Office" : dept ? (dept.active ? dept.name : `${dept.name} (inactive)`) : room.name;
        return { room, text, color: co?.color };
      }),
    [departments, companies],
  );
  return <RoomLabels labels={labels} onFocus={(r: Room) => camera({ kind: "focus", x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })} />;
}

export default function OfficeScene() {
  const settings = useOffice((s) => s.settings);
  const held = useUI((s) => s.heldId);
  const dragging = useUI((s) => s.draggingFurniture);
  const rotateSelected = useOffice((s) => s.moveFurniture);
  const lm = useLightMode(settings.lighting);
  const night = lm !== "day";
  const brands = useBrands();

  // R rotates the selected furniture in build mode; Esc clears selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const ui = useUI.getState();
      if (e.key === "Escape") ui.set({ selectedEmployeeId: null, selectedFurnitureId: null, notificationsOpen: false });
      if ((e.key === "r" || e.key === "R") && ui.mode === "build" && ui.selectedFurnitureId) {
        const f = useOffice.getState().furniture.find((x) => x.id === ui.selectedFurnitureId);
        if (f) rotateSelected(f.id, f.x, f.z, (f.rot + Math.PI / 2) % (Math.PI * 2));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotateSelected]);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, powerPreference: "high-performance" }} onContextMenu={(e) => e.preventDefault()}>
      <OrthographicCamera makeDefault position={CENTER.clone().add(ISO_OFFSET).toArray()} zoom={18} near={-200} far={400} />
      <OrbitControls
        makeDefault
        target={CENTER.toArray()}
        enabled={!held && !dragging}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning={false}
        minZoom={6}
        maxZoom={120}
        minPolarAngle={0.25}
        maxPolarAngle={1.25}
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
      <CameraRig />
      <Lighting lm={lm} />
      <Suspense fallback={null}>
        <Building walls={settings.walls} wallColor={settings.wallColor} accent={settings.accentColor} wood={settings.floorWood} night={night} brands={brands} />
        <FurnitureLayer night={night} brands={brands} />
        <Agents />
        <InteractionPlane />
        <Labels />
      </Suspense>
    </Canvas>
  );
}
