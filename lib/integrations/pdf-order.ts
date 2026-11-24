/** Re-ordering airway-bill pages (no server imports — unit tested). */
import { orderIdPermutation } from "./packing-format.ts";

/** Put PDF pages in a new order (order[i] = old page index for new page i). */
export async function reorderPdf(pdf: ArrayBuffer, order: number[]): Promise<ArrayBuffer> {
  const { PDFDocument } = await import("pdf-lib");
  const src = await PDFDocument.load(pdf);
  if (order.length !== src.getPageCount()) return pdf;
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(src, order)) out.addPage(page);
  const bytes = await out.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Sort airway bills by platform then order ID, keeping the page ↔ order match. Leaves them as they are if pages ≠ labels. */
export async function sortByOrderId<T extends { platform: "shopee" | "lazada"; id: string }>(pdf: ArrayBuffer | null, sequence: T[]): Promise<{ pdf: ArrayBuffer | null; sequence: T[] }> {
  if (!pdf || sequence.length < 2) return { pdf, sequence };
  const order = orderIdPermutation(sequence);
  const { PDFDocument } = await import("pdf-lib");
  const pages = (await PDFDocument.load(pdf)).getPageCount();
  if (pages !== sequence.length) return { pdf, sequence };
  return { pdf: await reorderPdf(pdf, order), sequence: order.map((i) => sequence[i]) };
}

