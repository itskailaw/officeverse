import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { LazadaError } from "@/lib/integrations/lazada/api";
import { shipLazada, shipShopee } from "@/lib/integrations/fulfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Arrange drop-off for the orders the owner selected. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { platform?: string; orderIds?: unknown } | null;
    const ids = Array.isArray(body?.orderIds) ? body!.orderIds.map(String).filter((x) => /^[\w-]{4,40}$/.test(x)).slice(0, 30) : [];
    if (!ids.length) throw new HttpError(400, "Pick at least one order.");
    const results = body?.platform === "shopee" ? await shipShopee(m.workspaceId, ids) : body?.platform === "lazada" ? await shipLazada(m.workspaceId, ids) : null;
    if (!results) throw new HttpError(400, "Unknown platform.");
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ShopeeError || e instanceof LazadaError) return errorResponse(new HttpError(502, `${e instanceof ShopeeError ? "Shopee" : "Lazada"}: ${e.message} (${e.code})`));
    return errorResponse(e);
  }
}
