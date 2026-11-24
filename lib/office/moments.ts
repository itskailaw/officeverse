"use client";

import { create } from "zustand";

/**
 * Short-lived office moments shared by the HUD and the 3D staff:
 * emotes above heads, a happy mood (skipping walk), team cheers and dance breaks.
 * Times are Date.now() milliseconds.
 */
interface Moments {
  emotes: Record<string, { emoji: string; until: number }>;
  happyUntil: Record<string, number>;
  cheerUntil: number;
  danceUntil: number;
  emote: (id: string, emoji: string, ms?: number) => void;
  happy: (id: string, ms?: number) => void;
  cheer: (ms?: number) => void;
  dance: (ms?: number) => void;
}

export const useMoments = create<Moments>((set) => ({
  emotes: {},
  happyUntil: {},
  cheerUntil: 0,
  danceUntil: 0,
  emote: (id, emoji, ms = 3200) => set((s) => ({ emotes: { ...s.emotes, [id]: { emoji, until: Date.now() + ms } } })),
  happy: (id, ms = 30_000) => set((s) => ({ happyUntil: { ...s.happyUntil, [id]: Date.now() + ms } })),
  cheer: (ms = 4500) => set({ cheerUntil: Date.now() + ms }),
  dance: (ms = 9000) => set({ danceUntil: Date.now() + ms }),
}));

/** Kind words in English or Malay ("good job", "thanks", "bagus", "terima kasih", …). */
export const PRAISE = /\b(good job|great job|well done|nice work|great work|thank(s| you)|awesome|excellent|bagus|terima kasih|tq|syabas|mantap|power|steady)\b/i;

/** Emoji for a task title, for the "working on…" bubble. */
export function taskEmoji(title: string) {
  const t = title.toLowerCase();
  if (/airway|awb|label|print/.test(t)) return "🖨️";
  if (/order|parcel|ship|pack/.test(t)) return "📦";
  if (/reply|chat|buyer|customer|review/.test(t)) return "💬";
  if (/subtitle|translat|qa check/.test(t)) return "🎬";
  if (/listing|campaign|ad|marketing|post/.test(t)) return "📣";
  if (/stock|inventory|restock/.test(t)) return "📋";
  if (/report|sales|profit|finance|analy/.test(t)) return "📊";
  return "💼";
}
