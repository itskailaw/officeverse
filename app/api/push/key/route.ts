import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership } from "@/lib/integrations/store";
import { vapidKeys } from "@/lib/integrations/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public push key a browser needs to subscribe (signed-in members only). */
export async function GET() {
  try {
    await getMembership();
    return NextResponse.json({ publicKey: (await vapidKeys()).publicKey });
  } catch (e) {
    return errorResponse(e);
  }
}
