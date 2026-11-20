"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, Download, FileUp, Flag, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CIP_ENCODINGS, decodeSubtitle, encodeSubtitle, formatOf, parseSubtitle, SUB_EXTS, type SubDoc } from "@/lib/subtitles";
import { limitsFor, parseGlossary, type CheckLimits } from "@/lib/subtitles/checks";
import { reportCsv, runSubtitleJob, type JobResult, type JobRow, type Progress, type RowStatus } from "@/lib/subtitles/pipeline";

const TRANSLATOR = "emp-translator";
const REVIEWER = "emp-lqa";
const LANGS = ["Malay", "English", "Chinese (Simplified)", "Chinese (Traditional)", "Tamil", "Indonesian", "Thai", "Vietnamese", "Japanese", "Korean"];
const STAGE: Record<Progress["stage"], string> = {
  translate: "translating",
  check: "running the automatic checks",
  review: "checking every line",
  fix: "fixing what Adam flagged",
  recheck: "re-checking the fixes",
  done: "done",
};
const STATUS: Record<RowStatus, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-emerald-100 text-emerald-800" },
  fixed: { label: "Fixed after review", cls: "bg-sky-100 text-sky-800" },
  check: { label: "Native check", cls: "bg-amber-100 text-amber-800" },
  attention: { label: "Needs you", cls: "bg-red-100 text-red-800" },
};
const langFromMeta = (s?: string) => (!s ? "" : /malay/i.test(s) ? "Malay" : /chin|mandarin/i.test(s) ? "Chinese (Simplified)" : /engl/i.test(s) ? "English" : s);
const suffix = (lang: string) =>
  ({ Malay: "MYS", English: "ENG", "Chinese (Simplified)": "CHS", "Chinese (Traditional)": "CHT", Tamil: "TAM", Indonesian: "IND", Thai: "THA", Vietnamese: "VIE", Japanese: "JPN", Korean: "KOR" })[lang] ?? lang.slice(0, 3).toUpperCase();

