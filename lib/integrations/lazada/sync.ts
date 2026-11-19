import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { readTokens, saveIntegration, updateIntegration, type IntegrationRow } from "../store";
import { lazadaGet, LazadaError, refreshToken, requireLazadaConfig, type LazadaConfig } from "./api";
import { syncLazadaFees, syncLazadaReturns } from "./extras";
import { fetchLazadaAds, type LazadaAds } from "./ads";
import { LAZADA_STATUS, lazadaTime, parseLazadaDate } from "./sign";

const DAY = 86400 * 1000;
const FIRST_SYNC_DAYS = 30;
const MAX_ORDERS_PER_SYNC = 4000;

interface LzOrder {
  order_id: number | string;
  created_at: string;
  updated_at: string;
  price: string | number;
  statuses: string[];
  items_count?: number;
}
interface LzItem {
  order_id: number | string;
  name: string;
  sku?: string;
  variation?: string;
  paid_price?: string | number;
  item_price?: string | number;
  status?: string;
  promised_shipping_time?: string;
}

export async function validToken(cfg: LazadaConfig, row: IntegrationRow): Promise<string> {
  const tokens = readTokens(row);
  const exp = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (exp - Date.now() > 12 * 3600 * 1000) return tokens.access_token;
  const t = await refreshToken(cfg, tokens.refresh_token);
  await saveIntegration({
    workspace_id: row.workspace_id,
    provider: "lazada",
    shop_id: row.shop_id!,
    tokens: { access_token: t.access_token, refresh_token: t.refresh_token },
    token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    status: "connected",
  });
  return t.access_token;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Incremental Lazada sync: orders updated since the last sync (first time: 30 days) and their items. */
export async function syncLazada(row: IntegrationRow) {
  const cfg = requireLazadaConfig();
  const sb = getAdminSupabase();
  const warnings: string[] = [];
  const { data: run } = await sb.from("sync_runs").insert({ workspace_id: row.workspace_id, integration_id: row.id, source: "api", status: "running" }).select("id").single();
  const runId = (run?.id as number | undefined) ?? null;

  try {
    const token = await validToken(cfg, row);
    const now = Date.now();
    const last = row.last_success_at ? Date.parse(row.last_success_at) - 3600 * 1000 : 0;
    const from = new Date(Math.max(last, now - FIRST_SYNC_DAYS * DAY));

    // 1. orders updated since `from`, 100 per page
    const orders: LzOrder[] = [];
    for (let offset = 0; ; offset += 100) {
      const d = await lazadaGet<{ count: number; orders: LzOrder[] }>(
        cfg,
        "/orders/get",
        { update_after: lazadaTime(from), sort_by: "updated_at", sort_direction: "ASC", offset, limit: 100 },
        token,
      );
      orders.push(...(d?.orders ?? []));
      if (orders.length >= MAX_ORDERS_PER_SYNC) {
        warnings.push(`Stopped at ${MAX_ORDERS_PER_SYNC} orders for this sync; the next sync continues from here.`);
        break;
      }
      if (!d?.orders || d.orders.length < 100) break;
    }

    // 2. items in batches of 50 orders (name, SKU, price, ship-by time)
    const items = new Map<string, LzItem[]>();
    for (let i = 0; i < orders.length; i += 50) {
      const ids = orders.slice(i, i + 50).map((o) => Number(o.order_id));
      const d = await lazadaGet<{ order_id: number | string; order_items: LzItem[] }[]>(cfg, "/orders/items/get", { order_ids: JSON.stringify(ids) }, token);
      for (const o of d ?? []) items.set(String(o.order_id), o.order_items ?? []);
    }

    // 3. upsert by (workspace, platform, order id) — no double counting, no buyer personal data
    const unknown = new Set<string>();
    const known = new Set([...LAZADA_STATUS.toProcess, ...LAZADA_STATUS.awaitingPickup, ...LAZADA_STATUS.notSales, "shipped", "delivered", "confirmed"]);
    const rows = orders.map((o) => {
      const status = (o.statuses?.[0] ?? "unknown").toLowerCase();
      if (!known.has(status)) unknown.add(status);
      const its = items.get(String(o.order_id)) ?? [];
      const shipBy = its
        .map((it) => parseLazadaDate(it.promised_shipping_time))
        .filter((x): x is string => !!x)
        .sort()[0] ?? null;
      // Lazada returns one row per unit; group identical products
      const grouped = new Map<string, { name: string; model: string | null; sku: string | null; qty: number; price: number }>();
      for (const it of its) {
        const key = `${it.sku ?? it.name}|${it.variation ?? ""}`;
        const g = grouped.get(key) ?? { name: it.name, model: it.variation || null, sku: it.sku || null, qty: 0, price: num(it.paid_price ?? it.item_price) };
        g.qty += 1;
        grouped.set(key, g);
      }
      return {
        workspace_id: row.workspace_id,
        company_id: row.company_id ?? "co-wgs",
        platform: "lazada",
        external_order_id: String(o.order_id),
        status: status.toUpperCase(),
        gross_amount: num(o.price),
        currency: "MYR",
        ship_by: shipBy,
        ordered_at: parseLazadaDate(o.created_at) ?? new Date().toISOString(),
        updated_at: parseLazadaDate(o.updated_at),
        source: "api",
        sync_run_id: runId,
        items: [...grouped.values()],
        raw: { statuses: o.statuses },
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from("marketplace_orders").upsert(rows.slice(i, i + 500), { onConflict: "workspace_id,platform,external_order_id" });
      if (error) throw new Error(`Saving Lazada orders failed: ${error.message}`);
    }
    if (unknown.size) warnings.push(`New Lazada order status seen: ${[...unknown].join(", ")}. Counted as sales but not as parcels to ship — tell us so we can classify it.`);

    // 4. Sponsored Solutions (read-only); refreshed at most every 10 minutes, never fails the order sync
    const prevAds = (row.last_sync_summary?.ads ?? null) as LazadaAds | null;
    let ads = prevAds;
    if (!prevAds || Date.now() - Date.parse(prevAds.at) > 10 * 60 * 1000) {
      try {
        ads = await fetchLazadaAds(cfg, token);
      } catch (e) {
        warnings.push(`Lazada ads data couldn't be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (ads?.errors.length && !ads.today && !ads.autoTopUp)
      warnings.push(`Lazada ads data unavailable (${ads.errors[0]}). If you just enabled Sponsor Solution, click Re-connect.`);

    // 5. fees / payouts (every 6 h) and return requests — optional, never fail the order sync
    const prevSum = row.last_sync_summary as { financeAt?: string } | null;
    let financeAt = prevSum?.financeAt ?? null;
    let feesSynced = 0;
    if (!financeAt || Date.now() - Date.parse(financeAt) > 6 * 3600 * 1000) {
      feesSynced = await syncLazadaFees(cfg, token, row.workspace_id, warnings);
      financeAt = new Date().toISOString();
    }
    const returns = await syncLazadaReturns(cfg, token, row.workspace_id, warnings);

    const summary = { orders: rows.length, from: from.toISOString(), to: new Date(now).toISOString(), warnings, ads, financeAt, feesSynced, returns };
    await updateIntegration(row.id, { last_success_at: new Date().toISOString(), last_error: null, status: "connected", last_sync_summary: summary });
    if (runId) await sb.from("sync_runs").update({ status: "succeeded", records_in: orders.length, records_new: rows.length, finished_at: new Date().toISOString() }).eq("id", runId);
    return summary;
  } catch (e) {
    const msg = e instanceof LazadaError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    const expired = e instanceof LazadaError && /token|session|auth/i.test(e.code + e.message);
    await updateIntegration(row.id, { last_error: msg, status: expired ? "expired" : "error" });
    if (runId) await sb.from("sync_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", runId);
    throw e;
  }
}
