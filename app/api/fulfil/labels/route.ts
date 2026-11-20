import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { ShopeeError } from "@/lib/integrations/shopee/api";
import { LazadaError } from "@/lib/integrations/lazada/api";
import { labelsLazada, labelsShopee, mergePdfs, type LabelResult } from "@/lib/integrations/fulfil";
import { fitToPaper, type Paper } from "@/lib/integrations/label-paper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Plat = "shopee" | "lazada";
const valid = (x: unknown) => /^[\w-]{4,40}$/.test(String(x));
const errText = (e: unknown) => (e instanceof ShopeeError || e instanceof LazadaError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e));

/**
 * Shipping labels as ONE PDF for all selected orders (Shopee + Lazada together), fitted to the chosen paper.
 * Streamed straight from the marketplaces — labels contain buyer addresses and are never stored.
 * Body: { orders: [{ platform, id }], paper } (or the older { platform, orderIds, paper }).
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

    // platforms in the order they first appear in the CEO's list
    const plats = [...new Set(orders.map((o) => o.platform))];
    const problems: string[] = [];
    const pdfs: ArrayBuffer[] = [];
    let html: { platform: Plat; doc: ArrayBuffer } | null = null;
    // which orders were printed, in the order their labels appear (drives the packing list)
    const sequence: { platform: Plat; id: string; tracking: string | null }[] = [];
    let htmlSeq: typeof sequence = [];
    for (const p of plats) {
      const ids = orders.filter((o) => o.platform === p).map((o) => o.id).slice(0, 50);
      let res: LabelResult;
      try {
        res = p === "shopee" ? await labelsShopee(m.workspaceId, ids) : await labelsLazada(m.workspaceId, ids);
      } catch (e) {
        if (plats.length === 1) throw e;
        problems.push(`${p === "shopee" ? "Shopee" : "Lazada"}: ${errText(e)}`);
        continue;
      }
      problems.push(...res.problems);
      const seq = (res.sequence ?? ids.map((id) => ({ id, tracking: null }))).map((x) => ({ platform: p, ...x }));
      if (res.kind === "html") html = { platform: p, doc: res.pdf };
      else pdfs.push(await fitToPaper(res.pdf, paper).catch(() => res.pdf));
      if (res.kind !== "html") sequence.push(...seq);
      else htmlSeq = seq;
    }

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "X-OV-Problems": encodeURIComponent(JSON.stringify(problems.slice(0, 20))),
      "Access-Control-Expose-Headers": "X-OV-Problems, X-OV-Separate, X-OV-Sequence",
    };
    const seqHeader = (s: typeof sequence) => encodeURIComponent(JSON.stringify(s.map((x) => [x.platform === "shopee" ? "s" : "l", x.id, x.tracking])));
    if (!pdfs.length && html) {
      // only a web-page label (some Lazada channels): print it as it comes
      return new NextResponse(html.doc, { headers: { ...headers, "X-OV-Sequence": seqHeader(htmlSeq), "Content-Type": "text/html; charset=utf-8" } });
    }
    if (!pdfs.length) throw new HttpError(502, problems.join(" · ") || "No labels came back.");
    if (html) headers["X-OV-Separate"] = html.platform; // that platform's web-page labels must be printed on their own
    headers["X-OV-Sequence"] = seqHeader(sequence);
    const merged = await mergePdfs(pdfs);
    return new NextResponse(merged, {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="airway-bills.pdf"` },
    });
  } catch (e) {
    if (e instanceof ShopeeError || e instanceof LazadaError) return errorResponse(new HttpError(502, `${e instanceof ShopeeError ? "Shopee" : "Lazada"}: ${errText(e)}`));
    return errorResponse(e);
  }
}
