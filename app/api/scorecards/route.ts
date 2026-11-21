import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership } from "@/lib/integrations/store";
import { getWsState } from "@/lib/integrations/ws-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server-side numbers for the staff scorecards (Farid's confirmation speed this month and last). */
export async function GET() {
  try {
    const m = await getMembership();
    const now = new Date();
    const months = [now.toISOString().slice(0, 7), new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7)];
    const farid = await Promise.all(months.map(async (mo) => ({ month: mo, ...(await getWsState(m.workspaceId, `farid:${mo}`, { confirmed: 0, failed: 0, minutes: [] as number[] })) })));
    return NextResponse.json({ farid }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
