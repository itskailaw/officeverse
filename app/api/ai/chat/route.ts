import { NextResponse } from "next/server";
import { chat } from "@/lib/ai/server/engine";
import { errorResponse, rateLimit, requireUser } from "@/lib/ai/server/guard";
import { parseChatRequest } from "@/lib/ai/server/validate";
import { automationForUser, businessForUser, liveForUser } from "@/lib/integrations/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Chat with one AI employee. Auth-gated, rate-limited, validated. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(user);
    const body = parseChatRequest(await req.json().catch(() => null));
    body.context.live = await liveForUser();
    body.context.automation = await automationForUser();
    body.context.business = await businessForUser();
    const result = await chat(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
