import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { fitToPaper, PAPER } from "../lib/integrations/label-paper.ts";

test("labels are fitted onto A5 / A6 / A4 pages", async () => {
  const d = await PDFDocument.create();
  for (const size of [[595, 842], [288, 432], [600, 400]] as [number, number][]) {
    const pg = d.addPage(size); // A4 label, 4x6 thermal, landscape
    pg.drawRectangle({ x: 10, y: 10, width: size[0] - 20, height: size[1] - 20, borderWidth: 2 });
  }
  const b = await d.save();
  const src = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  for (const paper of ["thermal", "a6", "a5", "a4"] as const) {
    const out = await PDFDocument.load(await fitToPaper(src, paper));
    assert.equal(out.getPageCount(), 3);
    for (const p of out.getPages()) {
      assert.ok(Math.abs(p.getWidth() - PAPER[paper][0]) < 0.5);
      assert.ok(Math.abs(p.getHeight() - PAPER[paper][1]) < 0.5);
    }
  }
  assert.equal(await fitToPaper(src, "original"), src);
});
