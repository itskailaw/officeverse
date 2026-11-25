import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { STATUS } from "@/lib/integrations/summary";
import type { StockItem } from "@/lib/data/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Plat = "shopee" | "lazada";
const DAY = 86400000;
/** Start of a Malaysia-time day (YYYY-MM-DD) as an ISO instant. */
const klStart = (d: string) => new Date(`${d}T00:00:00+08:00`).toISOString();

/** When Farid started confirming orders / generating airway bills: first packing email or first month with confirmations. */
async function faridStart(ws: string): Promise<string | null> {
  const sb = getAdminSupabase();
  const [{ data: firstEmail }, { data: months }] = await Promise.all([
    sb.from("packing_emails").select("sent_at").eq("workspace_id", ws).eq("status", "sent").order("sent_at", { ascending: true }).limit(1),
    sb.from("workspace_state").select("key, value").eq("workspace_id", ws).like("key", "farid:%"),
  ]);
  const dates: number[] = [];
  if (firstEmail?.[0]?.sent_at) dates.push(Date.parse(firstEmail[0].sent_at as string));
  for (const m of months ?? []) {
    const v = m.value as { confirmed?: number } | null;
    const month = String(m.key).slice(6, 13);
    if ((v?.confirmed ?? 0) > 0 && /^\d{4}-\d{2}$/.test(month)) dates.push(Date.parse(`${month}-01T00:00:00+08:00`));
  }
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

/**
 * Order history for stock checking: platform, order id, status and what was bought, newest first.
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD (Malaysia time, inclusive) or ?days=N. Paid orders only. Owner only.
 */
export async function GET(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const q = new URL(req.url).searchParams;
    const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const from = iso(q.get("from"));
    const to = iso(q.get("to"));
    const days = Math.min(Math.max(Number(q.get("days")) || 30, 1), 3650);
    const since = from ? klStart(from) : new Date(Date.now() - days * DAY).toISOString();
    const until = to ? new Date(Date.parse(klStart(to)) + DAY).toISOString() : new Date(Date.now() + DAY).toISOString();
    const sb = (await getServerSupabase())!;

    // page through (the database returns at most 1,000 rows per request)
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < 30; page++) {
      const { data, error } = await sb
        .from("marketplace_orders")
        .select("platform, external_order_id, status, ordered_at, pay_time, items")
        .eq("workspace_id", m.workspaceId)
        .in("platform", ["shopee", "lazada"])
        .gte("ordered_at", since)
        .lt("ordered_at", until)
        .order("ordered_at", { ascending: false })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const orders = rows
      // unpaid / cancelled orders aren't purchases (and don't take stock)
      .filter((o) => !STATUS[o.platform as Plat].notSales.has(String(o.status).toUpperCase()))
      .map((o) => ({
        platform: o.platform as Plat,
        id: o.external_order_id as string,
        status: String(o.status),
        at: ((o.pay_time as string | null) ?? (o.ordered_at as string)) as string,
        items: ((o.items as { name: string; model?: string | null; sku?: string | null; qty: number }[] | null) ?? []).map((i) => ({
          name: i.name,
          model: i.model ?? null,
          sku: i.sku ?? null,
          qty: Number(i.qty) || 1,
        })),
      }))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    // pack names from Stock, the oldest order on record, and when Farid started
    const admin = getAdminSupabase();
    const [{ data: lay }, { data: oldest }, start] = await Promise.all([
      admin.from("office_layouts").select("settings").eq("workspace_id", m.workspaceId).maybeSingle(),
      admin.from("marketplace_orders").select("ordered_at").eq("workspace_id", m.workspaceId).order("ordered_at", { ascending: true }).limit(1),
      faridStart(m.workspaceId).catch(() => null),
    ]);
    const stock = ((lay?.settings as { stock?: StockItem[] } | null)?.stock ?? []).map((s) => ({ name: s.name, keys: s.keys }));
    return NextResponse.json(
      { orders, days, from: since, to: until, stock, oldest: (oldest?.[0]?.ordered_at as string | undefined) ?? null, faridStart: start },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
