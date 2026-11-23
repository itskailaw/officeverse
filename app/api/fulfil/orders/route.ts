import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getServerSupabase } from "@/lib/supabase/server";
import { STATUS } from "@/lib/integrations/summary";
import { refreshOrders } from "@/lib/integrations/order-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/** Orders waiting to be processed / shipped (from synced data — no buyer details). Owner only. */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const sb = (await getServerSupabase())!;
    const toProcess = [...STATUS.shopee.toProcess, ...STATUS.lazada.toProcess];
    const toShip = [...STATUS.shopee.awaitingPickup, ...STATUS.lazada.awaitingPickup];
    const { data, error } = await sb
      .from("marketplace_orders")
      .select("platform, external_order_id, status, gross_amount, ordered_at, pay_time, ship_by, items")
      .eq("workspace_id", m.workspaceId)
      .in("status", [...toProcess, ...toShip])
      .order("ship_by", { ascending: true, nullsFirst: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const orders = (data ?? [])
      .filter((o) => (o.platform === "shopee" ? STATUS.shopee : STATUS.lazada) && (STATUS[o.platform as "shopee" | "lazada"].toProcess.has(o.status) || STATUS[o.platform as "shopee" | "lazada"].awaitingPickup.has(o.status)))
      .map((o) => ({
        platform: o.platform as "shopee" | "lazada",
        id: o.external_order_id as string,
        stage: STATUS[o.platform as "shopee" | "lazada"].toProcess.has(o.status) ? ("process" as const) : ("ship" as const),
        status: o.status as string,
        amount: Number(o.gross_amount) || 0,
        orderedAt: o.ordered_at as string,
        // Shopee lists orders by payment time; COD (no payment yet) and Lazada (order = paid) use the order time
        paidAt: ((o.pay_time as string | null) ?? (o.ordered_at as string)) as string,
        paidKnown: !!o.pay_time,
        shipBy: (o.ship_by as string) ?? null,
        items: ((o.items as { name: string; model?: string | null; sku?: string | null; qty: number }[] | null) ?? []).map((i) => ({ name: i.name, model: i.model ?? null, sku: i.sku ?? null, qty: i.qty })),
      }));
    return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Refresh: pull the latest statuses from the marketplaces (orders only). The browser then reloads the list. Owner only. */
export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    return NextResponse.json(await refreshOrders(m.workspaceId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
