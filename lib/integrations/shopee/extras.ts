import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { shopGet, type ShopeeConfig } from "./api";
import { money, shopeeFees } from "../fees";

const DAY = 86400;
const iso = (s: unknown) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString() : null);

/**
 * Fees & payout per order (payment.get_escrow_detail). Shipped orders get an estimate,
 * completed orders the final figure; each order is fetched at most twice.
 */
export async function syncShopeeFees(cfg: ShopeeConfig, token: string, shopId: number, workspaceId: string, warnings: string[], max = 40) {
  const sb = getAdminSupabase();
  const since = new Date(Date.now() - 60 * DAY * 1000).toISOString();
  const { data, error } = await sb
    .from("marketplace_orders")
    .select("external_order_id, status, gross_amount, fees")
    .eq("workspace_id", workspaceId)
    .eq("platform", "shopee")
    .in("status", ["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED"])
    .gte("ordered_at", since)
    .order("ordered_at", { ascending: false })
    .limit(400);
  if (error) {
    if (/fees|column/i.test(error.message)) warnings.push("Profit tracking needs the 0005 database update (Supabase → SQL Editor).");
    return 0;
  }
  const todo = (data ?? [])
    .filter((o) => !o.fees || (o.status === "COMPLETED" && !(o.fees as { _final?: boolean })._final))
    .slice(0, max);
  let done = 0;
  for (const o of todo) {
    try {
      const r = await shopGet<{ response?: { order_income?: Record<string, unknown> } }>(cfg, "/api/v2/payment/get_escrow_detail", { order_sn: o.external_order_id }, token, shopId);
      const income = r.response?.order_income;
      if (!income) continue;
      const { net, fees } = shopeeFees(income, Number(o.gross_amount) || 0);
      await sb
        .from("marketplace_orders")
        .update({ net_amount: net, fees: { ...fees, _final: o.status === "COMPLETED" }, fees_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("platform", "shopee")
        .eq("external_order_id", o.external_order_id);
      done++;
    } catch (e) {
      warnings.push(`Shopee fees unavailable: ${e instanceof Error ? e.message : String(e)}`);
      break; // usually a missing permission — don't hammer the API
    }
  }
  return done;
}

interface ShopeeReturn {
  return_sn: string | number;
  order_sn?: string;
  status?: string;
  reason?: string;
  text_reason?: string;
  refund_amount?: number | string;
  create_time?: number;
  update_time?: number;
  due_date?: number;
  item?: { name?: string; item_name?: string; amount?: number; item_price?: number }[];
  negotiation_status?: string;
}

/** Return / refund requests created in the last 30 days (returns.get_return_list, 15-day windows). */
export async function syncShopeeReturns(cfg: ShopeeConfig, token: string, shopId: number, workspaceId: string, warnings: string[]) {
  const sb = getAdminSupabase();
  const to = Math.floor(Date.now() / 1000);
  const rows: Record<string, unknown>[] = [];
  try {
    for (const [a, b] of [
      [to - 15 * DAY, to],
      [to - 30 * DAY, to - 15 * DAY],
    ]) {
      for (let page = 0; page < 5; page++) {
        const r = await shopGet<{ response?: { return?: ShopeeReturn[]; more?: boolean } }>(
          cfg,
          "/api/v2/returns/get_return_list",
          { page_no: page, page_size: 50, create_time_from: a, create_time_to: b },
          token,
          shopId,
        );
        for (const x of r.response?.return ?? []) {
          rows.push({
            workspace_id: workspaceId,
            platform: "shopee",
            external_id: String(x.return_sn),
            order_id: x.order_sn ?? null,
            status: String(x.status ?? "UNKNOWN").toUpperCase(),
            request_type: x.negotiation_status ? `RETURN_REFUND (${x.negotiation_status})` : "RETURN_REFUND",
            reason: [x.reason, x.text_reason].filter(Boolean).join(" — ").slice(0, 500) || null,
            refund_amount: money(x.refund_amount),
            items: (x.item ?? []).map((it) => ({ name: it.name ?? it.item_name ?? "Item", qty: it.amount ?? 1, price: money(it.item_price) })),
            due_at: iso(x.due_date),
            requested_at: iso(x.create_time),
            updated_at: iso(x.update_time),
            raw: { status: x.status, negotiation_status: x.negotiation_status ?? null },
          });
        }
        if (!r.response?.more) break;
      }
    }
  } catch (e) {
    warnings.push(`Shopee returns unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
  if (rows.length) {
    const { error } = await sb.from("marketplace_returns").upsert(rows, { onConflict: "workspace_id,platform,external_id" });
    if (error) {
      warnings.push(/marketplace_returns/.test(error.message) ? "Returns tracking needs the 0005 database update (Supabase → SQL Editor)." : `Saving returns failed: ${error.message}`);
      return 0;
    }
  }
  return rows.length;
}
