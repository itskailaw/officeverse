"use client";

// Browser-side state for live marketplace data and integration status.

import { create } from "zustand";
import { supabaseConfigured } from "@/lib/supabase/client";

export interface LiveSummary {
  live: true;
  currency: "MYR";
  definition: string;
  platforms: {
    shopee: { connected: boolean; shopName: string | null; lastSync: string | null; status: string | null; lastError: string | null; expiresAt: string | null };
    lazada: { connected: false };
  };
  today: { revenue: number; orders: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  days: { date: string; revenue: number; orders: number }[];
  toPack: { readyToShip: number; processed: number; urgent: number };
  cancelledToday: number;
  bestSellers30d: { name: string; units: number; revenue: number }[];
  ads: { shopee: { balance: number; at: string } | null };
}

export interface IntegrationInfo {
  id: string;
  provider: string;
  shopId: string | null;
  shopName: string | null;
  status: string;
  lastSync: string | null;
  lastError: string | null;
  expiresAt: string | null;
  lastSummary: { orders?: number; warnings?: string[]; adsBalance?: number | null } | null;
}

export interface IntegrationStatus {
  setup: { supabase: boolean; serviceRole: boolean; encryptionKey: boolean; shopeeApp: boolean; shopeeEnv: "live" | "sandbox" | null };
  role?: string;
  integrations: IntegrationInfo[];
}

interface LiveState {
  summary: LiveSummary | null;
  status: IntegrationStatus | null;
  syncing: boolean;
  error: string | null;
  loadSummary(): Promise<void>;
  loadStatus(): Promise<void>;
  syncShopee(): Promise<{ ok: boolean; message: string }>;
}

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

export const useLive = create<LiveState>()((set, get) => ({
  summary: null,
  status: null,
  syncing: false,
  error: null,
  async loadSummary() {
    if (!supabaseConfigured) return;
    try {
      const s = await getJSON<LiveSummary | { live: false }>("/api/business/summary");
      set({ summary: s.live ? (s as LiveSummary) : null, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  async loadStatus() {
    try {
      set({ status: await getJSON<IntegrationStatus>("/api/integrations/status") });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  async syncShopee() {
    if (get().syncing) return { ok: false, message: "A sync is already running." };
    set({ syncing: true });
    try {
      const r = await getJSON<{ results: { shop: string; ok: boolean; orders?: number; error?: string; warnings?: string[] }[] }>("/api/integrations/shopee/sync", {
        method: "POST",
      });
      await Promise.all([get().loadSummary(), get().loadStatus()]);
      const bad = r.results.find((x) => !x.ok);
      if (bad) return { ok: false, message: `Shopee sync failed: ${bad.error}` };
      const n = r.results.reduce((s, x) => s + (x.orders ?? 0), 0);
      return { ok: true, message: `Shopee synced — ${n} order update${n === 1 ? "" : "s"}.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    } finally {
      set({ syncing: false });
    }
  },
}));

/** Load live data on start-up and sync when it's stale (older than 15 minutes). */
export async function bootLiveData(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const live = useLive.getState();
  await Promise.all([live.loadStatus(), live.loadSummary()]);
  const shop = useLive.getState().status?.integrations.find((i) => i.provider === "shopee" && i.status !== "expired");
  if (!shop) return null;
  const age = shop.lastSync ? Date.now() - Date.parse(shop.lastSync) : Infinity;
  if (age > 15 * 60 * 1000) {
    const r = await useLive.getState().syncShopee();
    return r.ok ? null : r.message;
  }
  return null;
}
