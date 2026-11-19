// Fit shipping labels onto the CEO's paper size (pure, unit-tested).
import { degrees, PDFDocument } from "pdf-lib";

export type Paper = "original" | "a4" | "a5" | "a6" | "thermal";
const MM = 72 / 25.4;
/** portrait sizes in PDF points */
export const PAPER: Record<Exclude<Paper, "original">, [number, number]> = {
  a4: [210 * MM, 297 * MM],
  a5: [148 * MM, 210 * MM],
  a6: [105 * MM, 148 * MM], // A6 paper
  thermal: [100 * MM, 150 * MM], // thermal label rolls sold as "A6"
};

/** One label per page, scaled to fit the paper with a small margin, centred, rotated if that fits better. */
export async function fitToPaper(pdf: ArrayBuffer, paper: Paper): Promise<ArrayBuffer> {
  if (paper === "original") return pdf;
  const [W, H] = PAPER[paper];
  const margin = (paper === "thermal" || paper === "a6" ? 2 : 4) * MM;
  const src = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const pages = await out.embedPages(src.getPages());
  for (const p of pages) {
    const page = out.addPage([W, H]);
    const landscape = p.width > p.height;
    // rotate landscape labels so they use the full portrait sheet
    const w = landscape ? p.height : p.width;
    const h = landscape ? p.width : p.height;
    const s = Math.min((W - 2 * margin) / w, (H - 2 * margin) / h);
    const dw = w * s;
    const dh = h * s;
    const x = (W - dw) / 2;
    const y = (H - dh) / 2;
    if (landscape) {
      page.drawPage(p, { x: x + dw, y, xScale: s, yScale: s, rotate: degrees(90) });
    } else {
      page.drawPage(p, { x, y, xScale: s, yScale: s });
    }
  }
  const bytes = await out.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
