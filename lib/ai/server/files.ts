import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import type { UploadedFile } from "@/lib/ai/protocol";
import { MAX_FILE_BYTES } from "@/lib/ai/protocol";
import { HttpError } from "./guard";

type Block = Anthropic.Beta.BetaContentBlockParam;

const MAX_TEXT_CHARS = 400_000;
const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/webp"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function ext(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

/** Escape a filename for use inside an XML-ish attribute. */
function safeName(name: string) {
  return name.replace(/[^\w.\- ()[\]]/g, "_").slice(0, 120);
}

function wrapText(name: string, kind: string, text: string): Block {
  if (text.length > MAX_TEXT_CHARS) {
    throw new HttpError(
      413,
      `"${name}" is too large to analyse in one go (${Math.round(text.length / 1000)}k characters). Split it into smaller files or filter it to the rows you need.`,
    );
  }
  return {
    type: "text",
    text: `<uploaded_file name="${safeName(name)}" kind="${kind}">\n${text}\n</uploaded_file>`,
  };
}

async function excelToText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const parts: string[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "object") {
          const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
          if (o.result !== undefined) return String(o.result);
          if (o.text !== undefined) return String(o.text);
          if (o.richText) return o.richText.map((r) => r.text).join("");
          return "";
        }
        return String(v);
      });
      rows.push(values.map((s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)).join(","));
    });
    parts.push(`## Sheet: ${sheet.name} (${rows.length} rows)\n${rows.join("\n")}`);
  });
  return parts.join("\n\n");
}

/** Convert uploaded files into content blocks. Files are untrusted data. */
export async function filesToBlocks(files: UploadedFile[]): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const f of files) {
    const buf = Buffer.from(f.data, "base64");
    if (buf.length > MAX_FILE_BYTES) throw new HttpError(413, `"${f.name}" is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    const e = ext(f.name);
    if (e === "pdf") {
      if (buf.subarray(0, 4).toString() !== "%PDF") throw new HttpError(400, `"${f.name}" is not a valid PDF.`);
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data }, title: safeName(f.name) });
    } else if (IMAGE_TYPES[e]) {
      blocks.push({ type: "text", text: `<uploaded_file name="${safeName(f.name)}" kind="image"> (image follows)</uploaded_file>` });
      blocks.push({ type: "image", source: { type: "base64", media_type: IMAGE_TYPES[e], data: f.data } });
    } else if (e === "xlsx") {
      try {
        blocks.push(wrapText(f.name, "spreadsheet (converted to CSV)", await excelToText(buf)));
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, `Couldn't read the spreadsheet "${f.name}". Save it as .xlsx or .csv and try again.`);
      }
    } else if (e === "docx") {
      try {
        const { value } = await mammoth.extractRawText({ buffer: buf });
        blocks.push(wrapText(f.name, "word document (text only)", value));
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, `Couldn't read the Word document "${f.name}".`);
      }
    } else if (["csv", "txt", "md", "json"].includes(e)) {
      blocks.push(wrapText(f.name, e, buf.toString("utf8")));
    } else {
      throw new HttpError(415, `"${f.name}" isn't a supported file type. Use PDF, Word (.docx), Excel (.xlsx), CSV, text or an image.`);
    }
  }
  return blocks;
}
