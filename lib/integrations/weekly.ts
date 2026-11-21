import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai/server/guard";
import { weeklyNotes } from "@/lib/ai/server/engine";
import { packNames, type StockItem } from "@/lib/data/stock";
import { STATUS } from "./summary";
import { listIntegrations } from "./store";
import { sendTelegram } from "./telegram";
import { emailConfigured, sendEmail } from "./email";
import { sendPush } from "./webpush";
import { getWsState, setWsState } from "./ws-state";
import { weekFacts, weeklyHtml, weeklyTelegram, pct, type WeekOrder } from "./weekly-rules";

type Plat = "shopee" | "lazada";
const isoWeek = (d: Date) => {
  const kl = new Date(d.getTime() + 8 * 3600000);
  const t = new Date(Date.UTC(kl.getUTCFullYear(), kl.getUTCMonth(), kl.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)}`;
};

/** Sophia's weekly review: Telegram + email (if an address is saved) + a phone notification. */
export async function sendWeeklyReview(ws: string) {
  const sb = getAdminSupabase();
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: rows, error } = await sb
    .from("marketplace_orders")
    .select("platform, status, ordered_at, gross_amount, net_amount, items")
    .eq("workspace_id", ws)
    .gte("ordered_at", since)
    .limit(10000);
  if (error) throw new Error(error.message);
  const orders: WeekOrder[] = (rows ?? []).map((o) => {
    const p = o.platform as Plat;
    const st = String(o.status).toUpperCase();
    return {
      platform: p,
      ordered_at: o.ordered_at as string,
      sale: !!STATUS[p] && !STATUS[p].notSales.has(st),
      cancelled: !!STATUS[p] && STATUS[p].cancelled.has(st),
      gross: Number(o.gross_amount) || 0,
      net: o.net_amount == null ? null : Number(o.net_amount),
      items: ((o.items as WeekOrder["items"] | null) ?? []).map((i) => ({ name: i.name, model: i.model ?? null, sku: i.sku ?? null, qty: Number(i.qty) || 1 })),
    };
  });
  const { data: rets } = await sb.from("marketplace_returns").select("requested_at").eq("workspace_id", ws).gte("requested_at", since);
  const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  const settings = (lay?.settings ?? {}) as { stock?: StockItem[]; packingEmail?: { to?: string } };
  const facts = weekFacts(orders, (rets ?? []) as { requested_at: string }[], Date.now(), packNames(settings.stock));

  let notes: string[] = [];
  if (aiConfigured()) notes = await Promise.race([weeklyNotes(facts).catch(() => []), new Promise<string[]>((r) => setTimeout(() => r([]), 45_000))]);

  const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
  let sent = 0;
  if (tg?.shop_id) {
    await sendTelegram(tg.shop_id, weeklyTelegram(facts, notes));
    sent++;
  }
  const to = settings.packingEmail?.to;
  if (to && emailConfigured()) {
    await sendEmail({ to, fromName: "Sophia · OfficeVerse", subject: `Weekly review — sales ${pct(facts.revenue.now, facts.revenue.prev)} vs last week`, html: weeklyHtml(facts, notes) });
    sent++;
  }
  await sendPush(ws, { title: "📊 Weekly review", body: `Sales RM ${Math.round(facts.revenue.now).toLocaleString("en-MY")} (${pct(facts.revenue.now, facts.revenue.prev)} vs last week) · ${facts.orders.now} orders`, url: "/office", tag: "weekly" });
  await setWsState(ws, "weekly", { week: isoWeek(new Date()), at: new Date().toISOString() });
  return { sent, facts };
}

/** Mondays from 9am Malaysia time, once a week (called by the hourly job). */
export async function ensureWeeklyReview(ws: string, now = new Date()) {
  const klDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "short" }).format(now);
  const klHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(now));
  if (klDay !== "Mon" || klHour < 9) return null;
  const last = await getWsState<{ week?: string } | null>(ws, "weekly", null);
  if (last === null) {
    // memory table missing (migration 0008): don't risk sending every hour
    const ok = await setWsState(ws, "weekly-probe", { at: now.toISOString() });
    if (!ok) return null;
  }
  if (last?.week === isoWeek(now)) return null;
  return sendWeeklyReview(ws);
}
