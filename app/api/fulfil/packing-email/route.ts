import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { emailConfigured } from "@/lib/integrations/email";
import { packingLog, sendPackingEmail } from "@/lib/integrations/packing-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Status of the daily packing email. Owner only. */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    return NextResponse.json({ configured: emailConfigured(), log: await packingLog(m.workspaceId).catch(() => []) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Send now: new To-ship orders since the last email. Body: { to? }. Owner only. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const res = await sendPackingEmail(m.workspaceId, { manual: true, to: typeof body.to === "string" ? body.to : undefined });
    return NextResponse.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
