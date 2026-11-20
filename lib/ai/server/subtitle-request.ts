import "server-only";
import { HttpError } from "./guard";
import type { Brief, SubIn } from "./subtitles";

const hits = new Map<string, number[]>();
/** Subtitle jobs make many small calls: their own, larger budget (300 per 10 minutes). */
export function subtitleRateLimit(user: string) {
  const now = Date.now();
  const list = (hits.get(user) ?? []).filter((t) => now - t < 600_000);
  if (list.length >= 300) throw new HttpError(429, "Too many subtitle requests — please wait a few minutes.");
  list.push(now);
  hits.set(user, list);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const lines = (v: unknown) => (Array.isArray(v) ? v.slice(0, 6).map((x) => str(x, 400)) : []);

export function parseBrief(v: unknown): Brief {
  const b = (v ?? {}) as Record<string, unknown>;
  const lim = (b.limits ?? {}) as Record<string, unknown>;
  const num = (x: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(x)) ? Number(x) : d));
  const emp = (b.employee ?? null) as Record<string, unknown> | null;
  const brief: Brief = {
    sourceLang: str(b.sourceLang, 40) || "the source language",
    targetLang: str(b.targetLang, 40),
    notes: str(b.notes, 2000),
    glossary: Array.isArray(b.glossary)
      ? b.glossary.slice(0, 300).map((g) => ({ source: str((g as Record<string, unknown>).source, 80), target: str((g as Record<string, unknown>).target, 80) })).filter((g) => g.source && g.target)
      : [],
    limits: { maxWidth: num(lim.maxWidth, 42, 10, 120), maxLines: num(lim.maxLines, 2, 1, 4), maxSpeed: num(lim.maxSpeed, 20, 5, 60) },
    model: str(b.model, 40) || undefined,
    employee: emp ? { name: str(emp.name, 60), title: str(emp.title, 80) } : undefined,
  };
  if (!brief.targetLang) throw new HttpError(400, "Choose the language to translate into.");
  return brief;
}

export function parseCues(v: unknown, max = 60): (SubIn & { previous?: string[]; note?: string })[] {
  if (!Array.isArray(v) || !v.length) throw new HttpError(400, "No subtitles in this batch.");
  if (v.length > max) throw new HttpError(400, `At most ${max} subtitles per batch.`);
  return v.map((c) => {
    const x = c as Record<string, unknown>;
    return {
      n: Number(x.n),
      ms: Number(x.ms) || 0,
      lines: lines(x.lines),
      ...(Array.isArray(x.previous) ? { previous: lines(x.previous) } : {}),
      ...(typeof x.note === "string" ? { note: str(x.note, 500) } : {}),
    };
  });
}
