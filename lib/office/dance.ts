"use client";

import { useMoments } from "./moments";
import { useUI } from "@/lib/store/ui-store";
import { useMusic } from "@/lib/audio/music";

/** Dance break: everyone dances for ~9 seconds (music starts if it was off). */
export function startDance() {
  useMoments.getState().dance(9000);
  const m = useMusic.getState();
  if (!m.playing) void m.toggle();
  useUI.getState().toast("success", "💃 Dance break! 🕺");
}
