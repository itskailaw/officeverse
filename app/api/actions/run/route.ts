import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { isStaffAction } from "@/lib/ai/actions";
import { runStaffAction } from "@/lib/integrations/staff-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Run an action a staff member offered in chat, after the owner tapped Approve. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (!isStaffAction(body.action)) throw new HttpError(400, "Unknown action.");
    return NextResponse.json(await runStaffAction(m.workspaceId, body.action));
  } catch (e) {
    return errorResponse(e);
  }
}
