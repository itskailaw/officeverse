import { parseCip } from "./cip.ts";
export { CIP_ENCODINGS } from "./cip.ts";
import { parseAss, parseSbv, parseSrt, parseVtt } from "./text-formats.ts";
import { SubtitleError, type SubDoc, type SubFormat } from "./types.ts";

export * from "./types.ts";

export const SUB_EXTS: SubFormat[] = ["cip", "srt", "vtt", "sbv", "ass"];

export function formatOf(name: string): SubFormat | null {
  const e = name.toLowerCase().split(".").pop() ?? "";
  if (e === "ssa") return "ass";
  return (SUB_EXTS as string[]).includes(e) ? (e as SubFormat) : null;
}

/** .cip is ANSI rich text (read as latin1 so bytes round-trip); the others are UTF-8 text. */
export function decodeSubtitle(bytes: Uint8Array, format: SubFormat) {
  if (format === "cip") {
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return s;
  }
  return new TextDecoder("utf-8").decode(bytes);
}
export function encodeSubtitle(text: string, format: SubFormat): Uint8Array {
  if (format === "cip") {
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c > 255) throw new SubtitleError("Internal error: unescaped character in .cip output.");
      out[i] = c;
    }
    return out;
  }
  return new TextEncoder().encode(text);
}

export function parseSubtitle(text: string, format: SubFormat, opts: { encoding?: string } = {}): SubDoc {
  switch (format) {
    case "cip":
      return parseCip(text, opts);
    case "srt":
      return parseSrt(text);
    case "vtt":
      return parseVtt(text);
    case "sbv":
      return parseSbv(text);
    case "ass":
      return parseAss(text);
  }
}
