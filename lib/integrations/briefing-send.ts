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
    for (const r of rows) {
      const stale = !r.last_success_at || Date.now() - Date.parse(r.last_success_at) > 30 * 60 * 1000;
      if (!stale || r.status === "expired") continue;
      try {
        if (r.provider === "shopee") await syncShopee(r);
        else if (r.provider === "lazada") await syncLazada(r);
      } catch {}
    }
  }
  const s = await liveSummary(getAdminSupabase(), workspaceId, { serviceRole: true });
  // Sophia's commentary — optional: if the AI is unavailable the plain briefing still goes out
  let notes: string[] = [];
  if (s && aiConfigured()) {
    try {
      notes = await Promise.race([briefingNotes(briefingFacts(s)), new Promise<string[]>((r) => setTimeout(() => r([]), 60_000))]);
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
