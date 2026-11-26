"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { graphicsLevel } from "@/lib/office/quality";

/**
 * Pose numbers the chibi rig works out every frame (walk, sit, type, wave, dance…).
 * The VRM body copies them onto its own bones, so an uploaded anime avatar moves exactly like the chibi would.
 * Sides are the chibi's: "l" = the −X side (the model's right), "r" = the +X side (the model's left).
 */
export interface VrmPose {
  hipDy: number;
  lUp: number;
  rUp: number;
  lLow: number;
  rLow: number;
  la: number;
  ra: number;
  lz: number;
  rz: number;
  lf: number;
  rf: number;
  lean: number;
  sway: number;
  yaw: number;
  pitch: number;
  blink: number;
  happy: number;
  sad: number;
  mouth: number;
  relaxed: number;
}
export const restPose = (): VrmPose => ({ hipDy: 0, lUp: 0, rUp: 0, lLow: 0, rLow: 0, la: 0, ra: 0, lz: -0.06, rz: 0.06, lf: -0.15, rf: -0.15, lean: 0, sway: 0, yaw: 0, pitch: 0, blink: 0, happy: 0, sad: 0, mouth: 0, relaxed: 0 });

/** Avatars are shown this tall (world units ≈ metres), close to the chibi's height so seats and desks still fit. */
const HEIGHT = 1.72;
/** How far the arms hang down from the T-pose (a little less than 90° so they clear the body). */
const ARM_DOWN = 1.42;

// downloads are shared (several staff can use the same file); parsing is per character, one at a time
const files = new Map<string, Promise<ArrayBuffer>>();
let queue: Promise<unknown> = Promise.resolve();
function fileOf(url: string) {
  let p = files.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`avatar download failed (${r.status})`);
      return r.arrayBuffer();
    });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return p;
}
function parse(url: string): Promise<VRM> {
  const job = queue.then(async () => {
    const buf = await fileOf(url);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(buf.slice(0), "");
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error("not a VRM avatar");
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    return vrm;
  });
  queue = job.catch(() => {});
  return job;
}

const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** An uploaded VRM (VRoid etc.) anime avatar standing in for the chibi body. */
export function VrmBody({ url, pose, onReady, onError }: { url: string; pose: React.RefObject<VrmPose>; onReady?: (ok: boolean) => void; onError?: (msg: string) => void }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const info = useRef({ scale: 1, hipY: 0, worldScale: 0, last: new THREE.Vector3(), seen: false });
  const cb = useRef({ onReady, onError });
  cb.current = { onReady, onError };

  useEffect(() => {
    let dead = false;
    let loaded: VRM | null = null;
    parse(url)
      .then((v) => {
        if (dead) {
          VRMUtils.deepDispose(v.scene);
          return;
        }
        loaded = v;
        const shadows = graphicsLevel() !== "battery";
        v.scene.traverse((o) => {
          o.frustumCulled = false;
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = shadows;
        });
        const box = new THREE.Box3().setFromObject(v.scene);
        const h = Math.max(0.3, box.max.y - box.min.y);
        info.current.scale = HEIGHT / h;
        info.current.hipY = v.humanoid.getNormalizedBoneNode("hips")?.position.y ?? 0;
        setVrm(v);
        cb.current.onReady?.(true);
      })
      .catch((e: unknown) => {
        if (dead) return;
        cb.current.onReady?.(false);
        cb.current.onError?.(e instanceof Error ? e.message : "couldn't load the avatar");
      });
    return () => {
      dead = true;
      if (loaded) VRMUtils.deepDispose(loaded.scene);
    };
  }, [url]);

  useFrame((_, dt) => {
    if (!vrm) return;
    const p = pose.current;
    const h = vrm.humanoid;
    const bone = (n: VRMHumanBoneName) => h.getNormalizedBoneNode(n);
    const s = info.current.scale;

    const hips = bone("hips");
    if (hips) hips.position.y = info.current.hipY + p.hipDy / s;
    // legs (chibi l = model right)
    bone("rightUpperLeg")?.rotation.set(p.lUp, 0, 0);
    bone("leftUpperLeg")?.rotation.set(p.rUp, 0, 0);
    bone("rightLowerLeg")?.rotation.set(p.lLow, 0, 0);
    bone("leftLowerLeg")?.rotation.set(p.rLow, 0, 0);
    // arms: drop from the T-pose, then swing forward/up like the chibi's shoulder
    const ru = bone("rightUpperArm");
    if (ru) ru.quaternion.copy(_qx.setFromAxisAngle(X, p.la)).multiply(_qz.setFromAxisAngle(Z, ARM_DOWN + p.lz));
    const lu = bone("leftUpperArm");
    if (lu) lu.quaternion.copy(_qx.setFromAxisAngle(X, p.ra)).multiply(_qz.setFromAxisAngle(Z, -ARM_DOWN + p.rz));
    bone("rightLowerArm")?.rotation.set(0, -p.lf, 0);
    bone("leftLowerArm")?.rotation.set(0, p.rf, 0);
    // body + head
    bone("spine")?.rotation.set(p.lean * 0.5, 0, p.sway * 0.5);
    bone("chest")?.rotation.set(p.lean * 0.3, 0, p.sway * 0.3);
    bone("neck")?.rotation.set(p.pitch * 0.4, p.yaw * 0.4, 0);
    bone("head")?.rotation.set(p.pitch * 0.6, p.yaw * 0.6, 0);

    const ex = vrm.expressionManager;
    if (ex) {
      ex.setValue("blink", p.blink);
      ex.setValue("happy", p.happy);
      ex.setValue("sad", p.sad);
      ex.setValue("relaxed", p.relaxed);
      ex.setValue("aa", p.mouth);
    }
    // hair / skirt physics only on High graphics; the rest is cheap
    if (graphicsLevel() === "high") {
      // the office scales characters with zoom and can move them in one jump: re-seat the physics so hair doesn't fly off
      const i = info.current;
      const ws = vrm.scene.getWorldScale(_v).x;
      vrm.scene.getWorldPosition(_p);
      const sb = vrm.springBoneManager;
      if (sb && (!i.seen || Math.abs(ws - i.worldScale) / (i.worldScale || 1) > 0.02)) {
        sb.reset();
        vrm.scene.updateMatrixWorld(true);
        sb.setInitState();
        i.worldScale = ws;
      } else if (sb && _p.distanceTo(i.last) > 1) sb.reset();
      i.last.copy(_p);
      i.seen = true;
      vrm.update(Math.min(dt, 1 / 30));
    }
    else {
      h.update();
      ex?.update();
      vrm.nodeConstraintManager?.update();
    }
  });

  if (!vrm) return null;
  return <primitive object={vrm.scene} scale={info.current.scale} />;
}
