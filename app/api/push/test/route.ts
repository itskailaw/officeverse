import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { sendPush } from "@/lib/integrations/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a test notification to every device. */
export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const sent = await sendPush(m.workspaceId, { title: "OfficeVerse", body: "🔔 Notifications are working on this device.", tag: "test" });
    return NextResponse.json({ sent });
  } catch (e) {
    return errorResponse(e);
  }
}
