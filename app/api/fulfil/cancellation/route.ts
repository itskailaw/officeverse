import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { handleCancellation } from "@/lib/integrations/order-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The owner accepts / rejects a buyer's cancellation request from the Approvals inbox. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { id?: string; accept?: boolean } | null;
    if (!body?.id || typeof body.accept !== "boolean") throw new HttpError(400, "Missing decision.");
    const r = await handleCancellation(m.workspaceId, body.id, body.accept);
    return NextResponse.json({ ok: true, order: r.sn });
  } catch (e) {
    if (e instanceof ShopeeError) return errorResponse(new HttpError(502, `Shopee: ${e.message} (${e.code})`));
    return errorResponse(e);
  }
}
