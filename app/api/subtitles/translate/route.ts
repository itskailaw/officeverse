import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/ai/server/guard";
import { translateSubtitles } from "@/lib/ai/server/subtitles";
import { parseBrief, parseCues, subtitleRateLimit } from "@/lib/ai/server/subtitle-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Lina: translate one batch of subtitles. The file itself stays in the browser. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    subtitleRateLimit(user);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const brief = parseBrief(body?.brief);
    const cues = parseCues(body?.cues);
    const ctx = (body?.context ?? {}) as Record<string, unknown>;
    const context = { before: Array.isArray(ctx.before) ? parseCues(ctx.before.slice(-3), 3) : [], after: Array.isArray(ctx.after) ? parseCues(ctx.after.slice(0, 3), 3) : [] };
    return NextResponse.json(await translateSubtitles(brief, cues, context), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
