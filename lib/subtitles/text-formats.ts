/** .srt / .vtt / .sbv / .ass — only the subtitle text is rewritten; numbering, timing, styles and notes stay as written. */
import { SubtitleError, type Cue, type SubDoc } from "./types.ts";

const nlOf = (raw: string) => (raw.includes("\r\n") ? "\r\n" : "\n");

function hmsMs(tc: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(tc.trim());
  if (!m) throw new SubtitleError(`Unreadable timecode "${tc}".`);
  const frac = m[4].padEnd(3, "0");
  return ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(frac.slice(0, 3));
}

/**
 * Block formats (srt, vtt, sbv): blank-line separated blocks; a "timing line" in each block; text lines after it.
 * We record the character range of the text lines so they can be swapped without touching anything else.
 */
function blockFormat(raw: string, format: "srt" | "vtt" | "sbv"): SubDoc {
  const nl = nlOf(raw);
  const timing =
    format === "sbv"
      ? /^(\d+:\d{2}:\d{2}\.\d{3}),(\d+:\d{2}:\d{2}\.\d{3})\s*$/
      : /^((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(.*)$/;
  const cues: Cue[] = [];
  const ranges: { s: number; e: number }[] = [];
  // walk line by line keeping absolute offsets
  const lines: { text: string; s: number; e: number }[] = [];
  let pos = 0;
  for (const part of raw.split(/\r?\n/)) {
    lines.push({ text: part, s: pos, e: pos + part.length });
    pos += part.length + (raw.slice(pos + part.length, pos + part.length + 2) === "\r\n" ? 2 : 1);
  }
  let i = 0;
  let auto = 0;
  while (i < lines.length) {
    const m = timing.exec(lines[i].text.replace(/^﻿/, ""));
    if (!m) {
      i++;
      continue;
    }
    // srt: the number is the previous non-empty line
    const prev = i > 0 ? lines[i - 1].text.trim() : "";
    auto++;
    const n = format === "srt" && /^\d+$/.test(prev) ? Number(prev) : auto;
    let j = i + 1;
    const text: string[] = [];
    while (j < lines.length && lines[j].text.trim() !== "" && !timing.exec(lines[j].text)) {
      text.push(lines[j].text);
      j++;
    }
    if (format === "srt" && j < lines.length && timing.exec(lines[j].text) && /^\d+$/.test(text[text.length - 1] ?? "")) text.pop(); // number of the next cue
    ranges.push(text.length ? { s: lines[i + 1].s, e: lines[i + text.length].e } : { s: lines[i].e + nl.length, e: lines[i].e + nl.length });
    cues.push({ n, startMs: hmsMs(m[1]), endMs: hmsMs(m[2]), lines: text.map((t) => t.trim()), inTC: m[1], outTC: m[2] });
    i = j;
  }
  if (!cues.length) throw new SubtitleError(`No subtitles found in this .${format} file.`);
  // duplicate / missing numbers: use positions instead
  if (new Set(cues.map((c) => c.n)).size !== cues.length) cues.forEach((c, k) => (c.n = k + 1));
  const write: SubDoc["write"] = (tr) => {
    const edits = cues
      .map((c, k) => ({ c, r: ranges[k] }))
      .filter(({ c }) => tr.has(c.n) && JSON.stringify(tr.get(c.n)) !== JSON.stringify(c.lines))
      .map(({ c, r }) => ({ ...r, text: tr.get(c.n)!.join(nl) }))
      .sort((a, b) => b.s - a.s);
    let out = raw;
    for (const ed of edits) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
    return out;
  };
  return { format, cues, meta: {}, write };
}

/** .ass / .ssa: Dialogue lines in [Events]; the Text field is the last one, line breaks are \N. */
function assFormat(raw: string): SubDoc {
  const cues: Cue[] = [];
  const ranges = new Map<number, { s: number; e: number }>();
  let inEvents = false;
  let fields: string[] = [];
  let pos = 0;
  let n = 0;
  for (const line of raw.split(/\n/)) {
    const clean = line.replace(/\r$/, "");
    if (/^\[.*\]$/.test(clean.trim())) inEvents = /^\[events\]$/i.test(clean.trim());
    else if (inEvents && /^format:/i.test(clean)) fields = clean.slice(7).split(",").map((f) => f.trim().toLowerCase());
    else if (inEvents && /^dialogue:/i.test(clean) && fields.length) {
      const body = clean.slice(clean.indexOf(":") + 1);
      const parts: string[] = [];
      let rest = body;
      for (let k = 0; k < fields.length - 1; k++) {
        const c = rest.indexOf(",");
        parts.push(rest.slice(0, c));
        rest = rest.slice(c + 1);
      }
      const textStart = pos + (clean.length - rest.length);
      n++;
      const st = parts[fields.indexOf("start")]?.trim() ?? "0:00:00.00";
      const en = parts[fields.indexOf("end")]?.trim() ?? "0:00:00.00";
      cues.push({ n, startMs: hmsMs(st), endMs: hmsMs(en), lines: rest.split(/\\N/i), inTC: st, outTC: en });
      ranges.set(n, { s: textStart, e: textStart + rest.length });
    }
    pos += line.length + 1;
  }
  if (!cues.length) throw new SubtitleError("No Dialogue lines found in this .ass file.");
  const write: SubDoc["write"] = (tr) => {
    const edits = cues
      .filter((c) => tr.has(c.n) && JSON.stringify(tr.get(c.n)) !== JSON.stringify(c.lines))
      .map((c) => ({ ...ranges.get(c.n)!, text: tr.get(c.n)!.join("\\N") }))
      .sort((a, b) => b.s - a.s);
    let out = raw;
    for (const ed of edits) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
    return out;
  };
  return { format: "ass", cues, meta: {}, write };
}

export const parseSrt = (raw: string) => blockFormat(raw, "srt");
export const parseVtt = (raw: string) => {
  if (!/^﻿?WEBVTT/.test(raw)) throw new SubtitleError("This .vtt file doesn't start with WEBVTT.");
  return blockFormat(raw, "vtt");
};
export const parseSbv = (raw: string) => blockFormat(raw, "sbv");
export const parseAss = assFormat;
