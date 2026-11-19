import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LAZADA_STATUS } from "./lazada/sign";
import type { LazadaAds } from "./lazada/ads";
import { getAdminSupabase } from "@/lib/supabase/admin";

type Platform = "shopee" | "lazada";
const up = (s: Set<string>) => new Set([...s].map((x) => x.toUpperCase()));

/** Per-platform status meaning (stored statuses are upper-case). */
const STATUS: Record<Platform, { toProcess: Set<string>; awaitingPickup: Set<string>; notSales: Set<string>; cancelled: Set<string> }> = {
  shopee: {
    toProcess: new Set(["READY_TO_SHIP"]),
    awaitingPickup: new Set(["PROCESSED"]),
    notSales: new Set(["UNPAID", "CANCELLED", "IN_CANCEL", "INVOICE_PENDING"]),
    cancelled: new Set(["CANCELLED", "IN_CANCEL"]),
  },
  lazada: {
    toProcess: up(LAZADA_STATUS.toProcess),
    awaitingPickup: up(LAZADA_STATUS.awaitingPickup),
    notSales: up(LAZADA_STATUS.notSales),
    cancelled: new Set(["CANCELED", "CANCELLED"]),
  },
};

export interface PlatformInfo {
  connected: boolean;
  shopName: string | null;
  lastSync: string | null;
  status: string | null;
  lastError: string | null;
  expiresAt: string | null;
}
export interface PlatformFigures {
  today: { revenue: number; orders: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  toPack: { total: number; readyToShip: number; processed: number; urgent: number; urgentToProcess: number; urgentToShip: number };
  cancelledToday: number;
  bestSellers30d: { name: string; units: number; revenue: number }[];
}

export interface LiveSummary {
  live: true;
  currency: "MYR";
  definition: string;
  platforms: { shopee: PlatformInfo | { connected: false }; lazada: PlatformInfo | { connected: false } };
  /** totals across connected platforms */
  today: { revenue: number; orders: number };
  yesterday: { revenue: number; orders: number };
  monthToDate: { revenue: number; orders: number };
  days: { date: string; revenue: number; orders: number; shopee: number; lazada: number }[];
  /** total = Seller Centre "To Ship" (To Process + Processed / Packed, awaiting pickup) */
  toPack: { total: number; readyToShip: number; processed: number; urgent: number; urgentToProcess: number; urgentToShip: number };
  cancelledToday: number;
  byPlatform: Partial<Record<Platform, PlatformFigures>>;
  bestSellers30d: { name: string; units: number; revenue: number }[];
  ads: { shopee: { balance: number; at: string } | null; lazada: LazadaAds | null };
}

const klDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

async function fetchAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000 || out.length >= 20000) break;
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
const zero = () => ({ revenue: 0, orders: 0 });

/**
 * Live e-commerce summary from synced marketplace orders (Shopee and/or Lazada).
 * `sb` should be a user-scoped client (RLS limits rows to the caller's workspace).
 * Returns null when no marketplace is connected.
 */
