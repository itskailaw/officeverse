import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { listIntegrations, updateIntegration } from "./store";
import { liveSummary, STATUS } from "./summary";
import { escapeHtml, sendTelegram } from "./telegram";
import { pushText, sendPush } from "./webpush";
import { getWsState, setWsState } from "./ws-state";
import { decideAlerts, type AlertState } from "./alert-rules";

/**
 * Check the workspace's live data and send any new Telegram alerts
 * (urgent parcels, low Shopee ads balance, cancellation spike, new return requests).
 * Each alert is sent once; non-urgent alerts wait until 07:00 during quiet hours.
 */
export async function checkAlerts(workspaceId: string) {
  const rows = await listIntegrations(workspaceId);
  const tg = rows.find((r) => r.provider === "telegram" && r.status === "connected" && r.shop_id);
  const sb = getAdminSupabase();
  const s = await liveSummary(sb, workspaceId, { serviceRole: true });
  if (!s) return { sent: 0 };

  const now = Date.now();
  const open = (["shopee", "lazada"] as const).flatMap((p) => [...STATUS[p].toProcess, ...STATUS[p].awaitingPickup]);
  const { data: soon } = await sb
    .from("marketplace_orders")
    .select("platform, external_order_id, ship_by, status")
    .eq("workspace_id", workspaceId)
    .in("status", open)
    .gte("ship_by", new Date(now - 3600 * 1000).toISOString())
    .lte("ship_by", new Date(now + 6 * 3600 * 1000).toISOString())
    .limit(200);
  const { data: settingsRow } = await sb.from("office_layouts").select("settings").eq("workspace_id", workspaceId).maybeSingle();
  const adThreshold = Number((settingsRow?.settings as { alertAdBalance?: number } | null)?.alertAdBalance) || 50;

  // memory of what was already sent: workspace state (works without Telegram), else the Telegram row
  const prev = (await getWsState<AlertState | null>(workspaceId, "alerts", null)) ?? (tg?.last_sync_summary as { alerts?: AlertState } | null)?.alerts;
  const { messages, state } = decideAlerts(
    {
      now,
      urgent: (soon ?? []).map((o) => ({ platform: o.platform as "shopee" | "lazada", id: o.external_order_id as string, shipBy: o.ship_by as string })),
      shopeeAdBalance: s.ads.shopee?.balance ?? null,
      adThreshold,
      cancelledToday: s.cancelledToday,
      returns: s.returns?.available ? s.returns.recent.filter((r) => r.open).map((r) => ({ platform: r.platform, id: r.id, items: r.items, reason: r.reason, refund: r.refund, requestedAt: r.requestedAt })) : [],
      returnsAvailable: !!s.returns?.available,
    },
    prev,
  );
  const remembered = (await setWsState(workspaceId, "alerts", state)) || (tg ? (await updateIntegration(tg.id, { last_sync_summary: { ...(tg.last_sync_summary ?? {}), alerts: state } }), true) : false);
  if (!remembered) return { sent: 0 }; // nowhere to remember — don't repeat alerts every check
  let sent = 0;
  for (const m of messages) {
    try {
      if (tg?.shop_id) await sendTelegram(tg.shop_id, m);
      await sendPush(workspaceId, { title: "OfficeVerse alert", body: pushText(m), url: "/office", tag: `alert-${sent}` });
      sent++;
    } catch (e) {
      console.error("[alerts] send failed", e instanceof Error ? e.message : e);
      break;
    }
  }
  return { sent };
}

export { escapeHtml };
