import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { LazadaError } from "@/lib/integrations/lazada/api";
import { labelsLazada, labelsShopee } from "@/lib/integrations/fulfil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Shipping label PDF, streamed straight from the marketplace (contains buyer addresses — never stored). */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { platform?: string; orderIds?: unknown } | null;
    const ids = Array.isArray(body?.orderIds) ? body!.orderIds.map(String).filter((x) => /^[\w-]{4,40}$/.test(x)).slice(0, 50) : [];
    if (!ids.length) throw new HttpError(400, "Pick at least one order.");
    const pdf = body?.platform === "shopee" ? await labelsShopee(m.workspaceId, ids) : body?.platform === "lazada" ? await labelsLazada(m.workspaceId, ids) : null;
    if (!pdf) throw new HttpError(400, "Unknown platform.");
    return new NextResponse(pdf, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${body!.platform}-labels.pdf"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ShopeeError || e instanceof LazadaError) return errorResponse(new HttpError(502, `${e instanceof ShopeeError ? "Shopee" : "Lazada"}: ${e.message} (${e.code})`));
    return errorResponse(e);
  }
}
