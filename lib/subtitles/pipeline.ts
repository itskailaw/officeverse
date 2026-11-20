/** Browser-side orchestration of a subtitle job: Lina translates → automatic checks → Adam reviews → Lina fixes → Adam re-checks. */
import { checkCue, plantError, type CheckIssue, type CheckLimits, type GlossaryEntry } from "./checks.ts";
import type { Cue } from "./types.ts";

export interface JobBrief {
  sourceLang: string;
  targetLang: string;
  notes: string;
  glossary: GlossaryEntry[];
  limits: CheckLimits;
  translator: { name: string; title: string; model?: string };
  reviewer: { name: string; title: string; model?: string };
  practice: boolean;
}
export type RowStatus = "ok" | "fixed" | "check" | "attention";
export interface JobRow {
  n: number;
  inTC: string;
  outTC: string;
  source: string[];
  final: string[];
  status: RowStatus;
  note?: string;
  back?: string;
  auto: CheckIssue[];
  /** Lina's first draft, when it was changed after review */
  draft?: string[];
}
export interface JobResult {
  rows: JobRow[];
  practice: { planted: number; caught: number; details: { kind: string; caught: boolean }[] };
  usage: { input: number; output: number };
  rounds: number;
}
export interface Progress {
  stage: "translate" | "check" | "review" | "fix" | "recheck" | "done";
  done: number;
  total: number;
}

const BATCH = 40;
const PARALLEL = 3;
const PLANT_BASE = 1_000_000;

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (r.ok) return j;
    // transient: rate limit / gateway — wait and retry twice
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) {
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      continue;
    }
    throw new Error(j.error ?? `Request failed (${r.status})`);
  }
}

async function inPool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, signal?: AbortSignal) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        await fn(items[i++]);
      }
    }),
  );
}
const chunks = <T,>(a: T[], size: number) => Array.from({ length: Math.ceil(a.length / size) }, (_, k) => a.slice(k * size, k * size + size));

