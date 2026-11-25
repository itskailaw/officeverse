"use client";

/** Graphics quality for the 3D office. "auto" picks by device. */
export type Quality = "auto" | "high" | "balanced" | "battery";
export type Level = Exclude<Quality, "auto">;

export function resolveQuality(q: Quality | undefined): Level {
  if (q && q !== "auto") return q;
  if (typeof window === "undefined") return "balanced";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const phone = window.matchMedia("(max-width: 767px)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  if (phone) return "battery";
  if (touch || weak) return "balanced";
  return "high";
}

export const QUALITY = {
  high: { dpr: [1, 2] as [number, number], shadows: true, shadowMap: 3072, antialias: true, gloss: true },
  balanced: { dpr: [1, 1.5] as [number, number], shadows: true, shadowMap: 1536, antialias: true, gloss: false },
  battery: { dpr: [1, 1] as [number, number], shadows: false, shadowMap: 512, antialias: false, gloss: false },
} as const;

let current: Level = "high";
export const setGraphicsLevel = (l: Level) => (current = l);
export const graphicsLevel = () => current;
