import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, listIntegrations, requireRole } from "@/lib/integrations/store";
import { checkOrdersNow } from "@/lib/integrations/order-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Run = { at: string; source: string; state: string; waiting?: number; tried?: number; arranged?: number; failed?: number };

async function status(ws: string) {
  const rows = (await listIntegrations(ws)).filter((r) => r.provider === "shopee" || r.provider === "lazada");
  return rows.map((r) => {
    const s = (r.last_sync_summary ?? {}) as { lastPushAt?: string; autoRun?: Run };
    return { platform: r.provider, status: r.status, lastSync: r.last_success_at, lastPush: s.lastPushAt ?? null, lastRun: s.autoRun ?? null, error: r.last_error };
  });
}

/** What Farid did last, and when each store last pushed / synced. Owner only. */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    return NextResponse.json({ stores: await status(m.workspaceId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** "Check now": quick orders sync + Farid's run. Owner only. */
export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const result = await checkOrdersNow(m.workspaceId, "manual", 0);
    return NextResponse.json({ result, stores: await status(m.workspaceId) });
  } catch (e) {
    return errorResponse(e);
  }
}