function download(name: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

interface Loaded {
  name: string;
  raw: string;
  doc: SubDoc;
  encoding: string;
}

/** Subtitle job: Lina translates, the rules check, Adam reviews, Lina fixes — then you download the file. */
export function SubtitleStudio() {
  const open = useUI((s) => s.dialog === "subtitles");
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const employees = useOffice((s) => s.employees);
  const lina = employees.find((e) => e.id === TRANSLATOR && e.active) ?? employees.find((e) => e.active && e.departmentId === "dept-amare");
  const adam = employees.find((e) => e.id === REVIEWER && e.active) ?? employees.find((e) => e.active && e.departmentId === "dept-amare" && e.id !== lina?.id);
  const stats = useOffice((s) => (adam ? s.settings.qaStats?.[adam.id] : undefined));

  const [file, setFile] = useState<Loaded | null>(null);
  const [sourceLang, setSourceLang] = useState("Malay");
  const [targetLang, setTargetLang] = useState("Chinese (Simplified)");
  const [notes, setNotes] = useState("");
  const [glossary, setGlossary] = useState("");
  const [limits, setLimits] = useState<CheckLimits | null>(null);
  const [practice, setPractice] = useState(true);
  const [langLabel, setLangLabel] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [edits, setEdits] = useState<Map<number, string[]>>(new Map());
  const [filter, setFilter] = useState<"flagged" | "all">("flagged");
  const [q, setQ] = useState("");
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const running = !!progress && progress.stage !== "done" && !result;

  useEffect(() => {
    if (!open) return;
    try {
      const g = localStorage.getItem("ov:sub-glossary");
      if (g && !glossary) setGlossary(g);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const open_ = (name: string, raw: string, encoding: string) => {
    const format = formatOf(name)!;
    const doc = parseSubtitle(raw, format, { encoding });
    // proof that writing back changes nothing but the text
    if (doc.write(new Map()) !== raw) throw new Error("This file couldn't be read back exactly — not safe to translate. Please send it to support.");
    setFile({ name, raw, doc, encoding });
    setLimits(limitsFor(doc.cues));
    return doc;
  };
  const load = async (f: File) => {
    const format = formatOf(f.name);
    if (!format) return toast("error", `Use a subtitle file: ${SUB_EXTS.map((e) => "." + e).join(", ")}`);
    if (f.size > 8 * 1024 * 1024) return toast("error", "That file is over 8 MB.");
    try {
      const raw = decodeSubtitle(new Uint8Array(await f.arrayBuffer()), format);
      const doc = open_(f.name, raw, "auto");
      const enc = doc.meta.ENCODING ?? "";
      const src = langFromMeta(doc.meta.LANG_CO) || (enc === "gbk" ? "Chinese (Simplified)" : enc === "big5" ? "Chinese (Traditional)" : "");
      if (src) setSourceLang(src);
      if (src && src === targetLang) setTargetLang(src === "English" ? "Malay" : "English");
      setResult(null);
      setProgress(null);
      setEdits(new Map());
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  };
  const changeEncoding = (encoding: string) => {
    if (!file) return;
    try {
      open_(file.name, file.raw, encoding);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  };

  const start = async () => {
    if (!file || !limits || !lina || !adam) return;
    if (sourceLang === targetLang) return toast("error", "Pick a different language to translate into.");
    try {
      localStorage.setItem("ov:sub-glossary", glossary);
    } catch {}
    const st = useOffice.getState();
    const job = `${file.name} (${sourceLang} → ${targetLang})`;
    const linaTask = st.assignTask({ employeeId: lina.id, title: `Translate subtitles: ${job}`, instructions: `${file.doc.cues.length} subtitles. ${notes}`.trim(), priority: "normal", fileNames: [file.name] });
    const linaId = linaTask.ok ? linaTask.id! : null;
    if (linaId) st.updateTask(linaId, { status: "running" });
    st.setEmployeeStatus([lina.id], "working");
    let adamId: string | null = null;
    abort.current = new AbortController();
    setResult(null);
    setEdits(new Map());
    try {
      const res = await runSubtitleJob(
        file.doc.cues,
        {
          sourceLang,
          targetLang,
          notes,
          glossary: parseGlossary(glossary),
          limits,
          translator: { name: lina.name, title: lina.title, model: lina.ai?.model },
          reviewer: { name: adam.name, title: adam.title, model: adam.ai?.model },
          practice,
        },
        (p) => {
          setProgress(p);
          const s = useOffice.getState();
          if (p.stage === "review" && p.done === 0 && !adamId) {
            if (linaId) s.updateTask(linaId, { status: "completed", result: `Translated ${p.total} subtitles — passed to ${adam.name.split(" ")[0]} for QA.` });
            s.setEmployeeStatus([lina.id], "available");
            const t = s.assignTask({ employeeId: adam.id, title: `QA check subtitles: ${job}`, instructions: `Check ${lina.name.split(" ")[0]}'s translation line by line.`, priority: "normal", fileNames: [file.name] });
            adamId = t.ok ? t.id! : null;
            if (adamId) s.updateTask(adamId, { status: "running" });
            s.setEmployeeStatus([adam.id], "working");
          }
          if (p.stage === "fix" && p.done === 0) s.setEmployeeStatus([lina.id], "working");
          if (p.stage === "recheck" && p.done === 0) s.setEmployeeStatus([lina.id], "available");
        },
        abort.current.signal,
      );
      setResult(res);
      const count = (k: RowStatus) => res.rows.filter((r) => r.status === k).length;
      const summary = `${res.rows.length} subtitles: ${count("ok")} OK, ${count("fixed")} fixed after review, ${count("check")} need a native check, ${count("attention")} need you.${res.practice.planted ? ` Practice test: caught ${res.practice.caught}/${res.practice.planted} planted mistakes.` : ""}`;
      const s = useOffice.getState();
      if (adamId) s.updateTask(adamId, { status: "completed", result: summary });
      s.setEmployeeStatus([adam.id, lina.id], "available");
      const prev = s.settings.qaStats?.[adam.id] ?? { planted: 0, caught: 0, missed: 0, jobs: 0 };
      s.updateSettings({ qaStats: { ...(s.settings.qaStats ?? {}), [adam.id]: { ...prev, planted: prev.planted + res.practice.planted, caught: prev.caught + res.practice.caught, jobs: prev.jobs + 1 } } });
      s.notify({ priority: count("attention") ? "important" : "info", title: `✅ Subtitles ready: ${file.name}`, body: `${lina.name.split(" ")[0]} translated, ${adam.name.split(" ")[0]} checked. ${summary}`, employeeId: adam.id, companyId: adam.companyId, demo: false });
      toast("success", "Subtitles translated and checked");
    } catch (e) {
      const msg = e instanceof Error ? (e.name === "AbortError" ? "Cancelled" : e.message) : String(e);
      const s = useOffice.getState();
      for (const id of [linaId, adamId]) if (id && s.tasks.find((t) => t.id === id)?.status === "running") s.updateTask(id, { status: msg === "Cancelled" ? "cancelled" : "failed", result: msg });
      s.setEmployeeStatus([lina.id, adam.id], "available");
      setProgress(null);
      toast("error", `Subtitle job: ${msg}`);
    }
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (result?.rows ?? []).filter(
      (r) =>
        (filter === "all" || r.status !== "ok" || r.auto.length > 0) &&
        (!needle || String(r.n) === needle || [...r.source, ...r.final, r.back ?? ""].join(" ").toLowerCase().includes(needle)),
    );
  }, [result, filter, q]);
  const finalOf = (r: JobRow) => edits.get(r.n) ?? r.final;

  const save = () => {
    if (!file || !result) return;
    const tr = new Map(result.rows.map((r) => [r.n, finalOf(r)]));
    const text = file.doc.write(tr, file.doc.format === "cip" && langLabel.trim() ? { meta: { LANG_CO: langLabel.trim() } } : undefined);
    // the written file must read back with the same timings and the new text
    const check = parseSubtitle(text, file.doc.format);
    const same = check.cues.length === file.doc.cues.length && check.cues.every((c, i) => c.inTC === file.doc.cues[i].inTC && c.outTC === file.doc.cues[i].outTC);
    if (!same) return toast("error", "Safety check failed: the new file's timings don't match the original. Nothing was saved.");
    const base = file.name.replace(/\.[^.]+$/, "");
    const swapped = /(_|\s|-)(MYS|ENG|CHS|CHT|TAM|IND|THA|VIE|JPN|KOR)$/i.test(base) ? base.replace(/(MYS|ENG|CHS|CHT|TAM|IND|THA|VIE|JPN|KOR)$/i, suffix(targetLang)) : `${base}_${suffix(targetLang)}`;
    download(`${swapped}.${file.name.split(".").pop()}`, encodeSubtitle(text, file.doc.format), file.doc.format === "cip" ? "application/rtf" : "text/plain;charset=utf-8");
  };

  const reportMissed = (r: JobRow) => {
    if (!adam) return;
    const s = useOffice.getState();
    const prev = s.settings.qaStats?.[adam.id] ?? { planted: 0, caught: 0, missed: 0, jobs: 0 };
    s.updateSettings({ qaStats: { ...(s.settings.qaStats ?? {}), [adam.id]: { ...prev, missed: prev.missed + 1 } } });
    s.logActivity(adam.id, `missed a problem in subtitle ${r.n} (reported by the CEO)`);
    toast("info", `Noted — counted against ${adam.name.split(" ")[0]}'s record`);
  };

  const counts = (k: RowStatus) => result?.rows.filter((r) => r.status === k).length ?? 0;
  const score = stats && stats.planted ? Math.round((stats.caught / stats.planted) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && set({ dialog: o ? "subtitles" : null })}>
      <DialogContent title="Subtitle Studio" description={`${lina?.name ?? "Translator"} translates · ${adam?.name ?? "Reviewer"} checks every line · you download the file`} className="h-[90vh] max-w-5xl">
        {!lina || !adam ? (
          <p className="p-6 text-sm text-slate-600">Subtitle jobs need two active Amare Localization employees (a translator and a QA reviewer).</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {/* reviewer track record */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-2 text-[11px] text-slate-600">
              <ShieldCheck className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-800">{adam.name.split(" ")[0]}&apos;s record:</span>
              {score === null ? (
                <span>no practice tests yet — the first job will start his record.</span>
              ) : (
                <span>
                  caught <b>{stats!.caught}</b> of <b>{stats!.planted}</b> planted test mistakes (<b className={score >= 90 ? "text-emerald-700" : score >= 75 ? "text-amber-700" : "text-red-700"}>{score}%</b>) over {stats!.jobs} job{stats!.jobs === 1 ? "" : "s"}
                  {stats!.missed ? ` · ${stats!.missed} real mistake${stats!.missed === 1 ? "" : "s"} you reported he missed` : ""}
                </span>
              )}
            </div>

            {!result && !running && (
              <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                <button
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) void load(f);
                  }}
                  className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-xs text-slate-500 hover:border-sky-300 hover:text-slate-700"
                >
                  {file ? (
                    <>
                      <Clapperboard className="h-6 w-6 text-sky-600" />
                      <span className="text-sm font-semibold text-slate-800">{file.name}</span>
                      <span>
                        {file.doc.cues.length} subtitles · .{file.doc.format}
                        {file.doc.fps ? ` · ${file.doc.fps} fps` : ""}
                        {file.doc.meta.LANG_CO ? ` · ${file.doc.meta.LANG_CO}` : ""} · read back byte-for-byte ✓ — click to choose another
                      </span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-6 w-6" />
                      <span className="text-sm font-medium text-slate-700">Drop a subtitle file or click to choose</span>
                      <span>.cip · .srt · .vtt · .ass · .sbv — the file stays in your browser; only the text lines are sent for translation</span>
                    </>
                  )}
                </button>
                <input
                  ref={input}
                  type="file"
                  accept={SUB_EXTS.map((e) => "." + e).concat(".ssa").join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void load(f);
                    e.target.value = "";
                  }}
                />

                {file && (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Preview</span>
                      <span className="text-[11px] text-slate-500">— if this looks garbled, change the text encoding</span>
                      {file.doc.format === "cip" && (
                        <Select value={file.encoding} onChange={(e) => changeEncoding(e.target.value)} className="ml-auto h-7 w-auto text-[11px]" aria-label="Text encoding">
                          {CIP_ENCODINGS.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.v === "auto" ? `Automatic — ${CIP_ENCODINGS.find((x) => x.v === file.doc.meta.ENCODING)?.label ?? file.doc.meta.ENCODING ?? "Western"}` : o.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                    <div className="space-y-1 text-sm text-slate-800">
                      {file.doc.cues.slice(0, 4).map((c) => (
                        <div key={c.n} className="flex gap-3">
                          <span className="w-10 shrink-0 font-mono text-[11px] text-slate-400">#{c.n}</span>
                          <span>{c.lines.join(" / ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>From</Label>
                    <Select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                      {[...new Set([sourceLang, ...LANGS])].map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>Into</Label>
                    <Select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                      {LANGS.filter((l) => l !== sourceLang).map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Project notes for Lina (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="e.g. Drama set in 1930s Japan/Korea. Keep characters' names as in the original. Formal speech between strangers, casual within the family." />
                </div>
                <div>
                  <Label>Glossary — one per line, original = translation (optional, remembered)</Label>
                  <Textarea value={glossary} onChange={(e) => setGlossary(e.target.value)} className="font-mono text-xs" placeholder={"Sunja = 善子\nUniversiti Waseda = 早稻田大学"} />
                </div>
                {limits && (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-700">Automatic checks (set from your file — no stricter than the original)</div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(
                        [
                          ["maxWidth", "Max line width", "characters (Chinese = 2)"],
                          ["maxLines", "Max lines", "on screen"],
                          ["maxSpeed", "Max reading speed", "per second"],
                        ] as [keyof CheckLimits, string, string][]
                      ).map(([k, label, unit]) => (
                        <div key={k}>
                          <Label>{label}</Label>
                          <div className="flex items-center gap-1.5">
                            <Input type="number" value={limits[k]} min={1} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) || limits[k] })} className="h-8 w-20" />
                            <span className="text-[11px] text-slate-500">{unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">Also checked on every line: nothing missing or empty, timings untouched, formatting tags kept, numbers kept, glossary used.</div>
                  </div>
                )}
                {file?.doc.format === "cip" && (
                  <div>
                    <Label>Language label inside the .cip file (LANG_CO) — leave empty to keep &ldquo;{file.doc.meta.LANG_CO ?? ""}&rdquo;</Label>
                    <Input value={langLabel} onChange={(e) => setLangLabel(e.target.value)} placeholder="e.g. Chinese" className="h-8 w-60" />
                  </div>
                )}
                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input type="checkbox" className="mt-0.5" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
                  <span>
                    <b>Practice tests for {adam.name.split(" ")[0]}</b> — slip one deliberate mistake into each batch he reviews (in a separate copy, never in your file) and record whether he catches it.
                  </span>
                </label>
                <div className="flex justify-end">
                  <Button onClick={start} disabled={!file || sourceLang === targetLang}>
                    <Clapperboard /> Start — {lina.name.split(" ")[0]} translates, {adam.name.split(" ")[0]} checks
                  </Button>
                </div>
              </div>
            )}

            {running && progress && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                <div className="text-sm font-semibold text-slate-800">
                  {progress.stage === "translate" || progress.stage === "fix" ? lina.name.split(" ")[0] : adam.name.split(" ")[0]} is {STAGE[progress.stage]} — {progress.done} / {progress.total}
                </div>
                <div className="h-2 w-72 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <ol className="space-y-1 text-left text-xs text-slate-500">
                  {(["translate", "review", "fix", "recheck"] as const).map((s) => {
                    const order = ["translate", "check", "review", "fix", "recheck", "done"];
                    const cur = order.indexOf(progress.stage);
                    const me = order.indexOf(s);
                    return (
                      <li key={s} className={cn(me < cur && "text-emerald-700", me === cur && "font-semibold text-slate-800")}>
                        {me < cur ? "✓" : me === cur ? "▸" : "○"} {s === "translate" ? `${lina.name.split(" ")[0]} translates` : s === "review" ? `Automatic checks + ${adam.name.split(" ")[0]} reviews every line` : s === "fix" ? `${lina.name.split(" ")[0]} fixes flagged lines (if any)` : `${adam.name.split(" ")[0]} re-checks the fixes`}
                      </li>
                    );
                  })}
                </ol>
                <p className="max-w-sm text-[11px] text-slate-400">Keep this window open — about 1–2 minutes per 100 subtitles.</p>
                <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
                  <X /> Cancel
                </Button>
              </div>
            )}

            {result && file && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2 text-xs">
                  {(["ok", "fixed", "check", "attention"] as RowStatus[]).map((k) => (
                    <span key={k} className={cn("rounded-full px-2 py-0.5 font-semibold", STATUS[k].cls)}>
                      {counts(k)} {STATUS[k].label}
                    </span>
                  ))}
                  {result.practice.planted > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700" title={result.practice.details.map((d) => `${d.caught ? "✓" : "✗"} ${d.kind}`).join("\n")}>
                      Practice test: caught {result.practice.caught}/{result.practice.planted}
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => download(`${file.name.replace(/\.[^.]+$/, "")}_QA-report.csv`, reportCsv(result.rows.map((r) => ({ ...r, final: finalOf(r) }))), "text/csv;charset=utf-8")}>
                      <Download /> QA report
                    </Button>
                    <Button size="sm" onClick={save}>
                      <Download /> Download .{file.doc.format}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {(["flagged", "all"] as const).map((f) => (
                      <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-3 py-1 text-xs font-medium", filter === f ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
                        {f === "flagged" ? "Flagged" : `All ${result.rows.length}`}
                      </button>
                    ))}
                  </div>
                  <label className="relative min-w-[10rem] flex-1">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or subtitle #" className="h-7 w-full rounded-md border border-slate-200 bg-panel pl-7 pr-2 text-[11px]" />
                  </label>
                  <button onClick={() => { setResult(null); setProgress(null); }} className="text-[11px] font-medium text-slate-500 hover:underline">
                    New job
                  </button>
                </div>
                <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                  {!rows.length && <p className="p-8 text-center text-sm text-slate-500">{filter === "flagged" ? "Nothing flagged — every line passed. 🎉" : "No subtitles match."}</p>}
                  {rows.slice(0, 400).map((r) => (
                    <div key={r.n} className="grid gap-3 rounded-xl border border-slate-200 p-3 text-xs md:grid-cols-[4.5rem_1fr_1fr]">
                      <div className="text-slate-500">
                        <div className="font-mono text-sm font-semibold text-slate-800">#{r.n}</div>
                        <div className="font-mono text-[10px]">{r.inTC}</div>
                        <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{sourceLang}</div>
                        {r.source.map((l, i) => (
                          <div key={i} className="text-slate-700">{l}</div>
                        ))}
                        {r.back && <div className="mt-1.5 text-[11px] italic text-slate-500">Back-translation: “{r.back}”</div>}
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{targetLang}</div>
                        <textarea
                          value={finalOf(r).join("\n")}
                          onChange={(e) => setEdits((m) => new Map(m).set(r.n, e.target.value.split("\n").map((x) => x.trim()).filter(Boolean)))}
                          rows={Math.max(2, finalOf(r).length)}
                          className="w-full resize-none rounded-md border border-transparent bg-transparent p-0 text-sm text-slate-900 hover:border-slate-200 focus:border-sky-300 focus:outline-none"
                          aria-label={`Translation of subtitle ${r.n}`}
                        />
                        {r.note && (
                          <div className="mt-1 flex gap-1 text-[11px] text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {adam.name.split(" ")[0]}: {r.note}
                          </div>
                        )}
                        {r.auto.map((a, i) => (
                          <div key={i} className={cn("text-[11px]", a.level === "error" ? "text-red-700" : "text-slate-500")}>
                            ⚙ {a.message}
                          </div>
                        ))}
                        {r.draft && <div className="mt-1 text-[11px] text-slate-400">First draft: {r.draft.join(" / ")}</div>}
                        {(r.status === "ok" || r.status === "fixed") && (
                          <button onClick={() => reportMissed(r)} className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-red-700">
                            <Flag className="h-3 w-3" /> {adam.name.split(" ")[0]} missed a problem here
                          </button>
                        )}
                        {r.status === "ok" && !r.auto.length && filter === "all" && <CheckCircle2 className="mt-1 h-3.5 w-3.5 text-emerald-500" />}
                      </div>
                    </div>
                  ))}
                  {rows.length > 400 && <p className="text-center text-[11px] text-slate-400">Showing the first 400 — search to find others. The download includes all {result.rows.length}.</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
