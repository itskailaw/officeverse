import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { sendBriefing } from "@/lib/integrations/briefing-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Send today's briefing now (used as the "send test" button). */
export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    await sendBriefing(m.workspaceId).catch((e) => {
      throw new HttpError(502, e instanceof Error ? e.message : String(e));
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