export async function liveSummary(sb: SupabaseClient, workspaceId: string, opts: { serviceRole?: boolean } = {}): Promise<LiveSummary | null> {
  // The integration_status view filters by the signed-in member (auth.uid()); server jobs
  // without a user (cron briefing) read the table directly with the service-role client.
  const { data: integ, error: integErr } = await sb
    .from(opts.serviceRole ? "integrations" : "integration_status")
    .select("provider, shop_name, last_success_at, status, last_error, expires_at")
    .eq("workspace_id", workspaceId)
    .in("provider", ["shopee", "lazada"]);
  if (integErr) throw new Error(`Couldn't read marketplace connections: ${integErr.message}`);
  type I = { provider: Platform; shop_name: string | null; last_success_at: string | null; status: string; last_error: string | null; expires_at: string | null };
  const conns = (integ ?? []) as I[];
  if (!conns.length) return null;
  const info = (p: Platform): PlatformInfo | { connected: false } => {
    const c = conns.find((x) => x.provider === p);
    return c
      ? { connected: c.status === "connected", shopName: c.shop_name, lastSync: c.last_success_at, status: c.status, lastError: c.last_error, expiresAt: c.expires_at }
      : { connected: false };
  };
  const platforms = [...new Set(conns.map((c) => c.provider))];

  const now = new Date();
  const since = new Date(now.getTime() - 32 * 86400 * 1000).toISOString();
  type Row = { platform: Platform; status: string; gross_amount: number; ordered_at: string; items: { name: string; qty: number; price: number }[] | null };
  const orders = await fetchAll<Row>((a, b) =>
    sb
      .from("marketplace_orders")
      .select("platform, status, gross_amount, ordered_at, items")
      .eq("workspace_id", workspaceId)
      .in("platform", platforms)
      .gte("ordered_at", since)
      .order("ordered_at", { ascending: false })
      .range(a, b),
  );
  const openStatuses = platforms.flatMap((p) => [...STATUS[p].toProcess, ...STATUS[p].awaitingPickup]);
  const pending = await fetchAll<{ platform: Platform; status: string; ship_by: string | null }>((a, b) =>
    sb.from("marketplace_orders").select("platform, status, ship_by").eq("workspace_id", workspaceId).in("platform", platforms).in("status", openStatuses).range(a, b),
  );

  const today = klDay(now);
  const yesterday = klDay(new Date(now.getTime() - 86400 * 1000));
  const month = today.slice(0, 7);
  const soon = now.getTime() + 24 * 3600 * 1000;

  const byDay = new Map<string, { revenue: number; orders: number; shopee: number; lazada: number }>();
  for (let i = 29; i >= 0; i--) byDay.set(klDay(new Date(now.getTime() - i * 86400 * 1000)), { revenue: 0, orders: 0, shopee: 0, lazada: 0 });
  const fig: Partial<Record<Platform, PlatformFigures>> = {};
  for (const p of platforms) fig[p] = { today: zero(), yesterday: zero(), monthToDate: zero(), toPack: { total: 0, readyToShip: 0, processed: 0, urgent: 0, urgentToProcess: 0, urgentToShip: 0 }, cancelledToday: 0, bestSellers30d: [] };
  const sellers = new Map<string, { units: number; revenue: number }>();
  const sellersBy: Record<Platform, Map<string, { units: number; revenue: number }>> = { shopee: new Map(), lazada: new Map() };

  for (const o of orders) {
    const f = fig[o.platform];
    if (!f) continue;
    const st = STATUS[o.platform];
    const day = klDay(new Date(o.ordered_at));
    if (st.cancelled.has(o.status) && day === today) f.cancelledToday++;
    if (st.notSales.has(o.status)) continue;
    const amt = Number(o.gross_amount) || 0;
    const d = byDay.get(day);
    if (d) {
      d.revenue += amt;
      d.orders++;
      d[o.platform] += amt;
    }
    const add = (x: { revenue: number; orders: number }) => {
      x.revenue += amt;
      x.orders++;
    };
    if (day === today) add(f.today);
    if (day === yesterday) add(f.yesterday);
    if (day.startsWith(month)) add(f.monthToDate);
    for (const it of o.items ?? []) {
      for (const m of [sellers, sellersBy[o.platform]]) {
        const s = m.get(it.name) ?? { units: 0, revenue: 0 };
        s.units += it.qty || 0;
        s.revenue += (it.qty || 0) * (it.price || 0);
        m.set(it.name, s);
      }
    }
  }
  for (const p of pending) {
    const f = fig[p.platform];
    if (!f) continue;
    const st = STATUS[p.platform];
    f.toPack.total++;
    const isUrgent = !!p.ship_by && Date.parse(p.ship_by) < soon;
    if (st.toProcess.has(p.status)) {
      f.toPack.readyToShip++;
      if (isUrgent) f.toPack.urgentToProcess++;
    } else {
      f.toPack.processed++;
      if (isUrgent) f.toPack.urgentToShip++;
    }
    if (isUrgent) f.toPack.urgent++;
  }

  const sum = (pick: (f: PlatformFigures) => { revenue: number; orders: number }) => {
    const t = zero();
    for (const f of Object.values(fig)) {
      const x = pick(f!);
      t.revenue += x.revenue;
      t.orders += x.orders;
    }
    return { revenue: round(t.revenue), orders: t.orders };
  };
  for (const f of Object.values(fig)) {
    for (const k of ["today", "yesterday", "monthToDate"] as const) f![k].revenue = round(f![k].revenue);
  }
  const top = (m: Map<string, { units: number; revenue: number }>) =>
    [...m.entries()]
      .map(([name, v]) => ({ name, units: v.units, revenue: round(v.revenue) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8);
  for (const p of platforms) fig[p]!.bestSellers30d = top(sellersBy[p]);
  const vals = Object.values(fig) as PlatformFigures[];

  const { data: ads } = await sb
    .from("ad_balance_snapshots")
    .select("balance, captured_at")
    .eq("workspace_id", workspaceId)
    .eq("platform", "shopee")
    .order("captured_at", { ascending: false })
    .limit(1);

  // Lazada ads figures live in the integration's last sync summary (admin read, scoped to this workspace).
  let lazadaAds: LazadaAds | null = null;
  if (platforms.includes("lazada")) {
    try {
      const { data: lz } = await getAdminSupabase().from("integrations").select("last_sync_summary").eq("workspace_id", workspaceId).eq("provider", "lazada").limit(1);
      const a = (lz?.[0]?.last_sync_summary as { ads?: LazadaAds } | null)?.ads ?? null;
      lazadaAds = a && (a.today || a.monthToDate || a.autoTopUp) ? a : null;
    } catch {
      lazadaAds = null;
    }
  }

  return {
    live: true,
    currency: "MYR",
    definition:
      "Gross order value per marketplace (what buyers paid for the order, before marketplace fees, refunds and payouts). Unpaid, cancelled and failed orders excluded. Dates in Malaysia time.",
    platforms: { shopee: info("shopee"), lazada: info("lazada") },
    today: sum((f) => f.today),
    yesterday: sum((f) => f.yesterday),
    monthToDate: sum((f) => f.monthToDate),
    days: [...byDay.entries()].map(([date, v]) => ({ date, revenue: round(v.revenue), orders: v.orders, shopee: round(v.shopee), lazada: round(v.lazada) })),
    toPack: {
      total: vals.reduce((s, f) => s + f.toPack.total, 0),
      readyToShip: vals.reduce((s, f) => s + f.toPack.readyToShip, 0),
      processed: vals.reduce((s, f) => s + f.toPack.processed, 0),
      urgent: vals.reduce((s, f) => s + f.toPack.urgent, 0),
      urgentToProcess: vals.reduce((s, f) => s + f.toPack.urgentToProcess, 0),
      urgentToShip: vals.reduce((s, f) => s + f.toPack.urgentToShip, 0),
    },
    cancelledToday: vals.reduce((s, f) => s + f.cancelledToday, 0),
    byPlatform: fig,
    bestSellers30d: top(sellers),
    ads: { shopee: ads?.[0] ? { balance: Number(ads[0].balance), at: ads[0].captured_at as string } : null, lazada: lazadaAds },
  };
}
