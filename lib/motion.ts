"use client";

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

/** The device asks for less motion (Settings → Accessibility → Reduce motion). */
export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── where the last tap/click was: windows grow out of it ──
let lastPointer: { x: number; y: number; at: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (e) => (lastPointer = { x: e.clientX, y: e.clientY, at: Date.now() }), { capture: true, passive: true });
}
/** The point a new window should grow from (the button just pressed), if it was pressed a moment ago. */
export function growOrigin(): { x: number; y: number } | null {
  return lastPointer && Date.now() - lastPointer.at < 1500 ? { x: lastPointer.x, y: lastPointer.y } : null;
}

/** Animates a number from its previous value to the new one (ease-out). */
export function useCountUp(value: number, ms = 800): number {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(shown);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return shown;
}

/** Returns true for `ms` after `trigger` changes (not on first render) — for one-shot pulse classes. */
export function useFlash(trigger: unknown, ms = 1100): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [trigger, ms]);
  return on;
}

// ── sounds (off unless turned on in Settings) — made with Web Audio, no files ──
let ctx: AudioContext | null = null;
function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.18) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + at);
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at);
  o.stop(ctx.currentTime + at + dur + 0.05);
}
export function playSound(kind: "ding" | "chaching" | "pop", enabled: boolean | undefined) {
  if (!enabled || typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (kind === "ding") {
      tone(1318.5, 0, 0.5);
      tone(1975.5, 0.06, 0.45, "sine", 0.08);
    } else if (kind === "pop") {
      tone(660, 0, 0.12, "triangle", 0.12);
    } else {
      tone(1046.5, 0, 0.12, "square", 0.06);
      tone(1568, 0.09, 0.14, "square", 0.06);
      tone(2093, 0.2, 0.6, "sine", 0.16);
      tone(2637, 0.24, 0.55, "sine", 0.08);
    }
  } catch {}
}

// ── business moments the 3D office reacts to ──
export interface OfficeFx {
  /** a coin per new sale (platform), flying from the team area to the TV wall */
  coins: { id: number; platform: "shopee" | "lazada"; at: number }[];
  /** parcels stacked at the packing table, then carried out */
  parcels: { id: number; count: number; at: number } | null;
  /** monthly target reached: confetti from the ceiling */
  partyAt: number;
  /** big order: flash the TV wall */
  tvFlashAt: number;
  coin(platform: "shopee" | "lazada"): void;
  parcelRun(count: number): void;
  party(): void;
  tvFlash(): void;
}
let fxId = 0;
export const useOfficeFx = create<OfficeFx>()((set) => ({
  coins: [],
  parcels: null,
  partyAt: 0,
  tvFlashAt: 0,
  coin: (platform) => {
    const id = ++fxId;
    set((s) => ({ coins: [...s.coins.slice(-11), { id, platform, at: Date.now() }] }));
    setTimeout(() => set((s) => ({ coins: s.coins.filter((c) => c.id !== id) })), 4000);
  },
  parcelRun: (count) => set({ parcels: { id: ++fxId, count: Math.max(1, Math.min(12, count)), at: Date.now() } }),
  party: () => set({ partyAt: Date.now() }),
  tvFlash: () => set({ tvFlashAt: Date.now() }),
}));
