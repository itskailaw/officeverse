import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { lazadaGet, LazadaError, type LazadaConfig } from "./api";
import { parseLazadaDate } from "./sign";
import { lazadaFeesByOrder, money } from "../fees";

const DAY = 86400 * 1000;
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const errText = (e: unknown) => (e instanceof LazadaError ? `${e.code} ${e.message}` : e instanceof Error ? e.message : String(e));

/**
 * Fees & payout per order from the finance ledger (/finance/transaction/details/get, Finance permission group).
 * Every transaction line (item price credit, commission, payment fee, shipping…) carries an order number;
 * summing the lines per order gives what Lazada actually pays out.
 */
export async function syncLazadaFees(cfg: LazadaConfig, token: string, workspaceId: string, warnings: string[]) {
  const sb = getAdminSupabase();
  const lines: Record<string, unknown>[] = [];
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 45 * DAY);
    for (let offset = 0; offset < 5000; offset += 500) {
      const d = await lazadaGet<Record<string, unknown>[] | { list?: Record<string, unknown>[] }>(
        cfg,
        "/finance/transaction/details/get",
        { start_time: ymd(start), end_time: ymd(end), offset, limit: 500 },
        token,
      );
      const page = Array.isArray(d) ? d : (d?.list ?? []);
      lines.push(...page);
      if (page.length < 500) break;
    }
  } catch (e) {
    warnings.push(`Lazada fees unavailable: ${errText(e)}`);
    return 0;
  }
  const byOrder = lazadaFeesByOrder(lines);
  if (!byOrder.size) return 0;
  const ids = [...byOrder.keys()];
  // only update orders we already have (and only when the figures changed)
  const known = new Map<string, { net: number | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await sb
      .from("marketplace_orders")
      .select("external_order_id, net_amount")
      .eq("workspace_id", workspaceId)
      .eq("platform", "lazada")
      .in("external_order_id", ids.slice(i, i + 300));
    if (error) {
      warnings.push(/net_amount|column/i.test(error.message) ? "Profit tracking needs the 0005 database update (Supabase → SQL Editor)." : error.message);
      return 0;
    }
    for (const r of data ?? []) known.set(r.external_order_id as string, { net: r.net_amount == null ? null : Number(r.net_amount) });
  }
  const changed = ids.filter((id) => known.has(id) && known.get(id)!.net !== byOrder.get(id)!.net);
  const at = new Date().toISOString();
  for (let i = 0; i < changed.length; i += 10) {
    await Promise.all(
      changed.slice(i, i + 10).map((id) => {
        const f = byOrder.get(id)!;
        return sb
          .from("marketplace_orders")
          .update({ net_amount: f.net, fees: { ...f.fees, _final: true }, fees_at: at })
          .eq("workspace_id", workspaceId)
          .eq("platform", "lazada")
          .eq("external_order_id", id);
      }),
    );
  }
  return changed.length;
}

interface LzReverseLine {
  reason_text?: string;
  reason?: string;
  reverse_status?: string;
  refund_amount?: string | number;
  product_name?: string;
  product?: { product_name?: string; product_sku?: string };
  item_name?: string;
}
interface LzReverse {
  reverse_order_id?: string | number;
  trade_order_id?: string | number;
  request_type?: string;
  ofc_status?: string;
  reverse_status?: string;
  create_time?: string | number;
  gmt_create?: string | number;
  modified_time?: string | number;
  reverse_order_lines?: LzReverseLine[];
}

const lzTime = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  return parseLazadaDate(String(v));
};

/** Return / refund requests (/reverse/getreverseordersforseller, Reverse Order Management group). */
export async function syncLazadaReturns(cfg: LazadaConfig, token: string, workspaceId: string, warnings: string[]) {
  const sb = getAdminSupabase();
  const rows: Record<string, unknown>[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const d = await lazadaGet<{ items?: LzReverse[]; total?: number } | LzReverse[]>(cfg, "/reverse/getreverseordersforseller", { page_size: 50, page_no: page }, token);
      const items = Array.isArray(d) ? d : (d?.items ?? []);
      for (const x of items) {
        const lines = x.reverse_order_lines ?? [];
        const status = String(x.reverse_status ?? lines[0]?.reverse_status ?? x.ofc_status ?? "UNKNOWN").toUpperCase();
        rows.push({
          workspace_id: workspaceId,
          platform: "lazada",
          external_id: String(x.reverse_order_id ?? ""),
          order_id: x.trade_order_id != null ? String(x.trade_order_id) : null,
          status,
          request_type: x.request_type ?? null,
          reason: [...new Set(lines.map((l) => l.reason_text ?? l.reason).filter(Boolean))].join("; ").slice(0, 500) || null,
          refund_amount: lines.reduce((s, l) => s + money(l.refund_amount), 0),
          items: lines.map((l) => ({ name: l.product?.product_name ?? l.product_name ?? l.item_name ?? "Item", qty: 1 })),
          due_at: null,
          requested_at: lzTime(x.create_time ?? x.gmt_create),
          updated_at: lzTime(x.modified_time),
          raw: { ofc_status: x.ofc_status ?? null, request_type: x.request_type ?? null },
        });
      }
      if (items.length < 50) break;
    }
  } catch (e) {
    warnings.push(`Lazada returns unavailable: ${errText(e)}`);
    return 0;
  }
  const valid = rows.filter((r) => r.external_id);
  if (valid.length) {
    const { error } = await sb.from("marketplace_returns").upsert(valid, { onConflict: "workspace_id,platform,external_id" });
    if (error) {
      warnings.push(/marketplace_returns/.test(error.message) ? "Returns tracking needs the 0005 database update (Supabase → SQL Editor)." : `Saving returns failed: ${error.message}`);
      return 0;
    }
  }
  return valid.length;
}
