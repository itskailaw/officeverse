import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { systemHealth } from "@/lib/integrations/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** System health checks for the owner's workspace. */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    return NextResponse.json({ checks: await systemHealth(m.workspaceId), at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
