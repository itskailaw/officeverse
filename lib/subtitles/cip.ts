/**
 * .cip — rich-text (RTF) subtitle list. Layout per subtitle:
 *   header paragraph: "#0000 <n>\t<in>\t<out>\t<duration>\t#F\tCC52000D0\t#C"  (timecodes HH:MM:SS.FF)
 *   text paragraph(s): \pard…\li1095\ri855\qc … line 1 \par line 2 …
 * Only the visible text of each text block is ever rewritten; every other byte is copied as is,
 * so a file written with no changes is byte-for-byte identical to the original.
 */
import { SubtitleError, type Cue, type SubDoc } from "./types.ts";

type Tok = { kind: "text" | "ctrl" | "brk" | "other"; s: number; e: number; text?: string };

/** Which code page \'hh bytes are in: per font (\fcharset) with the document's \ansicpg as fallback. */
export interface RtfEncoding {
  ansi: string;
  fonts: Record<number, string>;
  deff: number;
}
const CHARSET_CP: Record<number, string> = {
  128: "shift_jis",
  129: "euc-kr",
  134: "gbk",
  136: "big5",
  161: "windows-1253",
  162: "windows-1254",
  163: "windows-1258",
  177: "windows-1255",
  178: "windows-1256",
  186: "windows-1257",
  204: "windows-1251",
  222: "windows-874",
  238: "windows-1250",
};
const CPG: Record<string, string> = { "936": "gbk", "950": "big5", "932": "shift_jis", "949": "euc-kr", "874": "windows-874" };
export function rtfEncoding(raw: string): RtfEncoding {
  const cpg = /\\ansicpg(\d+)/.exec(raw)?.[1] ?? "1252";
  const ansi = CPG[cpg] ?? `windows-${cpg}`;
  const fonts: Record<number, string> = {};
  const tbl = /\{\\fonttbl([\s\S]*?)\}\s*\}/.exec(raw)?.[1] ?? "";
  for (const m of tbl.matchAll(/\\f(\d+)[^;{}]*?\\fcharset(\d+)/g)) {
    const cs = Number(m[2]);
    fonts[Number(m[1])] = cs === 0 ? "windows-1252" : cs === 1 ? ansi : CHARSET_CP[cs] ?? ansi;
  }
  return { ansi, fonts, deff: Number(/\\deff(\d+)/.exec(raw)?.[1] ?? 0) };
}
const decoders = new Map<string, TextDecoder | null>();
function decodeBytes(bytes: number[], label: string) {
  if (!decoders.has(label)) {
    try {
      decoders.set(label, new TextDecoder(label));
    } catch {
      decoders.set(label, null);
    }
  }
  const d = decoders.get(label);
  return d ? d.decode(new Uint8Array(bytes)) : bytes.map(cp1252).join("");
}

