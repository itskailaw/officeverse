import type { LightingMode } from "../data/types.ts";

/** Resolve "auto" lighting from the current Malaysia time. */
export function klHourNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) + m / 60;
}

export function resolveLighting(mode: LightingMode, d = new Date()): Exclude<LightingMode, "auto"> {
  if (mode !== "auto") return mode;
  const h = klHourNow(d);
  if (h >= 7 && h < 17.5) return "day";
  if (h >= 17.5 && h < 19.75) return "evening";
  return "night";
}
