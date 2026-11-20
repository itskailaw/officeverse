import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { LazadaError } from "@/lib/integrations/lazada/api";
import { buildLabels, labelErrText, type Plat, type PrintedLabel } from "@/lib/integrations/labels";
import type { Paper } from "@/lib/integrations/label-paper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const valid = (x: unknown) => /^[\w-]{4,40}$/.test(String(x));
const seqHeader = (s: PrintedLabel[]) => encodeURIComponent(JSON.stringify(s.map((x) => [x.platform === "shopee" ? "s" : "l", x.id, x.tracking])));

/**
 * Shipping labels as ONE PDF for all selected orders (Shopee + Lazada together), fitted to the chosen paper.
 * Streamed straight from the marketplaces — labels contain buyer addresses and are never stored.
 * Body: { orders: [{ platform, id }], paper } (or the older { platform, orderIds, paper }).
 * X-OV-Sequence lists the printed orders in label order (for the packing list).
 */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { orders?: { platform?: string; id?: string }[]; platform?: string; orderIds?: unknown; paper?: string } | null;
    const paper: Paper = ["a4", "a5", "a6", "thermal"].includes(String(body?.paper)) ? (body!.paper as Paper) : "original";
    const orders: { platform: Plat; id: string }[] = Array.isArray(body?.orders)
      ? body!.orders.filter((o) => (o.platform === "shopee" || o.platform === "lazada") && valid(o.id)).map((o) => ({ platform: o.platform as Plat, id: String(o.id) }))
      : Array.isArray(body?.orderIds) && (body?.platform === "shopee" || body?.platform === "lazada")
        ? body!.orderIds.filter(valid).map((id) => ({ platform: body!.platform as Plat, id: String(id) }))
        : [];
    if (!orders.length) throw new HttpError(400, "Pick at least one order.");

    const b = await buildLabels(m.workspaceId, orders, paper);
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-OV-Problems": encodeURIComponent(JSON.stringify(b.problems.slice(0, 20))),
    };
    if (!b.pdf && b.html) {
      // only a web-page label (some Lazada channels): print it as it comes
      return new NextResponse(b.html.doc, { headers: { ...headers, "X-OV-Sequence": seqHeader(b.html.sequence), "Content-Type": "text/html; charset=utf-8" } });
    }
    if (b.html) headers["X-OV-Separate"] = b.html.platform; // that platform's web-page labels must be printed on their own
    headers["X-OV-Sequence"] = seqHeader(b.sequence);
    return new NextResponse(b.pdf, {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="airway-bills.pdf"` },
    });
  } catch (e) {
    if (e instanceof ShopeeError || e instanceof LazadaError) return errorResponse(new HttpError(502, `${e instanceof ShopeeError ? "Shopee" : "Lazada"}: ${labelErrText(e)}`));
    return errorResponse(e);
  }
}
