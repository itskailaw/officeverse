import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LAZADA_STATUS } from "./lazada/sign";
import type { LazadaAds } from "./lazada/ads";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { skuPrices, unitCost, type CostContext, type CostRecipes } from "@/lib/data/costs";
import { itemKey } from "@/lib/data/stock";
import type { Inventory } from "@/lib/data/inventory";

type Platform = "shopee" | "lazada";
const up = (s: Set<string>) => new Set([...s].map((x) => x.toUpperCase()));

/** Per-platform status meaning (stored statuses are upper-case). */
export const STATUS: Record<Platform, { toProcess: Set<string>; awaitingPickup: Set<string>; notSales: Set<string>; cancelled: Set<string> }> = {
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

export interface ProfitFigures {
  /** month-to-date orders that already have payout data from the marketplace */
  ordersWithFees: number;
  ordersTotal: number;
  gross: number;
  fees: number;
  net: number;
  feeBreakdown: Record<string, number>;
  productCost: number;
  /** share of sold units that have a product cost entered (0-1) */
  costCoverage: number;
  adSpend: number;
  estProfit: number;
  margin: number | null;
}
export interface ReturnRow {
  platform: Platform;
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
  profit: { total: ProfitFigures; byPlatform: Partial<Record<Platform, ProfitFigures>>; costsEntered: number; uncosted?: { name: string; variation: string; units: number }[]; note: string } | null;
  returns: { open: number; last30: number; refund30: number; byPlatform: Partial<Record<Platform, { open: number; last30: number }>>; recent: ReturnRow[]; available: boolean };
}

const CLOSED_RETURN = /CANCEL|CLOSED|COMPLETE|SUCCESS|REFUNDED|ACCEPTED|REJECT|FINISH/;

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
  type Row = {
    platform: Platform;
    status: string;
    gross_amount: number;
    ordered_at: string;
    items: { name: string; qty: number; price: number; model?: string | null; sku?: string | null }[] | null;
    net_amount?: number | null;
    fees?: Record<string, number | boolean> | null;
  };
  // net_amount / fees arrive with the 0005 database update — fall back gracefully before it is run
  let hasFees = true;
  const orders = await fetchAll<Row>((a, b) =>
    sb
      .from("marketplace_orders")
      .select("platform, status, gross_amount, ordered_at, items, net_amount, fees")
      .eq("workspace_id", workspaceId)
      .in("platform", platforms)
      .gte("ordered_at", since)
      .order("ordered_at", { ascending: false })
      .range(a, b),
  ).catch(async (e: Error) => {
    if (!/net_amount|fees|column/i.test(e.message)) throw e;
    hasFees = false;
    return fetchAll<Row>((a, b) =>
      sb
        .from("marketplace_orders")
        .select("platform, status, gross_amount, ordered_at, items")
        .eq("workspace_id", workspaceId)
        .in("platform", platforms)
        .gte("ordered_at", since)
        .order("ordered_at", { ascending: false })
        .range(a, b),
    );
  });
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

  // ── profit (month to date): marketplace payouts − product cost − ad spend ──
  let costs: Record<string, number> = {};
  let costCtx: CostContext = { prices: new Map() };
  try {
    const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", workspaceId).maybeSingle();
    const st = (lay?.settings ?? null) as { productCosts?: Record<string, number>; costRecipes?: CostRecipes; inventory?: Inventory } | null;
    const pc = st?.productCosts;
    if (pc && typeof pc === "object") costs = Object.fromEntries(Object.entries(pc).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    costCtx = { prices: skuPrices(st?.inventory), skus: (st?.inventory?.skus ?? []).map((x) => x.sku), recipes: st?.costRecipes ?? null, byName: costs };
  } catch {}
  const costRules = Object.keys(costs).length + Object.keys(costCtx.recipes ?? {}).length + costCtx.prices.size;
  const uncosted = new Map<string, { name: string; variation: string; units: number }>();
  const emptyProfit = (): ProfitFigures => ({ ordersWithFees: 0, ordersTotal: 0, gross: 0, fees: 0, net: 0, feeBreakdown: {}, productCost: 0, costCoverage: 0, adSpend: 0, estProfit: 0, margin: null });
  const prof: Partial<Record<Platform, ProfitFigures & { units: number; costedUnits: number }>> = {};
  for (const p of platforms) prof[p] = { ...emptyProfit(), units: 0, costedUnits: 0 };
  for (const o of orders) {
    const st = STATUS[o.platform];
    if (st.notSales.has(o.status) || !klDay(new Date(o.ordered_at)).startsWith(month)) continue;
    const pf = prof[o.platform];
    if (!pf) continue;
    pf.ordersTotal++;
    if (o.net_amount == null) continue;
    pf.ordersWithFees++;
    pf.gross += Number(o.gross_amount) || 0;
    pf.net += Number(o.net_amount) || 0;
    for (const [k, v] of Object.entries(o.fees ?? {})) if (typeof v === "number") pf.feeBreakdown[k] = (pf.feeBreakdown[k] ?? 0) + v;
    for (const it of o.items ?? []) {
      pf.units += it.qty || 0;
      const c = unitCost(it, costCtx).cost;
      if (c != null) {
        pf.productCost += c * (it.qty || 0);
        pf.costedUnits += it.qty || 0;
      } else {
        const k = itemKey(it);
        const u = uncosted.get(k) ?? { name: it.name, variation: it.model ?? "", units: 0 };
        u.units += it.qty || 0;
        uncosted.set(k, u);
      }
    }
  }
  const finish = (pf: ProfitFigures & { units?: number; costedUnits?: number }, adSpend: number): ProfitFigures => {
    const net = round(pf.net);
    const est = round(net - pf.productCost - adSpend);
    return {
      ordersWithFees: pf.ordersWithFees,
      ordersTotal: pf.ordersTotal,
      gross: round(pf.gross),
      fees: round(net - pf.gross),
      net,
      feeBreakdown: Object.fromEntries(Object.entries(pf.feeBreakdown).map(([k, v]) => [k, round(v)])),
      productCost: round(pf.productCost),
      costCoverage: pf.units ? Math.round(((pf.costedUnits ?? 0) / pf.units) * 100) / 100 : 0,
      adSpend: round(adSpend),
      estProfit: est,
      margin: pf.gross > 0 ? Math.round((est / pf.gross) * 1000) / 10 : null,
    };
  };

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

  const profitBy: Partial<Record<Platform, ProfitFigures>> = {};
  for (const p of platforms) profitBy[p] = finish(prof[p]!, p === "lazada" ? (lazadaAds?.monthToDate?.spend ?? 0) : 0);
  const pv = Object.values(profitBy) as ProfitFigures[];
  const totalRaw = {
    ...emptyProfit(),
    ordersWithFees: pv.reduce((a, x) => a + x.ordersWithFees, 0),
    ordersTotal: pv.reduce((a, x) => a + x.ordersTotal, 0),
    gross: pv.reduce((a, x) => a + x.gross, 0),
    net: pv.reduce((a, x) => a + x.net, 0),
    productCost: pv.reduce((a, x) => a + x.productCost, 0),
    feeBreakdown: pv.reduce<Record<string, number>>((acc, x) => {
      for (const [k, v] of Object.entries(x.feeBreakdown)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}),
  };
  const units = platforms.reduce((a, p) => a + (prof[p]?.units ?? 0), 0);
  const costed = platforms.reduce((a, p) => a + (prof[p]?.costedUnits ?? 0), 0);
  const totalProfit = finish({ ...totalRaw, units, costedUnits: costed }, pv.reduce((a, x) => a + x.adSpend, 0));

  // ── returns / refunds (last 60 days) ──
  let returnsBlock: LiveSummary["returns"] = { open: 0, last30: 0, refund30: 0, byPlatform: {}, recent: [], available: false };
  try {
    const { data: rets, error: rerr } = await sb
      .from("marketplace_returns")
      .select("platform, external_id, order_id, status, request_type, reason, refund_amount, items, requested_at, due_at")
      .eq("workspace_id", workspaceId)
      .gte("requested_at", new Date(now.getTime() - 60 * 86400 * 1000).toISOString())
      .order("requested_at", { ascending: false })
      .limit(300);
    if (!rerr) {
      const cut30 = now.getTime() - 30 * 86400 * 1000;
      const list: ReturnRow[] = (rets ?? []).map((r) => ({
        platform: r.platform as Platform,
        id: r.external_id as string,
        orderId: (r.order_id as string) ?? null,
        status: r.status as string,
        type: (r.request_type as string) ?? null,
        reason: (r.reason as string) ?? null,
        refund: Number(r.refund_amount) || 0,
        items: ((r.items as { name: string; qty?: number }[] | null) ?? []).map((i) => `${i.name}${(i.qty ?? 1) > 1 ? ` ×${i.qty}` : ""}`).join(", "),
        requestedAt: (r.requested_at as string) ?? null,
        dueAt: (r.due_at as string) ?? null,
        open: !CLOSED_RETURN.test(String(r.status)),
      }));
      const by: LiveSummary["returns"]["byPlatform"] = {};
      for (const r of list) {
        const b = (by[r.platform] ??= { open: 0, last30: 0 });
        if (r.open) b.open++;
        if (r.requestedAt && Date.parse(r.requestedAt) >= cut30) b.last30++;
      }
      returnsBlock = {
        open: list.filter((r) => r.open).length,
        last30: list.filter((r) => r.requestedAt && Date.parse(r.requestedAt) >= cut30).length,
        refund30: round(list.filter((r) => r.requestedAt && Date.parse(r.requestedAt) >= cut30).reduce((a, r) => a + r.refund, 0)),
        byPlatform: by,
        recent: list.sort((a, b) => Number(b.open) - Number(a.open)).slice(0, 10),
        available: true,
      };
    }
  } catch {}

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
    profit: hasFees
      ? {
          total: totalProfit,
          byPlatform: profitBy,
          costsEntered: costRules,
          uncosted: [...uncosted.values()].sort((a, b) => b.units - a.units).slice(0, 12),
          note: "Month to date. Net payout = what the marketplace pays after its fees (only orders with payout data yet). Estimated profit = net payout − product cost (per variation, from Stock-in SKU prices) − ad spend tracked so far (Lazada only; Shopee ad spend not tracked yet).",
        }
      : null,
    returns: returnsBlock,
  };
}
