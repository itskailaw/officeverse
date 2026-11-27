import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { STATUS } from "@/lib/integrations/summary";
import { skuPrices, unitCost, type CostRecipes } from "@/lib/data/costs";
import type { Inventory } from "@/lib/data/inventory";
import { cleanFees, payoutState, payoutTotals, type PayoutRow } from "@/lib/data/payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Plat = "shopee" | "lazada";
type Item = { name: string; model?: string | null; sku?: string | null; qty: number };

/**
 * Payout check for one month (Malaysia time): every paid order with its sales, fees, payout
 * (estimate or final) and product cost — to compare with Shopee My Income / Lazada Account Statements. Owner only.
 */
export async function GET(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const q = new URL(req.url).searchParams.get("month") ?? "";
    const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(q) ? q : now;
    const [y, mo] = month.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
    const since = new Date(`${month}-01T00:00:00+08:00`).toISOString();
    const until = new Date(`${next}-01T00:00:00+08:00`).toISOString();
    const sb = (await getServerSupabase())!;

    const raw: Record<string, unknown>[] = [];
    for (let page = 0; page < 20; page++) {
      const { data, error } = await sb
        .from("marketplace_orders")
        .select("platform, external_order_id, status, ordered_at, gross_amount, net_amount, fees, items")
        .eq("workspace_id", m.workspaceId)
        .in("platform", ["shopee", "lazada"])
        .gte("ordered_at", since)
        .lt("ordered_at", until)
        .order("ordered_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(/net_amount|fees|column/i.test(error.message) ? "Payout tracking needs the 0005 database update (Supabase → SQL Editor)." : error.message);
      raw.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const { data: lay } = await getAdminSupabase().from("office_layouts").select("settings").eq("workspace_id", m.workspaceId).maybeSingle();
    const st = (lay?.settings ?? null) as { productCosts?: Record<string, number>; costRecipes?: CostRecipes; inventory?: Inventory } | null;
    const ctx = { prices: skuPrices(st?.inventory), skus: (st?.inventory?.skus ?? []).map((x) => x.sku), recipes: st?.costRecipes ?? null, byName: st?.productCosts ?? null };

    const rows: PayoutRow[] = raw
      .filter((o) => !STATUS[o.platform as Plat].notSales.has(String(o.status).toUpperCase()))
      .map((o) => {
        const items = ((o.items as Item[] | null) ?? []).map((i) => ({ ...i, qty: Number(i.qty) || 1 }));
        let cost: number | null = 0;
        for (const i of items) {
          const c = unitCost(i, ctx).cost;
          cost = c == null || cost == null ? null : Math.round((cost + c * i.qty) * 100) / 100;
        }
        const net = o.net_amount == null ? null : Number(o.net_amount);
        const fees = o.fees as Record<string, unknown> | null;
        return {
          platform: o.platform as Plat,
          id: String(o.external_order_id),
          status: String(o.status),
          at: String(o.ordered_at),
          items: items.map((i) => `${i.model ? `${i.name} (${i.model})` : i.name} ×${i.qty}`).join("; "),
          gross: Number(o.gross_amount) || 0,
          net,
          fees: cleanFees(fees),
          state: payoutState(String(o.status), net, fees, String(o.platform)),
          cost: items.length ? cost : null,
        };
      });
    return NextResponse.json({ month, rows, totals: payoutTotals(rows) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
