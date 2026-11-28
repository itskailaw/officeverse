"use client";

import { useEffect } from "react";
import { useLive, type LiveSummary } from "@/lib/integrations/client";
import { useOffice } from "@/lib/store/office-store";
import { useMoments } from "@/lib/office/moments";
import { playSound, useOfficeFx } from "@/lib/motion";

/** A sale over this (RM, one refresh) flashes the TV wall. */
const BIG_ORDER = 200;

/**
 * Watches the live sales figures and turns changes into office moments:
 * a coin per new order (and a ding), a TV flash for a big order, and a party when the monthly target is hit.
 */
export function useBusinessMoments() {
  useEffect(() => {
    let prev: LiveSummary | null = useLive.getState().summary;
    return useLive.subscribe((st) => {
      const s = st.summary;
      if (!s || s === prev) return;
      const before = prev;
      prev = s;
      if (!before || before.today.orders > s.today.orders) return; // first load or a new day
      const fx = useOfficeFx.getState();
      const sounds = useOffice.getState().settings.sounds;
      let added = 0;
      for (const p of ["shopee", "lazada"] as const) {
        const n = (s.byPlatform?.[p]?.today.orders ?? 0) - (before.byPlatform?.[p]?.today.orders ?? 0);
        for (let i = 0; i < Math.min(5, n); i++) setTimeout(() => fx.coin(p), i * 450);
        added += Math.max(0, n);
      }
      if (!added && s.today.orders > before.today.orders) {
        fx.coin("shopee");
        added = 1;
      }
      if (added) {
        playSound("ding", sounds);
        useMoments.getState().emote("emp-orders", "🛒", 3500);
      }
      if (s.today.revenue - before.today.revenue >= BIG_ORDER) fx.tvFlash();

      // monthly target reached: once per month
      const target = useOffice.getState().settings.salesTarget ?? 0;
      if (target > 0 && s.monthToDate.revenue >= target && before.monthToDate.revenue < target) {
        const key = `ov:party:${new Date().toISOString().slice(0, 7)}`;
        try {
          if (localStorage.getItem(key)) return;
          localStorage.setItem(key, "1");
        } catch {}
        fx.party();
        useMoments.getState().cheer(8000);
        playSound("chaching", sounds);
      }
    });
  }, []);
}
