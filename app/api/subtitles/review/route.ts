import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/ai/server/guard";
import { reviewSubtitles } from "@/lib/ai/server/subtitles";
import { parseBrief, subtitleRateLimit } from "@/lib/ai/server/subtitle-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const lines = (v: unknown) => (Array.isArray(v) ? v.slice(0, 6).map((x) => (typeof x === "string" ? x.slice(0, 400) : "")) : []);

/** Adam: review one batch of translated subtitles. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    subtitleRateLimit(user);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const brief = parseBrief(body?.brief);
    const raw = body?.items;
    if (!Array.isArray(raw) || !raw.length || raw.length > 70) throw new HttpError(400, "Send 1–70 subtitles per review batch.");
    const items = raw.map((r) => {
      const x = r as Record<string, unknown>;
      return { n: Number(x.n), ms: Number(x.ms) || 0, source: lines(x.source), translation: lines(x.translation), auto: Array.isArray(x.auto) ? x.auto.slice(0, 8).map((a) => String(a).slice(0, 200)) : undefined };
    });
    return NextResponse.json(await reviewSubtitles(brief, items), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
