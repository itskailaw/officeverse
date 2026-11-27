/** Ad spend keyed in by hand (pure — unit-tested; used by server and browser). */

export type AdChannel = "shopee" | "lazada" | "facebook" | "tiktok" | "google" | "other";
export const AD_CHANNELS: { id: AdChannel; label: string; color: string }[] = [
  { id: "shopee", label: "Shopee Ads", color: "#eb6834" },
  { id: "lazada", label: "Lazada Ads", color: "#2a78d6" },
  { id: "facebook", label: "Facebook / Instagram", color: "#4f46e5" },
  { id: "tiktok", label: "TikTok", color: "#111827" },
  { id: "google", label: "Google", color: "#16a34a" },
  { id: "other", label: "Other", color: "#64748b" },
];

export interface AdEntry {
  id: string;
  /** YYYY-MM-DD (Malaysia time) */
  date: string;
  channel: AdChannel;
  /** RM spent (or topped up) */
  amount: number;
  note?: string;
}

export interface MonthAds {
  byChannel: Partial<Record<AdChannel, number>>;
  /** Shopee + Lazada (the marketplaces) */
  marketplaces: number;
  /** Facebook, TikTok, Google, other */
  outside: number;
  total: number;
  entries: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

/** Totals for one month ("YYYY-MM"). */
export function monthAds(entries: AdEntry[] | null | undefined, month: string): MonthAds {
  const byChannel: Partial<Record<AdChannel, number>> = {};
  let n = 0;
  for (const e of entries ?? []) {
    if (!e?.date?.startsWith(month) || !(Number(e.amount) > 0)) continue;
    byChannel[e.channel] = money((byChannel[e.channel] ?? 0) + Number(e.amount));
    n++;
  }
  const marketplaces = money((byChannel.shopee ?? 0) + (byChannel.lazada ?? 0));
  const outside = money((byChannel.facebook ?? 0) + (byChannel.tiktok ?? 0) + (byChannel.google ?? 0) + (byChannel.other ?? 0));
  return { byChannel, marketplaces, outside, total: money(marketplaces + outside), entries: n };
}

/**
 * Ad spend per marketplace for the profit maths: what you keyed in wins; Lazada falls back to the synced figure
 * when you haven't keyed in any Lazada spend this month (so it's never counted twice).
 */
export function platformAdSpend(m: MonthAds, syncedLazada: number | null | undefined): { shopee: number; lazada: number; lazadaSource: "manual" | "synced" | "none" } {
  const manualLz = m.byChannel.lazada ?? 0;
  const lz = manualLz > 0 ? manualLz : (syncedLazada ?? 0);
  return { shopee: m.byChannel.shopee ?? 0, lazada: money(lz), lazadaSource: manualLz > 0 ? "manual" : syncedLazada ? "synced" : "none" };
}
