import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Orders that never became real sales. */
const NOT_SALES = new Set(["UNPAID", "CANCELLED", "IN_CANCEL", "INVOICE_PENDING"]);

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
  /** total = Shopee Seller Centre "To Ship" (To Process + Processed) */
  toPack: { total: number; readyToShip: number; processed: number; urgent: number };
  cancelledToday: number;
  bestSellers30d: { name: string; units: number; revenue: number }[];
  ads: { shopee: { balance: number; at: string } | null };
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

/**
 * Live e-commerce summary for a workspace, from synced marketplace orders.
 * `sb` should be a user-scoped client (RLS limits rows to the caller's workspace).
 * Returns null when no live integration is connected.
 */
export async function liveSummary(sb: SupabaseClient, workspaceId: string): Promise<LiveSummary | null> {
  const { data: integ } = await sb.from("integration_status").select("*").eq("workspace_id", workspaceId).eq("provider", "shopee").limit(1);
  const shop = integ?.[0] as
    | { shop_name: string | null; last_success_at: string | null; status: string; last_error: string | null; expires_at: string | null }
    | undefined;
  if (!shop) return null;

  const now = new Date();
  const since = new Date(now.getTime() - 32 * 86400 * 1000).toISOString();
  type Row = { status: string; gross_amount: number; ordered_at: string; ship_by: string | null; items: { name: string; model: string | null; qty: number; price: number }[] | null };
  const orders = await fetchAll<Row>((a, b) =>
    sb
      .from("marketplace_orders")
      .select("status, gross_amount, ordered_at, ship_by, items")
      .eq("workspace_id", workspaceId)
      .eq("platform", "shopee")
      .gte("ordered_at", since)
      .order("ordered_at", { ascending: false })
      .range(a, b),
  );
  const pending = await fetchAll<{ status: string; ship_by: string | null }>((a, b) =>
    sb.from("marketplace_orders").select("status, ship_by").eq("workspace_id", workspaceId).eq("platform", "shopee").in("status", ["READY_TO_SHIP", "PROCESSED"]).range(a, b),
  );

  const today = klDay(now);
  const yesterday = klDay(new Date(now.getTime() - 86400 * 1000));
  const month = today.slice(0, 7);
  const byDay = new Map<string, { revenue: number; orders: number }>();
  for (let i = 29; i >= 0; i--) byDay.set(klDay(new Date(now.getTime() - i * 86400 * 1000)), { revenue: 0, orders: 0 });
  let mtd = { revenue: 0, orders: 0 };
  let cancelledToday = 0;
  const sellers = new Map<string, { units: number; revenue: number }>();
  for (const o of orders) {
    const day = klDay(new Date(o.ordered_at));
    if (o.status === "CANCELLED" || o.status === "IN_CANCEL") {
      if (day === today) cancelledToday++;
    }
    if (NOT_SALES.has(o.status)) continue;
    const amt = Number(o.gross_amount) || 0;
    const d = byDay.get(day);
    if (d) {
      d.revenue += amt;
      d.orders++;
    }
    if (day.startsWith(month)) mtd = { revenue: mtd.revenue + amt, orders: mtd.orders + 1 };
    for (const it of o.items ?? []) {
      const key = it.name;
      const s = sellers.get(key) ?? { units: 0, revenue: 0 };
      s.units += it.qty || 0;
      s.revenue += (it.qty || 0) * (it.price || 0);
      sellers.set(key, s);
    }
  }
  const soon = now.getTime() + 24 * 3600 * 1000;
  const { data: ads } = await sb
    .from("ad_balance_snapshots")
    .select("balance, captured_at")
    .eq("workspace_id", workspaceId)
    .eq("platform", "shopee")
    .order("captured_at", { ascending: false })
    .limit(1);

  const round = (n: number) => Math.round(n * 100) / 100;
  const days = [...byDay.entries()].map(([date, v]) => ({ date, revenue: round(v.revenue), orders: v.orders }));
  return {
    live: true,
    currency: "MYR",
    definition: "Gross order value from Shopee (order total paid by buyers incl. buyer-paid shipping, after Shopee promotions; before fees, refunds and payouts). Unpaid and cancelled orders excluded. Dates in Malaysia time.",
    platforms: {
      shopee: {
        connected: shop.status === "connected",
        shopName: shop.shop_name,
        lastSync: shop.last_success_at,
        status: shop.status,
        lastError: shop.last_error,
        expiresAt: shop.expires_at,
      },
      lazada: { connected: false },
    },
    today: byDay.get(today) ? { revenue: round(byDay.get(today)!.revenue), orders: byDay.get(today)!.orders } : { revenue: 0, orders: 0 },
    yesterday: byDay.get(yesterday) ? { revenue: round(byDay.get(yesterday)!.revenue), orders: byDay.get(yesterday)!.orders } : { revenue: 0, orders: 0 },
    monthToDate: { revenue: round(mtd.revenue), orders: mtd.orders },
    days,
    toPack: {
      total: pending.length,
      readyToShip: pending.filter((p) => p.status === "READY_TO_SHIP").length,
      processed: pending.filter((p) => p.status === "PROCESSED").length,
      // both statuses still have to leave the warehouse before the ship-by deadline
      urgent: pending.filter((p) => p.ship_by && Date.parse(p.ship_by) < soon).length,
    },
    cancelledToday,
    bestSellers30d: [...sellers.entries()]
      .map(([name, v]) => ({ name, units: v.units, revenue: round(v.revenue) }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 8),
    ads: { shopee: ads?.[0] ? { balance: Number(ads[0].balance), at: ads[0].captured_at as string } : null },
  };
}
