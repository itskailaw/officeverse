"use client";

// Browser-side state for live marketplace data and integration status.

import { create } from "zustand";
import { supabaseConfigured } from "@/lib/supabase/client";

export interface PlatformInfo {
  connected: boolean;
  shopName?: string | null;
  lastSync?: string | null;
  status?: string | null;
  lastError?: string | null;
  expiresAt?: string | null;
}
export interface PlatformFigures {
  today: { revenue: number; orders: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  toPack: { total: number; readyToShip: number; processed: number; urgent: number; urgentToProcess?: number; urgentToShip?: number };
  cancelledToday: number;
  bestSellers30d?: { name: string; units: number; revenue: number }[];
}

export interface LiveSummary {
  live: true;
  currency: "MYR";
  definition: string;
  platforms: { shopee: PlatformInfo; lazada: PlatformInfo };
  today: { revenue: number; orders: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  days: { date: string; revenue: number; orders: number; shopee?: number; lazada?: number }[];
  toPack: { total?: number; readyToShip: number; processed: number; urgent: number; urgentToProcess?: number; urgentToShip?: number };
  cancelledToday: number;
  byPlatform?: { shopee?: PlatformFigures; lazada?: PlatformFigures };
  bestSellers30d: { name: string; units: number; revenue: number }[];
  ads: { shopee: { balance: number; at: string } | null; lazada?: LazadaAds | null };
  profit?: { total: ProfitFigures; byPlatform: { shopee?: ProfitFigures; lazada?: ProfitFigures }; costsEntered: number; note: string } | null;
  returns?: {
    open: number;
    last30: number;
    refund30: number;
    byPlatform: { shopee?: { open: number; last30: number }; lazada?: { open: number; last30: number } };
    recent: ReturnRow[];
    available: boolean;
  };
}
export interface ProfitFigures {
  ordersWithFees: number;
  ordersTotal: number;
  gross: number;
  fees: number;
  net: number;
  feeBreakdown: Record<string, number>;
  productCost: number;
  costCoverage: number;
  adSpend: number;
  estProfit: number;
  margin: number | null;
}
export interface ReturnRow {
  platform: "shopee" | "lazada";
  id: string;
  orderId: string | null;
  status: string;
  type: string | null;
  reason: string | null;
  refund: number;
  items: string;
  requestedAt: string | null;
  dueAt: string | null;
  open: boolean;
}
export interface AdMetrics {
  spend: number;
  revenue: number;
  roi: number | null;
  clicks: number;
  impressions: number;
  unitsSold: number;
  orders: number;
}
export interface LazadaAds {
  at: string;
  today: AdMetrics | null;
  yesterday: AdMetrics | null;
  monthToDate: AdMetrics | null;
  solutions: { discovery: AdMetrics | null; smax: AdMetrics | null };
  autoTopUp: { enabled: boolean; whenBelow: number | null; amount: number | null } | null;
  errors: string[];
}

/** Names of connected marketplaces, e.g. "Shopee + Lazada". */
export function liveSources(s: LiveSummary | null) {
  if (!s) return "";
  return [s.platforms.shopee.connected && "Shopee", s.platforms.lazada.connected && "Lazada"].filter(Boolean).join(" + ");
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
  setup: { supabase: boolean; serviceRole: boolean; encryptionKey: boolean; shopeeApp: boolean; shopeeEnv: "live" | "sandbox" | null; lazadaApp?: boolean; telegramBot?: boolean; cronSecret?: boolean };
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
  syncLazada(): Promise<{ ok: boolean; message: string }>;
  /** sync every connected marketplace */
  syncAll(): Promise<{ ok: boolean; message: string }>;
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
      set({ status: await getJSON<IntegrationStatus>("/api/integrations/status"), error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  syncShopee: () => syncProvider("shopee"),
  syncLazada: () => syncProvider("lazada"),
  async syncAll() {
    const st = get().status;
    const providers = (st?.integrations ?? []).filter((i) => i.status !== "expired" && (i.provider === "shopee" || i.provider === "lazada")).map((i) => i.provider as "shopee" | "lazada");
    if (!providers.length) return { ok: false, message: "No marketplace is connected yet." };
    const results = [];
    for (const p of [...new Set(providers)]) results.push(await syncProvider(p));
    const bad = results.find((r) => !r.ok);
    return bad ?? { ok: true, message: results.map((r) => r.message).join(" ") };
  },
}));

async function syncProvider(provider: "shopee" | "lazada"): Promise<{ ok: boolean; message: string }> {
  const name = provider === "shopee" ? "Shopee" : "Lazada";
  if (useLive.getState().syncing) return { ok: false, message: "A sync is already running." };
  useLive.setState({ syncing: true });
  try {
    const r = await getJSON<{ results: { shop: string; ok: boolean; orders?: number; error?: string }[] }>(`/api/integrations/${provider}/sync`, { method: "POST" });
    await Promise.all([useLive.getState().loadSummary(), useLive.getState().loadStatus()]);
    const bad = r.results.find((x) => !x.ok);
    if (bad) return { ok: false, message: `${name} sync failed: ${bad.error}` };
    const n = r.results.reduce((s, x) => s + (x.orders ?? 0), 0);
    return { ok: true, message: `${name} synced — ${n} order update${n === 1 ? "" : "s"}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    useLive.setState({ syncing: false });
  }
}

/** Load live data on start-up and sync when it's stale (older than 15 minutes). */
export async function bootLiveData(): Promise<string | null> {
  if (!supabaseConfigured) return null;
  const live = useLive.getState();
  await Promise.all([live.loadStatus(), live.loadSummary()]);
  const stale = (useLive.getState().status?.integrations ?? []).filter(
    (i) => (i.provider === "shopee" || i.provider === "lazada") && i.status !== "expired" && (!i.lastSync || Date.now() - Date.parse(i.lastSync) > 15 * 60 * 1000),
  );
  const errors: string[] = [];
  for (const p of [...new Set(stale.map((i) => i.provider as "shopee" | "lazada"))]) {
    const r = await syncProvider(p);
    if (!r.ok) errors.push(r.message);
  }
  return errors.length ? errors.join(" ") : null;
}

/**
 * Keep the dashboard fresh while the office is open: marketplace pushes update the
 * database in the background, so re-read the summary every 30 s while the tab is
 * visible, and straight away when the CEO comes back to the tab.
 */
export function watchLiveData(intervalMs = 30_000): () => void {
  if (!supabaseConfigured || typeof window === "undefined") return () => {};
  const refresh = () => {
    if (document.visibilityState !== "visible") return;
    const live = useLive.getState();
    if (!live.status?.integrations.length || live.syncing) return;
    void Promise.all([live.loadSummary(), live.loadStatus()]);
  };
  const id = window.setInterval(refresh, intervalMs);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", refresh);
  };
}
