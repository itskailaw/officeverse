import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { listIntegrations, updateIntegration } from "./store";
import { liveSummary } from "./summary";
import { briefingFacts, briefingText } from "./briefing";
import { aiConfigured } from "@/lib/ai/server/guard";
import { briefingNotes } from "@/lib/ai/server/engine";
import { sendTelegram } from "./telegram";
import { syncShopee } from "./shopee/sync";
import { syncLazada } from "./lazada/sync";

const appUrl = () => {
  const host = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return host ? `${host.replace(/\/$/, "")}/office` : undefined;
};

/** Refresh stale marketplace data, then send the briefing to the workspace's linked Telegram chat. */
export async function sendBriefing(workspaceId: string, opts: { refresh?: boolean } = {}) {
  const rows = await listIntegrations(workspaceId);
  const chat = rows.find((r) => r.provider === "telegram" && r.status === "connected");
  if (!chat?.shop_id) throw new Error("Telegram isn't linked for this workspace.");
  if (opts.refresh) {
    // Freshen stale shops in parallel, but never let a slow marketplace hold the briefing back:
    // after 90 s it goes out with whatever data is already stored.
    const syncs = rows
      .filter((r) => (r.provider === "shopee" || r.provider === "lazada") && r.status !== "expired")
      .filter((r) => !r.last_success_at || Date.now() - Date.parse(r.last_success_at) > 30 * 60 * 1000)
      .map((r) => (r.provider === "shopee" ? syncShopee(r) : syncLazada(r)).catch((e) => console.error(`[briefing] ${r.provider} sync failed`, e instanceof Error ? e.message : e)));
    await Promise.race([Promise.allSettled(syncs), new Promise((r) => setTimeout(r, 90_000))]);
  }
  const s = await liveSummary(getAdminSupabase(), workspaceId, { serviceRole: true });
  // Sophia's commentary — optional: if the AI is unavailable the plain briefing still goes out
  let notes: string[] = [];
  if (s && aiConfigured()) {
    try {
      notes = await Promise.race([briefingNotes(briefingFacts(s)), new Promise<string[]>((r) => setTimeout(() => r([]), 45_000))]);
    } catch (e) {
      console.error("[briefing] notes failed", e instanceof Error ? e.message : e);
    }
  }
  try {
    await sendTelegram(chat.shop_id, briefingText(s, { appUrl: appUrl(), from: "Sophia", notes }));
    await updateIntegration(chat.id, { last_success_at: new Date().toISOString(), last_error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // blocked / deleted chat → mark so the CEO sees it in Settings
    await updateIntegration(chat.id, { last_error: msg, status: /blocked|not found|deactivated/i.test(msg) ? "error" : "connected" });
    throw e;
  }
}

const klDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const klHM = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/**
 * Backup for the 8:30 am Vercel Cron: after any order update / sync from 08:30 (Malaysia time) on,
 * send today's briefing if it hasn't gone out yet. Returns true when it sent one.
 */
export async function ensureDailyBriefing(workspaceId: string, now = new Date()) {
  if (klHM(now) < "08:30") return false;
  const rows = await listIntegrations(workspaceId);
  const tg = rows.find((r) => r.provider === "telegram" && r.status === "connected");
  if (!tg?.shop_id) return false;
  if (tg.last_success_at && klDate(new Date(tg.last_success_at)) === klDate(now)) return false;
  // claim today's slot first so two order updates arriving together don't both send it
  await updateIntegration(tg.id, { last_success_at: now.toISOString() });
  try {
    await sendBriefing(workspaceId);
    return true;
  } catch (e) {
    await updateIntegration(tg.id, { last_success_at: tg.last_success_at });
    throw e;
  }
}
