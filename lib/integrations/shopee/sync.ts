import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { readTokens, saveIntegration, updateIntegration, type IntegrationRow } from "../store";
import { refreshAccessToken, requireShopeeConfig, shopGet, ShopeeError, type ShopeeConfig } from "./api";
import { syncShopeeFees, syncShopeeReturns } from "./extras";
import { windows } from "./sign";

const DAY = 86400;
const FIRST_SYNC_DAYS = 30;
const MAX_ORDERS_PER_SYNC = 4000;

interface OrderListResponse {
  response: { more: boolean; next_cursor: string; order_list: { order_sn: string }[] };
}
interface OrderDetail {
  order_sn: string;
  order_status: string;
  currency: string;
  total_amount?: number;
  create_time: number;
  update_time: number;
  pay_time?: number | null;
  ship_by_date?: number;
  cancel_reason?: string;
  fulfillment_flag?: string;
  item_list?: {
    item_id: number;
    item_name: string;
    item_sku?: string;
    model_name?: string;
    model_sku?: string;
    model_quantity_purchased: number;
    model_discounted_price?: number;
    model_original_price?: number;
  }[];
}
interface OrderDetailResponse {
  response: { order_list: OrderDetail[] };
}

export interface SyncResult {
  orders: number;
  from: string;
  to: string;
  adsBalance: number | null;
  warnings: string[];
}

const iso = (sec?: number | null) => (sec ? new Date(sec * 1000).toISOString() : null);

/** Return a valid access token, refreshing (and persisting) it when it is about to expire. */
async function validToken(cfg: ShopeeConfig, row: IntegrationRow): Promise<string> {
  const tokens = readTokens(row);
  const exp = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  if (exp - Date.now() > 10 * 60 * 1000) return tokens.access_token;
  const shopId = Number(row.shop_id);
  const fresh = await refreshAccessToken(cfg, tokens.refresh_token, shopId);
  await saveIntegration({
    workspace_id: row.workspace_id,
    provider: "shopee",
    shop_id: String(shopId),
    tokens: { access_token: fresh.access_token, refresh_token: fresh.refresh_token },
    token_expires_at: new Date(Date.now() + fresh.expire_in * 1000).toISOString(),
    status: "connected",
  });
  return fresh.access_token;
}

/**
 * Incremental sync for one connected Shopee shop:
 * orders updated since the last successful sync (first time: last 30 days),
 * their details (amounts, items, deadlines — no buyer personal data), and the ads credit balance.
 */
export async function syncShopee(row: IntegrationRow): Promise<SyncResult> {
  const cfg = requireShopeeConfig();
  const sb = getAdminSupabase();
  const shopId = Number(row.shop_id);
  const warnings: string[] = [];

  const { data: run } = await sb
    .from("sync_runs")
    .insert({ workspace_id: row.workspace_id, integration_id: row.id, source: "api", status: "running" })
    .select("id")
    .single();
  const runId = (run?.id as number | undefined) ?? null;

  try {
    const token = await validToken(cfg, row);
    const to = Math.floor(Date.now() / 1000);
    const last = row.last_success_at ? Math.floor(Date.parse(row.last_success_at) / 1000) - 3600 : 0;
    const from = Math.max(last, to - FIRST_SYNC_DAYS * DAY);

    // 1. collect order numbers changed in the range (max 15-day windows, 100 per page)
    const sns: string[] = [];
    outer: for (const [a, b] of windows(from, to)) {
      let cursor = "";
      for (;;) {
        const r = await shopGet<OrderListResponse>(
          cfg,
          "/api/v2/order/get_order_list",
          { time_range_field: "update_time", time_from: a, time_to: b, page_size: 100, cursor: cursor || undefined },
          token,
          shopId,
        );
        for (const o of r.response?.order_list ?? []) sns.push(o.order_sn);
        if (sns.length >= MAX_ORDERS_PER_SYNC) {
          warnings.push(`Stopped at ${MAX_ORDERS_PER_SYNC} orders for this sync; the next sync continues from here.`);
          break outer;
        }
        if (!r.response?.more || !r.response.next_cursor) break;
        cursor = r.response.next_cursor;
      }
    }

    // 2. details in batches of 50, upserted by (workspace, platform, order_sn) so nothing is double-counted
    let saved = 0;
    for (let i = 0; i < sns.length; i += 50) {
      const batch = sns.slice(i, i + 50);
      const r = await shopGet<OrderDetailResponse>(
        cfg,
        "/api/v2/order/get_order_detail",
        { order_sn_list: batch.join(","), response_optional_fields: "total_amount,item_list,pay_time,cancel_reason,fulfillment_flag" },
        token,
        shopId,
      );
      const rows = (r.response?.order_list ?? []).map((o) => ({
        workspace_id: row.workspace_id,
        company_id: row.company_id ?? "co-wgs",
        platform: "shopee",
        external_order_id: o.order_sn,
        status: o.order_status,
        gross_amount: Number(o.total_amount ?? 0),
        currency: o.currency || "MYR",
        ship_by: iso(o.ship_by_date),
        ordered_at: iso(o.create_time)!,
        pay_time: iso(o.pay_time),
        updated_at: iso(o.update_time),
        source: "api",
        sync_run_id: runId,
        items: (o.item_list ?? []).map((it) => ({
          id: it.item_id,
          name: it.item_name,
          model: it.model_name || null,
          sku: it.model_sku || it.item_sku || null,
          qty: it.model_quantity_purchased,
          price: Number(it.model_discounted_price ?? it.model_original_price ?? 0),
        })),
        raw: { fulfillment_flag: o.fulfillment_flag ?? null, cancel_reason: o.cancel_reason || null },
      }));
      if (rows.length) {
        const { error } = await sb.from("marketplace_orders").upsert(rows, { onConflict: "workspace_id,platform,external_order_id" });
        if (error) throw new Error(`Saving orders failed: ${error.message}`);
        saved += rows.length;
      }
    }

    // 3. ads credit balance (needs the Ads permission on the Shopee app — optional)
    let adsBalance: number | null = null;
    try {
      const r = await shopGet<{ response: { total_balance: number; data_timestamp: number } }>(cfg, "/api/v2/ads/get_total_balance", {}, token, shopId);
      adsBalance = Number(r.response?.total_balance);
      if (Number.isFinite(adsBalance)) {
        await sb.from("ad_balance_snapshots").insert({ workspace_id: row.workspace_id, platform: "shopee", shop_id: String(shopId), balance: adsBalance });
      } else adsBalance = null;
    } catch (e) {
      warnings.push(`Ads balance unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4. fees & payout per order, and return / refund requests (optional; never fail the order sync)
    const feesSynced = await syncShopeeFees(cfg, token, shopId, row.workspace_id, warnings);
    const returns = await syncShopeeReturns(cfg, token, shopId, row.workspace_id, warnings);

    const summary = { orders: saved, from: new Date(from * 1000).toISOString(), to: new Date(to * 1000).toISOString(), adsBalance, feesSynced, returns, warnings };
    await updateIntegration(row.id, { last_success_at: new Date().toISOString(), last_error: null, status: "connected", last_sync_summary: summary });
    if (runId) await sb.from("sync_runs").update({ status: "succeeded", records_in: sns.length, records_new: saved, finished_at: new Date().toISOString() }).eq("id", runId);
    return summary;
  } catch (e) {
    const msg = e instanceof ShopeeError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    const expired = e instanceof ShopeeError && /token|auth|expire/i.test(e.code + e.message);
    await updateIntegration(row.id, { last_error: msg, status: expired ? "expired" : "error" });
    if (runId) await sb.from("sync_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", runId);
    throw e;
  }
}
