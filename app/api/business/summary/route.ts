import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMembership } from "@/lib/integrations/store";
import { liveSummary } from "@/lib/integrations/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live business summary from synced marketplace data (RLS-scoped to the caller). */
export async function GET() {
  try {
    const sb = await getServerSupabase();
    if (!sb) return NextResponse.json({ live: false });
    const m = await getMembership();
    const summary = await liveSummary(sb, m.workspaceId);
    return NextResponse.json(summary ?? { live: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
