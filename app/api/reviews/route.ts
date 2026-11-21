import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { postReviewReply, reviewWatch, skipReview } from "@/lib/integrations/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Recent low ratings and what happened to them. */
export async function GET() {
  try {
    const m = await getMembership();
    const { data, error } = await getAdminSupabase()
      .from("marketplace_reviews")
      .select("platform, review_id, item_name, rating, comment, created_at, reply, status, draft")
      .eq("workspace_id", m.workspaceId)
      .lte("rating", 3)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ reviews: [], unavailable: true });
    return NextResponse.json({ reviews: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** { id, action: "post" | "skip", text? } — post Mei Ling's (edited) reply, or skip. { action: "check" } fetches new reviews now. Owner only. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const b = (await req.json().catch(() => ({}))) as { id?: string; action?: string; text?: string };
    if (b.action === "check") return NextResponse.json(await reviewWatch(m.workspaceId));
    if (!b.id || !/^review-shopee-\d+$/.test(b.id)) throw new HttpError(400, "Unknown review.");
    if (b.action === "skip") {
      await skipReview(m.workspaceId, b.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, ...(await postReviewReply(m.workspaceId, b.id, typeof b.text === "string" ? b.text : undefined)) });
  } catch (e) {
    return errorResponse(e);
  }
}
