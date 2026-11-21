import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership } from "@/lib/integrations/store";
import { stockOverview } from "@/lib/integrations/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Products sold recently (to set up stock) and current stock levels. */
export async function GET() {
  try {
    const m = await getMembership();
    return NextResponse.json(await stockOverview(m.workspaceId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
