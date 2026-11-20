/** Shared subtitle model. Parsers keep everything except the subtitle text untouched. */
export type SubFormat = "cip" | "srt" | "vtt" | "sbv" | "ass";

export interface Cue {
  /** stable key used to match translations back (the subtitle number, or position) */
  n: number;
  startMs: number;
  endMs: number;
  /** display lines as plain text; inline tags (<i>, {\i1}) are kept as written */
  lines: string[];
  /** original timecode as written in the file, for reports */
  inTC: string;
  outTC: string;
}

export interface SubDoc {
  format: SubFormat;
  cues: Cue[];
  /** frames per second for frame-based timecodes (.cip) */
  fps?: number;
  meta: Record<string, string>;
  /** re-create the file with new text for some cues (others are written exactly as they were) */
  write(translations: Map<number, string[]>, opts?: { meta?: Record<string, string> }): string;
}

export class SubtitleError extends Error {}

/** On-screen width: CJK / full-width characters count double. */
export function textWidth(s: string) {
  let w = 0;
  for (const ch of stripTags(s)) {
    const c = ch.codePointAt(0)!;
    w += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x20000 ? 2 : 1;
  }
  return w;
}
export const stripTags = (s: string) => s.replace(/<\/?[a-z][^>]*>/gi, "").replace(/\{\\[^}]*\}/g, "");
export const tagsOf = (s: string) => (s.match(/<\/?[a-z][^>]*>|\{\\[^}]*\}/gi) ?? []).join("");