/** Tokenise an RTF fragment: literal text (incl. \'hh, \uN, \~), line breaks (\par, \line) and everything else. */
function tokens(src: string, uc = 1, enc: RtfEncoding = { ansi: "windows-1252", fonts: {}, deff: 0 }): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let font = enc.deff;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      if (/^\\'[0-9a-fA-F]{2}/.test(src.slice(i, i + 4))) {
        // a run of \'hh bytes decodes together (Chinese/Japanese/Korean are two bytes per character)
        const s0 = i;
        const bytes: number[] = [];
        while (/^\\'[0-9a-fA-F]{2}/.test(src.slice(i, i + 4))) {
          bytes.push(parseInt(src.slice(i + 2, i + 4), 16));
          i += 4;
        }
        out.push({ kind: "text", s: s0, e: i, text: decodeBytes(bytes, enc.fonts[font] ?? enc.ansi) });
        continue;
      }
      const sym = src[i + 1];
      if (sym && !/[a-zA-Z]/.test(sym)) {
        // \\ \{ \} \~ (nbsp) \- (optional hyphen) \_ (nb hyphen)
        const lit = sym === "\\" || sym === "{" || sym === "}" ? sym : sym === "~" ? "\u00a0" : sym === "_" ? "\u2011" : null;
        out.push(lit !== null ? { kind: "text", s: i, e: i + 2, text: lit } : { kind: "other", s: i, e: i + 2 });
        i += 2;
        continue;
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40))!;
      const word = m[1];
      let e = i + m[0].length;
      if (word === "u" && m[2]) {
        let n = Number(m[2]);
        if (n < 0) n += 65536;
        // skip the ANSI fallback character(s)
        for (let k = 0; k < uc && e < src.length; k++) e += src[e] === "\\" && src[e + 1] === "'" ? 4 : 1;
        out.push({ kind: "text", s: i, e, text: String.fromCharCode(n) });
      } else if (word === "par" || word === "line") out.push({ kind: "brk", s: i, e, text: word });
      else if (word === "tab") out.push({ kind: "text", s: i, e, text: "\t" });
      else {
        if (word === "f" && m[2]) font = Number(m[2]);
        out.push({ kind: "ctrl", s: i, e });
      }
      i = e;
      continue;
    }
    if (c === "{" || c === "}") {
      out.push({ kind: "other", s: i, e: i + 1 });
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      out.push({ kind: "other", s: i, e: i + 1 });
      i++;
      continue;
    }
    let j = i;
    while (j < src.length && !"\\{}\r\n".includes(src[j])) j++;
    out.push({ kind: "text", s: i, e: j, text: src.slice(i, j) });
    i = j;
  }
  return out;
}

const CP1252: Record<number, number> = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x2c6, 0x89: 0x2030, 0x8a: 0x160, 0x8b: 0x2039, 0x8c: 0x152, 0x8e: 0x17d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x2dc, 0x99: 0x2122, 0x9a: 0x161, 0x9b: 0x203a, 0x9c: 0x153, 0x9e: 0x17e, 0x9f: 0x178 };
const cp1252 = (b: number) => String.fromCharCode(CP1252[b] ?? b);

/** Plain text of an RTF fragment, with \par / \line as "\n". */
/** Font changes (\fN) through the file, so a slice can start with the font in effect at its position. */
function fontIndex(raw: string, deff: number) {
  const pos: number[] = [0];
  const font: number[] = [deff];
  for (const m of raw.matchAll(/\\f(\d+)(?![a-z\d])/g)) {
    pos.push(m.index!);
    font.push(Number(m[1]));
  }
  return (at: number) => {
    let lo = 0;
    let hi = pos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pos[mid] < at) lo = mid;
      else hi = mid - 1;
    }
    return font[lo];
  };
}
function plain(src: string, enc?: RtfEncoding) {
  return tokens(src, 1, enc)
    .map((t) => (t.kind === "text" ? t.text : t.kind === "brk" ? "\n" : ""))
    .join("");
}

/** Escape text for RTF: ASCII as is; in a Chinese/Japanese/Korean font block, the same \'hh bytes the file uses; otherwise \uN? */
function rtfEscape(s: string, codepage?: string) {
  const dbcs = codepage && DBCS.has(codepage) ? encoderFor(codepage) : null;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (ch === "\t") out += "\\tab ";
    else if (c < 0x80) out += ch;
    else if (dbcs?.has(ch)) out += dbcs.get(ch);
    else out += `\\u${c > 32767 ? c - 65536 : c}?`;
  }
  return out;
}

const TC = /^(\d{2}):(\d{2}):(\d{2})[.:](\d{2})$/;

/** Multi-byte code pages we can also write (built from the browser's own decoder, so it round-trips). */
const DBCS = new Set(["gbk", "big5", "shift_jis", "euc-kr"]);
const encoders = new Map<string, Map<string, string>>();
function encoderFor(label: string) {
  let map = encoders.get(label);
  if (map) return map;
  map = new Map();
  const d = new TextDecoder(label, { fatal: true });
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue;
      try {
        const ch = d.decode(new Uint8Array([hi, lo]));
        if (ch.length === 1 && !map.has(ch)) map.set(ch, `\\'${hi.toString(16)}\\'${lo.toString(16)}`);
      } catch {}
    }
  }
  encoders.set(label, map);
  return map;
}

