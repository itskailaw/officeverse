import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { deleteIntegration, getMembership, listIntegrations, requireRole } from "@/lib/integrations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remove stored Lazada credentials. Synced orders are kept for history. */
export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    for (const row of await listIntegrations(m.workspaceId, "lazada")) await deleteIntegration(m.workspaceId, row.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
