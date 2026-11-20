import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getServerSupabase } from "@/lib/supabase/server";
import { STATUS } from "@/lib/integrations/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plat = "shopee" | "lazada";

/** Purchase list: platform, order id and what was bought, newest first (paid orders only). Owner only. */
export async function GET(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const sb = (await getServerSupabase())!;
    const { data, error } = await sb
      .from("marketplace_orders")
      .select("platform, external_order_id, status, ordered_at, pay_time, items")
      .eq("workspace_id", m.workspaceId)
      .in("platform", ["shopee", "lazada"])
      .gte("ordered_at", since)
      .order("ordered_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    const orders = (data ?? [])
      // unpaid / cancelled orders aren't purchases
      .filter((o) => !STATUS[o.platform as Plat].notSales.has(String(o.status).toUpperCase()))
      .map((o) => ({
        platform: o.platform as Plat,
        id: o.external_order_id as string,
        at: ((o.pay_time as string | null) ?? (o.ordered_at as string)) as string,
        items: ((o.items as { name: string; model?: string | null; sku?: string | null; qty: number }[] | null) ?? []).map((i) => ({
          name: i.name,
          model: i.model ?? null,
          qty: Number(i.qty) || 1,
        })),
      }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return NextResponse.json({ orders, days }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
