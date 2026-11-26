"use client";

import { Canvas } from "@react-three/fiber";
import type { Appearance } from "@/lib/data/types";
import { Character } from "@/components/office/Character";

/** Live 3D preview of an employee's look (slowly turning) for the character creator. */
export default function CharacterPreview({ appearance, gender, vrm }: { appearance: Appearance; gender?: string; vrm?: string | null }) {
  return (
    <div className="h-[190px] w-[150px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-slate-200 ring-1 ring-slate-200">
      <Canvas orthographic dpr={[1, 2]} camera={{ position: [0, 1.6, 6], zoom: 95, near: 0.1, far: 50 }} onCreated={({ camera }) => camera.lookAt(0, 0.85, 0)}>
        <hemisphereLight args={["#ffffff", "#aab6c6", 1.6]} />
        <directionalLight position={[3, 5, 5]} intensity={2.2} />
        <directionalLight position={[-4, 3, -4]} intensity={0.8} color="#bfdbfe" />
        <Character id="preview" name="" appearance={appearance} gender={gender} chibi preview vrm={vrm ?? null} />
      </Canvas>
    </div>
  );
}