/**
 * Some tools write Chinese bytes but leave the font table saying Western (1252). If the \'hh bytes in the
 * file are all valid two-byte characters in one code page, use that one.
 */
function sniffDbcs(raw: string): string | null {
  const runs = [...raw.matchAll(/(?:\\'[0-9a-fA-F]{2}){2,}/g)].slice(0, 400).map((m) => m[0]);
  if (runs.length < 3) return null;
  const bytes = runs.map((r) => r.match(/[0-9a-fA-F]{2}/g)!.map((h) => parseInt(h, 16)));
  for (const label of ["gbk", "big5", "shift_jis", "euc-kr"]) {
    try {
      const d = new TextDecoder(label, { fatal: true });
      let cjk = 0;
      let all = 0;
      for (const b of bytes) {
        const t = d.decode(new Uint8Array(b));
        all += t.length;
        cjk += (t.match(/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/g) ?? []).length;
      }
      if (all && cjk / all > 0.8) return label;
    } catch {}
  }
  return null;
}

export const CIP_ENCODINGS = [
  { v: "auto", label: "Automatic (from the file)" },
  { v: "gbk", label: "Chinese Simplified (GBK / GB2312)" },
  { v: "big5", label: "Chinese Traditional (Big5)" },
  { v: "windows-1252", label: "Western (Malay, English…)" },
  { v: "shift_jis", label: "Japanese (Shift-JIS)" },
  { v: "euc-kr", label: "Korean" },
  { v: "windows-874", label: "Thai" },
];

export function parseCip(raw: string, opts: { encoding?: string } = {}): SubDoc {
  if (!raw.startsWith("{\\rtf")) throw new SubtitleError("This .cip file isn't in the rich-text format OfficeVerse expects.");
  const ucM = /\\uc(\d)/.exec(raw);
  const uc = ucM ? Number(ucM[1]) : 1;
  // file info block
  const enc = rtfEncoding(raw);
  if (opts.encoding && opts.encoding !== "auto") {
    // the CEO picked the code page: use it for every font
    enc.ansi = opts.encoding;
    for (const k of Object.keys(enc.fonts)) enc.fonts[Number(k)] = opts.encoding;
  } else if (!Object.values(enc.fonts).some((f) => DBCS.has(f)) && !DBCS.has(enc.ansi)) {
    const sniffed = sniffDbcs(raw);
    if (sniffed) {
      enc.ansi = sniffed;
      for (const k of Object.keys(enc.fonts)) enc.fonts[Number(k)] = sniffed;
    }
  }
  const fontAt = fontIndex(raw, enc.deff);
  const infoEnd = raw.indexOf("FILE_INFO_END");
  if (infoEnd < 0) throw new SubtitleError("No FILE_INFO block found in this .cip file.");
  const meta: Record<string, string> = {};
  for (const line of plain(raw.slice(0, infoEnd), enc).split("\n")) {
    const m = /^\s*([A-Z_#]+):\s?(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim();
  }
  const fpsTxt = `${meta.TV_FPS ?? ""} ${meta.TV_SYS ?? ""}`;
  const fps = /\b(?:625|EBU|PAL|25)\b/.test(fpsTxt) ? 25 : /\b30\b|525|NTSC/.test(fpsTxt) ? 30 : /\b24\b/.test(fpsTxt) ? 24 : 25;

  // subtitle headers: the paragraph that holds "<n>\t<in>\t<out>"
  const toks = tokens(raw, uc, enc);
  // rebuild paragraphs from tokens so we know byte ranges
  type Para = { s: number; e: number; text: string };
  const paras: Para[] = [];
  let ps = 0;
  let buf = "";
  for (const t of toks) {
    if (t.kind === "text") buf += t.text;
    if (t.kind === "brk" && t.text === "par") {
      paras.push({ s: ps, e: t.e, text: buf });
      ps = t.e;
      buf = "";
    } else if (t.kind === "brk") buf += "\n";
  }
  paras.push({ s: ps, e: raw.length, text: buf });

  const headers: { idx: number; n: number; inTC: string; outTC: string }[] = [];
  paras.forEach((p, idx) => {
    const f = p.text.trim().split("\t").map((x) => x.trim());
    // "#00012" (the number is zero-padded to 5 digits) → 12
    const num = /^#?(\d+)$/.exec((f[0] ?? "").replace(/\s+/g, ""));
    if (num && f.length >= 3 && TC.test(f[1]) && TC.test(f[2])) headers.push({ idx, n: Number(num[1]), inTC: f[1], outTC: f[2] });
  });
  if (!headers.length) throw new SubtitleError("No subtitles found in this .cip file.");

  const ms = (tc: string) => {
    const m = TC.exec(tc)!;
    return ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Math.round((Number(m[4]) * 1000) / fps);
  };
  // text region of subtitle i = from the end of its header paragraph to the start of the next header (or the closing brace)
  const regions: { s: number; e: number }[] = headers.map((h, i) => {
    const s = paras[h.idx].e;
    const e = i + 1 < headers.length ? paras[headers[i + 1].idx].s : raw.lastIndexOf("}");
    return { s, e };
  });
  const cues: Cue[] = headers.map((h, i) => {
    const text = plain(raw.slice(regions[i].s, regions[i].e), { ...enc, deff: fontAt(regions[i].s) });
    const lines = text.split("\n").map((l) => l.replace(/\s+$/, "").replace(/^\s+/, "")).filter((l) => l.length);
    return { n: h.n, startMs: ms(h.inTC), endMs: ms(h.outTC), lines, inTC: h.inTC, outTC: h.outTC };
  });
  const seen = new Set<number>();
  for (const c of cues) {
    if (seen.has(c.n)) throw new SubtitleError(`Subtitle number ${c.n} appears twice — OfficeVerse needs unique numbers.`);
    seen.add(c.n);
  }

  const write: SubDoc["write"] = (translations, opts) => {
    const edits: { s: number; e: number; text: string }[] = [];
    headers.forEach((h, i) => {
      const next = translations.get(h.n);
      const cue = cues[i];
      if (!next || (next.length === cue.lines.length && next.every((l, k) => l === cue.lines[k]))) return;
      const r = regions[i];
      const local = tokens(raw.slice(r.s, r.e), uc, { ...enc, deff: fontAt(r.s) });
      const texts = local.filter((t) => t.kind === "text" && t.text!.trim().length);
      if (!texts.length) throw new SubtitleError(`Subtitle ${h.n} has no text to replace.`);
      const first = texts[0];
      const last = texts[texts.length - 1];
      const brks = local.filter((t) => t.kind === "brk" && t.s > first.s && t.s < last.e);
      const sep = brks.length && brks.every((b) => b.text === "line") ? "\\line " : "\\par\r\n";
      const cp = enc.fonts[fontAt(r.s + first.s)] ?? enc.ansi;
      edits.push({ s: r.s + first.s, e: r.s + last.e, text: next.map((l) => rtfEscape(l, cp)).join(sep) });
    });
    if (opts?.meta) {
      for (const [k, v] of Object.entries(opts.meta)) {
        const m = new RegExp(`(${k}:)([^\\\\\\r\\n]*)(\\\\par)`).exec(raw.slice(0, infoEnd));
        if (m) edits.push({ s: m.index + m[1].length, e: m.index + m[1].length + m[2].length, text: ` ${rtfEscape(v, enc.ansi)}` });
      }
    }
    edits.sort((a, b) => b.s - a.s);
    let out = raw;
    for (const ed of edits) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
    return out;
  };

  return { format: "cip", cues, fps, meta: { ...meta, ENCODING: enc.fonts[fontAt(regions[0]?.s ?? 0)] ?? enc.ansi }, write };
}