export async function runSubtitleJob(cues: Cue[], brief: JobBrief, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<JobResult> {
  const usage = { input: 0, output: 0 };
  const addUsage = (u?: { input: number; output: number }) => {
    if (u) {
      usage.input += u.input;
      usage.output += u.output;
    }
  };
  const wire = (who: JobBrief["translator"]) => ({
    sourceLang: brief.sourceLang,
    targetLang: brief.targetLang,
    notes: brief.notes,
    glossary: brief.glossary,
    limits: brief.limits,
    model: who.model,
    employee: { name: who.name, title: who.title },
  });
  const idx = new Map(cues.map((c, i) => [c.n, i]));
  const ms = (c: Cue) => Math.max(0, c.endMs - c.startMs);
  const asIn = (c: Cue) => ({ n: c.n, ms: ms(c), lines: c.lines });
  const todo = cues.filter((c) => c.lines.length);

  // ── 1. Lina translates ──
  const tr = new Map<number, string[]>();
  const translate = async (batch: Cue[], extra?: Map<number, { previous: string[]; note: string }>) => {
    const first = idx.get(batch[0].n)!;
    const last = idx.get(batch[batch.length - 1].n)!;
    const res = await post<{ result: Record<string, string[]>; usage: { input: number; output: number } }>(
      "/api/subtitles/translate",
      {
        brief: wire(brief.translator),
        cues: batch.map((c) => ({ ...asIn(c), ...(extra?.get(c.n) ?? {}) })),
        context: { before: cues.slice(Math.max(0, first - 3), first).map(asIn), after: cues.slice(last + 1, last + 4).map(asIn) },
      },
      signal,
    );
    addUsage(res.usage);
    for (const [k, v] of Object.entries(res.result)) tr.set(Number(k), v);
  };
  let done = 0;
  onProgress({ stage: "translate", done, total: todo.length });
  await inPool(
    chunks(todo, BATCH),
    PARALLEL,
    async (b) => {
      await translate(b);
      // anything missing: once more on its own
      const missing = b.filter((c) => !tr.has(c.n));
      if (missing.length) await translate(missing);
      done += b.length;
      onProgress({ stage: "translate", done, total: todo.length });
    },
    signal,
  );

  // ── 2. rule-based checks ──
  onProgress({ stage: "check", done: 0, total: todo.length });
  const autoOf = (c: Cue, lines: string[] | undefined) => checkCue(c, lines, brief.limits, brief.glossary);

  // ── 3. Adam reviews (with hidden practice items) ──
  type Rev = { n: number; verdict: "ok" | "fix" | "check"; issue?: string; fix?: string[]; back?: string };
  const reviews = new Map<number, Rev>();
  const planted: { n: number; kind: string }[] = [];
  const review = async (batch: Cue[], plant: boolean) => {
    const items = batch.map((c) => ({ n: c.n, ms: ms(c), source: c.lines, translation: tr.get(c.n) ?? [], auto: autoOf(c, tr.get(c.n)).map((i) => i.message) }));
    if (plant && brief.practice && batch.length >= 8) {
      // one deliberate mistake per batch, at a random position, in a copy that is never used for the file
      const pick = batch[Math.floor(Math.random() * batch.length)];
      const other = batch[(batch.indexOf(pick) + 3) % batch.length];
      const err = tr.get(pick.n) ? plantError(tr.get(pick.n)!, tr.get(other.n) ?? [], Math.floor(Math.random() * 4)) : null;
      if (err) {
        const n = PLANT_BASE + planted.length;
        planted.push({ n, kind: err.kind });
        items.splice(Math.floor(Math.random() * items.length), 0, { n, ms: ms(pick), source: pick.lines, translation: err.lines, auto: [] });
      }
    }
    const res = await post<{ result: Rev[]; usage: { input: number; output: number } }>("/api/subtitles/review", { brief: wire(brief.reviewer), items }, signal);
    addUsage(res.usage);
    for (const r of res.result) reviews.set(r.n, r);
  };
  done = 0;
  onProgress({ stage: "review", done, total: todo.length });
  await inPool(
    chunks(todo, BATCH),
    PARALLEL,
    async (b) => {
      await review(b, true);
      const missing = b.filter((c) => !reviews.has(c.n));
      if (missing.length) await review(missing, false);
      done += b.length;
      onProgress({ stage: "review", done, total: todo.length });
    },
    signal,
  );
  const practice = {
    planted: planted.length,
    caught: planted.filter((p) => (reviews.get(p.n)?.verdict ?? "ok") !== "ok").length,
    details: planted.map((p) => ({ kind: p.kind, caught: (reviews.get(p.n)?.verdict ?? "ok") !== "ok" })),
  };
  for (const p of planted) reviews.delete(p.n);

  // ── 4. Lina fixes what Adam (or a hard rule) flagged, Adam re-checks — at most 2 rounds ──
  const drafts = new Map<number, string[]>();
  let rounds = 0;
  for (let round = 0; round < 2; round++) {
    const needs = todo.filter((c) => reviews.get(c.n)?.verdict === "fix" || autoOf(c, tr.get(c.n)).some((i) => i.level === "error"));
    if (!needs.length) break;
    rounds++;
    const notes = new Map(
      needs.map((c) => {
        const r = reviews.get(c.n);
        const auto = autoOf(c, tr.get(c.n)).map((i) => i.message);
        return [c.n, { previous: tr.get(c.n) ?? [], note: [r?.verdict === "fix" ? r.issue : null, r?.fix ? `Suggested: ${r.fix.join(" / ")}` : null, ...auto].filter(Boolean).join(" ") || "Fix the problems listed." }];
      }),
    );
    for (const c of needs) if (!drafts.has(c.n) && tr.get(c.n)) drafts.set(c.n, tr.get(c.n)!);
    done = 0;
    onProgress({ stage: "fix", done, total: needs.length });
    await inPool(
      chunks(needs, 30),
      PARALLEL,
      async (b) => {
        await translate(b, notes);
        done += b.length;
        onProgress({ stage: "fix", done, total: needs.length });
      },
      signal,
    );
    done = 0;
    onProgress({ stage: "recheck", done, total: needs.length });
    await inPool(
      chunks(needs, BATCH),
      PARALLEL,
      async (b) => {
        await review(b, false);
        done += b.length;
        onProgress({ stage: "recheck", done, total: needs.length });
      },
      signal,
    );
  }

  // ── 5. results ──
  const rows: JobRow[] = cues.map((c) => {
    const r = reviews.get(c.n);
    let final = tr.get(c.n) ?? c.lines;
    let auto = autoOf(c, tr.get(c.n));
    let status: RowStatus = drafts.has(c.n) ? "fixed" : "ok";
    if (r?.verdict === "check") status = "check";
    if (r?.verdict === "fix") {
      // still not right after the fix rounds: use Adam's correction if it passes the hard rules, but ask the CEO to look
      if (r.fix?.length && !checkCue(c, r.fix, brief.limits, brief.glossary).some((i) => i.level === "error")) {
        final = r.fix;
        auto = checkCue(c, r.fix, brief.limits, brief.glossary);
      }
      status = "attention";
    }
    if (auto.some((i) => i.level === "error")) status = "attention";
    if (!c.lines.length) status = "ok";
    return { n: c.n, inTC: c.inTC, outTC: c.outTC, source: c.lines, final, status, note: r?.verdict !== "ok" ? r?.issue : drafts.has(c.n) ? "Fixed after review" : undefined, back: r?.back, auto, draft: drafts.get(c.n) };
  });
  onProgress({ stage: "done", done: rows.length, total: rows.length });
  return { rows, practice, usage, rounds };
}

/** QA report as CSV (opens in Excel). */
export function reportCsv(rows: JobRow[]) {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return (
    "﻿" +
    ["#,In,Out,Status,Original,Translation,Back-translation (English),Reviewer note,Automatic checks,First draft"]
      .concat(
        rows.map((r) =>
          [String(r.n), r.inTC, r.outTC, r.status, r.source.join(" / "), r.final.join(" / "), r.back ?? "", r.note ?? "", r.auto.map((a) => a.message).join(" "), r.draft?.join(" / ") ?? ""].map(cell).join(","),
        ),
      )
      .join("\r\n")
  );
}
