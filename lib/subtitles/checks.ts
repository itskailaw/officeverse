/** Rule-based checks — exact and repeatable, run on every translated subtitle before Adam reviews it. */
import { stripTags, tagsOf, textWidth, type Cue } from "./types.ts";

export type CheckLevel = "error" | "warn";
export interface CheckIssue {
  n: number;
  level: CheckLevel;
  code: "missing" | "empty" | "lines" | "width" | "speed" | "numbers" | "tags" | "glossary" | "untranslated";
  message: string;
}
export interface CheckLimits {
  /** max on-screen width of one line (CJK counts 2) */
  maxWidth: number;
  /** max lines on screen */
  maxLines: number;
  /** max reading speed, width units per second */
  maxSpeed: number;
}
export interface GlossaryEntry {
  source: string;
  target: string;
}

const speed = (lines: string[], ms: number) => lines.reduce((w, l) => w + textWidth(l), 0) / Math.max(ms / 1000, 0.3);

/** Limits that match the file being translated: no stricter than the original already is. */
export function limitsFor(cues: Cue[]): CheckLimits {
  const widths = cues.flatMap((c) => c.lines.map(textWidth));
  const speeds = cues.map((c) => speed(c.lines, c.endMs - c.startMs)).sort((a, b) => a - b);
  const p90 = speeds[Math.floor(speeds.length * 0.9)] ?? 17;
  return {
    maxWidth: Math.max(Math.max(0, ...widths), 37),
    maxLines: Math.max(2, ...cues.map((c) => c.lines.length)),
    maxSpeed: Math.max(20, Math.round(p90 * 10) / 10),
  };
}

const numbersOf = (s: string) => (stripTags(s).match(/\d+(?:[.,:]\d+)*/g) ?? []).map((x) => x.replace(/,/g, ".")).sort();

export function checkCue(src: Cue, tr: string[] | undefined, limits: CheckLimits, glossary: GlossaryEntry[] = []): CheckIssue[] {
  const out: CheckIssue[] = [];
  const add = (level: CheckLevel, code: CheckIssue["code"], message: string) => out.push({ n: src.n, level, code, message });
  if (!tr) {
    if (src.lines.length) add("error", "missing", "No translation returned.");
    return out;
  }
  const text = tr.join(" ");
  if (src.lines.join("").trim() && !stripTags(text).trim()) add("error", "empty", "Translation is empty.");
  if (tr.length > limits.maxLines) add("error", "lines", `${tr.length} lines on screen (max ${limits.maxLines}).`);
  tr.forEach((l, i) => {
    const w = textWidth(l);
    if (w > limits.maxWidth) add("warn", "width", `Line ${i + 1} is ${w} wide (max ${limits.maxWidth}).`);
  });
  const sp = speed(tr, src.endMs - src.startMs);
  if (sp > limits.maxSpeed) add("warn", "speed", `Reading speed ${sp.toFixed(1)}/s (max ${limits.maxSpeed}/s) — shorten.`);
  if (tagsOf(src.lines.join(" ")) !== tagsOf(text)) add("error", "tags", `Formatting tags changed (${tagsOf(src.lines.join(" ")) || "none"} → ${tagsOf(text) || "none"}).`);
  const a = numbersOf(src.lines.join(" "));
  const b = numbersOf(text);
  if (a.join("|") !== b.join("|")) add("warn", "numbers", `Numbers differ: ${a.join(", ") || "none"} → ${b.join(", ") || "none"}.`);
  const srcLow = stripTags(src.lines.join(" ")).toLowerCase();
  for (const g of glossary) {
    if (g.source && srcLow.includes(g.source.toLowerCase()) && !stripTags(text).toLowerCase().includes(g.target.toLowerCase()))
      add("warn", "glossary", `Glossary: "${g.source}" should be "${g.target}".`);
  }
  const s = stripTags(src.lines.join(" ")).trim();
  if (s.length > 12 && s === stripTags(text).trim()) add("warn", "untranslated", "Looks untranslated (same as the original).");
  return out;
}

export function parseGlossary(text: string): GlossaryEntry[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/\s*(?:=|→|->|\t)\s*/))
    .filter((p) => p.length >= 2 && p[0].trim() && p[1].trim())
    .map((p) => ({ source: p[0].trim(), target: p[1].trim() }))
    .slice(0, 300);
}

/**
 * Practice test for the reviewer: a copy of a finished subtitle with one deliberate, verifiable mistake.
 * Never written to the output file — only used to measure how often Adam catches real errors.
 */
export function plantError(tr: string[], other: string[], pick: number): { lines: string[]; kind: string } | null {
  const text = tr.join("\n");
  const num = /\d+/.exec(text);
  const kinds: (() => { lines: string[]; kind: string } | null)[] = [
    // a different subtitle's text — wrong meaning, but reads fluently
    () => (other.length && other.join("\n") !== text ? { lines: other, kind: "text from a different subtitle" } : null),
    () => (num ? { lines: text.replace(num[0], String(Number(num[0]) + 3)).split("\n"), kind: "changed number" } : null),
    () => (tr.length >= 2 ? { lines: [tr[0]], kind: "dropped line" } : null),
    // last third of the sentence missing
    () => {
      const t = tr.join(" ");
      const cut = Math.floor(t.length * 0.6);
      const sp = t.lastIndexOf(" ", cut);
      return sp > 4 ? { lines: [t.slice(0, sp)], kind: "sentence cut short" } : null;
    },
  ];
  for (let k = 0; k < kinds.length; k++) {
    const r = kinds[(pick + k) % kinds.length]();
    if (r && r.lines.join("\n") !== text) return r;
  }
  return null;
}
