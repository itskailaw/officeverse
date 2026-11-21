import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { catalog, stockLevels, type OrderLite, type StockItem, type StockStatus } from "@/lib/data/stock";
import { STATUS } from "./summary";
import { listIntegrations } from "./store";
import { escapeHtml, sendTelegram } from "./telegram";
import { sendPush } from "./webpush";
import { getWsState, setWsState } from "./ws-state";

type Plat = "shopee" | "lazada";

/** Paid orders of the last 60 days, in the shape the stock maths needs. */
export async function recentOrders(ws: string, days = 60): Promise<OrderLite[]> {
  const out: OrderLite[] = [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getAdminSupabase()
      .from("marketplace_orders")
      .select("platform, status, ordered_at, items")
      .eq("workspace_id", ws)
      .gte("ordered_at", since)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const o of data ?? []) {
      const p = o.platform as Plat;
      out.push({
        platform: p,
        ordered_at: o.ordered_at as string,
        sale: !!STATUS[p] && !STATUS[p].notSales.has(String(o.status).toUpperCase()),
        items: ((o.items as OrderLite["items"] | null) ?? []).map((i) => ({ name: i.name, model: i.model ?? null, sku: i.sku ?? null, qty: Number(i.qty) || 1 })),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function stockItems(ws: string): Promise<StockItem[]> {
  const { data } = await getAdminSupabase().from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  return ((data?.settings as { stock?: StockItem[] } | null)?.stock ?? []) as StockItem[];
}

export async function stockOverview(ws: string) {
  const [orders, items] = await Promise.all([recentOrders(ws), stockItems(ws)]);
  // orders go to the browser too (only dates, sale yes/no and items) so levels update as counts are typed
  return { catalog: catalog(orders), levels: stockLevels(items, orders), orders: orders.map((o) => ({ ...o, items: o.items.map((i) => ({ name: i.name, model: i.model, sku: i.sku, qty: i.qty })) })) };
}

/** Priya (Inventory) warns once when an item turns low or runs out — Telegram and phone. */
export async function stockWatch(ws: string): Promise<StockStatus[]> {
  const items = await stockItems(ws);
  if (!items.length) return [];
  const levels = stockLevels(items, await recentOrders(ws));
  const prev = await getWsState<Record<string, string>>(ws, "stock-alerts", {});
  const worse = levels.filter((l) => (l.level === "low" || l.level === "out") && prev[l.id] !== l.level && !(prev[l.id] === "out" && l.level === "low"));
  // remember first: if the memory table isn't there yet (migration 0008), stay quiet rather than repeat every 10 minutes
  const remembered = await setWsState(ws, "stock-alerts", Object.fromEntries(levels.map((l) => [l.id, l.level])));
  if (worse.length && remembered) {
    const lines = worse.map((l) =>
      l.level === "out"
        ? `🔴 <b>${escapeHtml(l.name)}</b>: out of stock`
        : `🟠 <b>${escapeHtml(l.name)}</b>: ${l.left} left${l.daysLeft != null ? ` — about ${Math.max(1, Math.round(l.daysLeft))} day${Math.round(l.daysLeft) === 1 ? "" : "s"} of sales` : ""}`,
    );
    const { data: emp } = await getAdminSupabase().from("employees").select("name").eq("workspace_id", ws).eq("id", "emp-inv").maybeSingle();
    const who = ((emp?.name as string | undefined) ?? "Inventory").split(" ")[0];
    const msg = `📦 <b>${escapeHtml(who)} (Inventory):</b> time to restock\n${lines.join("\n")}\nUpdate counts in OfficeVerse → Stock.`;
    const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
    if (tg?.shop_id) await sendTelegram(tg.shop_id, msg).catch(() => {});
    await sendPush(ws, { title: `📦 ${worse.length} item${worse.length > 1 ? "s" : ""} to restock`, body: lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n"), url: "/office", tag: "stock" });
  }
  return levels;
}
