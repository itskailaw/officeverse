"use client";

import { useEffect, useRef, useState } from "react";
import { ListMusic, Music, Pause, Play, Plus, Repeat, Shuffle, SkipBack, SkipForward, Trash2, Volume2, VolumeX } from "lucide-react";
import { useMusic } from "@/lib/audio/music";
import { STYLES, type Style } from "@/lib/audio/generative";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STYLE_HINT: Record<Style, string> = {
  lofi: "Mellow beats & warm keys",
  jazz: "Brushes, walking bass",
  bossa: "Light & sunny",
  ambient: "Slow pads, no drums",
};

/** Top-bar music button + player. */
export function MusicPlayer() {
  const m = useMusic();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void m.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // resume last session's music on the first click anywhere (browsers block sound before a click)
  useEffect(() => {
    if (!m.ready || !m.resume || m.playing) return;
    const go = () => void useMusic.getState().play();
    window.addEventListener("pointerdown", go, { once: true });
    return () => window.removeEventListener("pointerdown", go);
  }, [m.ready, m.resume, m.playing]);
  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const current = m.tracks.find((t) => t.id === m.current);
  const nowLabel = m.source === "builtin" ? STYLES[m.style].label : current?.name ?? "My playlist";

  return (
    <div className="relative" ref={box}>
      <Button variant="ghost" size="sm" title="Background music" onClick={() => setOpen((o) => !o)} className={cn(m.playing && "bg-sky-50 text-sky-800")}>
        {m.playing ? <EqBars /> : <Music />}
        <span className="hidden max-w-[9rem] truncate xl:inline">{m.playing ? nowLabel : "Music"}</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-panel p-3 text-slate-800 shadow-2xl">
          {/* now playing */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => void m.toggle()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy text-white shadow hover:opacity-90"
              aria-label={m.playing ? "Pause" : "Play"}
            >
              {m.playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{nowLabel}</div>
              <div className="text-[11px] text-slate-500">{m.source === "builtin" ? "OfficeVerse original · generated live" : `${m.tracks.length} track${m.tracks.length === 1 ? "" : "s"} in your playlist`}</div>
            </div>
            {m.source === "playlist" && (
              <div className="flex">
                <Button size="icon" variant="ghost" onClick={() => void m.prev()} aria-label="Previous">
                  <SkipBack />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void m.next()} aria-label="Next">
                  <SkipForward />
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => m.setVolume(m.volume ? 0 : 0.35)} aria-label={m.volume ? "Mute" : "Unmute"} className="text-slate-500">
              {m.volume ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <input type="range" min={0} max={1} step={0.01} value={m.volume} onChange={(e) => m.setVolume(Number(e.target.value))} className="flex-1 accent-sky-600" aria-label="Volume" />
          </div>
          {m.error && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">{m.error}</div>}

          {/* source tabs */}
          <div className="mt-3 inline-flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                ["builtin", "OfficeVerse music"],
                ["playlist", "My playlist"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => void m.setSource(v)}
                className={cn("flex-1 rounded-md px-2 py-1 text-xs font-medium", m.source === v ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}
              >
                {label}
              </button>
            ))}
          </div>

          {m.source === "builtin" ? (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(Object.keys(STYLES) as Style[]).map((s) => (
                <button
                  key={s}
                  onClick={() => void m.setStyle(s)}
                  className={cn(
                    "rounded-xl border p-2 text-left transition",
                    m.style === s ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    {m.style === s && m.playing ? <EqBars small /> : null}
                    {STYLES[s].label}
                  </div>
                  <div className="text-[10px] text-slate-500">{STYLE_HINT[s]}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              <div className="scrollbar-thin max-h-48 space-y-0.5 overflow-y-auto">
                {!m.tracks.length && <p className="px-1 py-3 text-center text-[11px] text-slate-500">No tracks yet — add MP3, M4A, OGG or WAV files from your computer.</p>}
                {m.tracks.map((t, i) => (
                  <div key={t.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-1 text-xs", t.id === m.current ? "bg-sky-50 text-sky-900" : "text-slate-800 hover:bg-slate-50")}>
                    <button onClick={() => void m.playTrack(t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="flex w-5 shrink-0 justify-end text-[10px] tabular-nums text-slate-400">{t.id === m.current && m.playing ? <EqBars small /> : i + 1}</span>
                      <span className="truncate">{t.name}</span>
                    </button>
                    <button onClick={() => void m.removeTrack(t.id)} className="text-slate-300 opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label={`Remove ${t.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                  className="flex-1"
                >
                  <Plus /> Add music files
                </Button>
                <Button size="icon" variant="ghost" title={m.shuffle ? "Shuffle on" : "Shuffle off — plays in order"} onClick={() => m.setShuffle(!m.shuffle)} className={cn(m.shuffle && "bg-sky-50 text-sky-700")}>
                  {m.shuffle ? <Shuffle /> : <Repeat />}
                </Button>
              </div>
              <input
                ref={input}
                type="file"
                multiple
                accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
                className="hidden"
                onChange={async (e) => {
                  if (!e.target.files?.length) return;
                  setBusy(true);
                  await m.addFiles(e.target.files);
                  setBusy(false);
                  e.target.value = "";
                }}
              />
              <p className="mt-1.5 flex items-start gap-1 text-[10px] text-slate-400">
                <ListMusic className="mt-px h-3 w-3 shrink-0" /> Saved in this browser only (not uploaded). Use music you have the rights to play.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EqBars({ small }: { small?: boolean }) {
  return (
    <span className={cn("inline-flex items-end gap-[2px]", small ? "h-2.5" : "h-3.5")} aria-hidden>
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="w-[3px] animate-[ovEq_0.9s_ease-in-out_infinite] rounded-sm bg-current" style={{ animationDelay: `${d}s`, height: "100%" }} />
      ))}
    </span>
  );
}
