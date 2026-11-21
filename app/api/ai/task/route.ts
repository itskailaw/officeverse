import { NextResponse } from "next/server";
import { runTask } from "@/lib/ai/server/engine";
import { errorResponse, rateLimit, requireUser } from "@/lib/ai/server/guard";
import { parseTaskRequest } from "@/lib/ai/server/validate";
import { automationForUser, liveForUser } from "@/lib/integrations/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run one AI employee task. Auth-gated, rate-limited, validated. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(user);
    const body = parseTaskRequest(await req.json().catch(() => null));
    body.context.live = await liveForUser();
    body.context.automation = await automationForUser();
    const result = await runTask(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
