import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { LazadaError } from "@/lib/integrations/lazada/api";
import { labelsLazada, labelsShopee } from "@/lib/integrations/fulfil";
import { fitToPaper, type Paper } from "@/lib/integrations/label-paper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Shipping label PDF, streamed straight from the marketplace (contains buyer addresses — never stored). */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { platform?: string; orderIds?: unknown; paper?: string } | null;
    const paper: Paper = ["a4", "a5", "a6", "thermal"].includes(String(body?.paper)) ? (body!.paper as Paper) : "original";
    const ids = Array.isArray(body?.orderIds) ? body!.orderIds.map(String).filter((x) => /^[\w-]{4,40}$/.test(x)).slice(0, 50) : [];
    if (!ids.length) throw new HttpError(400, "Pick at least one order.");
    const res = body?.platform === "shopee" ? await labelsShopee(m.workspaceId, ids) : body?.platform === "lazada" ? await labelsLazada(m.workspaceId, ids) : null;
    if (!res) throw new HttpError(400, "Unknown platform.");
    const html = res.kind === "html";
    // never lose the labels over a resize problem; web-page labels are printed as they come
    const pdf = html ? res.pdf : await fitToPaper(res.pdf, paper).catch(() => res.pdf);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": html ? "text/html; charset=utf-8" : "application/pdf",
        "Content-Disposition": `inline; filename="${body!.platform}-labels.pdf"`,
        "Cache-Control": "no-store",
        // orders that couldn't be printed (shown to the CEO as a warning)
        "X-OV-Problems": encodeURIComponent(JSON.stringify(res.problems.slice(0, 20))),
      },
    });
  } catch (e) {
    if (e instanceof ShopeeError || e instanceof LazadaError) return errorResponse(new HttpError(502, `${e instanceof ShopeeError ? "Shopee" : "Lazada"}: ${e.message} (${e.code})`));
    return errorResponse(e);
  }
}
