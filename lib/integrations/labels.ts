import "server-only";
import { HttpError } from "@/lib/ai/server/guard";
import { ShopeeError } from "./shopee/api";
import { LazadaError } from "./lazada/api";
import { labelsLazada, labelsShopee, mergePdfs, sortByOrderId, type LabelResult } from "./fulfil";
import { fitToPaper, type Paper } from "./label-paper";

export type Plat = "shopee" | "lazada";
export interface PrintedLabel {
  platform: Plat;
  id: string;
  tracking: string | null;
}
export interface LabelBundle {
  /** one merged PDF for every platform that sent PDF labels (null if none did) */
  pdf: ArrayBuffer | null;
  /** orders in the order their labels appear in `pdf` */
  sequence: PrintedLabel[];
  /** a platform that only sent its labels as a web page — printed separately */
  html: { platform: Plat; doc: ArrayBuffer; sequence: PrintedLabel[] } | null;
  problems: string[];
}

export const labelErrText = (e: unknown) =>
  e instanceof ShopeeError || e instanceof LazadaError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : String(e);

/** Airway bills for orders on both platforms, merged into one PDF in the given order (platforms grouped). */
export async function buildLabels(ws: string, orders: { platform: Plat; id: string }[], paper: Paper | "original"): Promise<LabelBundle> {
  const plats = [...new Set(orders.map((o) => o.platform))];
  const problems: string[] = [];
  const pdfs: ArrayBuffer[] = [];
  const sequence: PrintedLabel[] = [];
  let html: LabelBundle["html"] = null;
  for (const p of plats) {
    const ids = orders.filter((o) => o.platform === p).map((o) => o.id).slice(0, 50);
    let res: LabelResult;
    try {
      res = p === "shopee" ? await labelsShopee(ws, ids) : await labelsLazada(ws, ids);
    } catch (e) {
      if (plats.length === 1) throw e;
      problems.push(`${p === "shopee" ? "Shopee" : "Lazada"}: ${labelErrText(e)}`);
      continue;
    }
    problems.push(...res.problems);
    const seq = (res.sequence ?? ids.map((id) => ({ id, tracking: null }))).map((x) => ({ platform: p, ...x }));
    if (res.kind === "html") html = { platform: p, doc: res.pdf, sequence: seq };
    else {
      pdfs.push(await fitToPaper(res.pdf, paper as Paper).catch(() => res.pdf));
      sequence.push(...seq);
    }
  }
  if (!pdfs.length && !html) throw new HttpError(502, problems.join(" · ") || "No labels came back.");
  // by order ID (Shopee, then Lazada), pages kept in step with the list
  const sorted = await sortByOrderId(pdfs.length ? await mergePdfs(pdfs) : null, sequence);
  return { pdf: sorted.pdf, sequence: sorted.sequence, html, problems };
}
