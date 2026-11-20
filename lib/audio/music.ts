"use client";

import { create } from "zustand";
import { GenerativeMusic, type Style } from "./generative";

/**
 * Background music: built-in generated instrumentals, or the CEO's own audio files.
 * Own files are kept in this browser (IndexedDB) — never uploaded anywhere.
 */
export interface Track {
  id: string;
  name: string;
  size: number;
}
type Source = "builtin" | "playlist";
interface Prefs {
  source: Source;
  style: Style;
  volume: number;
  shuffle: boolean;
  /** start again automatically on the next visit (after the first click — browsers require one) */
  resume: boolean;
}
interface MusicState extends Prefs {
  playing: boolean;
  tracks: Track[];
  current: string | null;
  error: string | null;
  ready: boolean;
  init(): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  toggle(): Promise<void>;
  setSource(s: Source): Promise<void>;
  setStyle(s: Style): Promise<void>;
  setVolume(v: number): void;
  setShuffle(v: boolean): void;
  addFiles(files: FileList | File[]): Promise<number>;
  removeTrack(id: string): Promise<void>;
  playTrack(id: string): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
}

const PREFS_KEY = "ov:music-v1";
const DEFAULTS: Prefs = { source: "builtin", style: "lofi", volume: 0.35, shuffle: false, resume: false };
function readPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>) };
  } catch {
    return DEFAULTS;
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {}
}

// ───────────────────────── IndexedDB (own tracks)
const DB = "ov-music";
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("tracks", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction("tracks", mode);
    const r = fn(t.objectStore("tracks"));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
type Stored = Track & { blob: Blob; order: number };

// ───────────────────────── engines (created on first user action)
let ctx: AudioContext | null = null;
let volumeNode: GainNode | null = null;
let gen: GenerativeMusic | null = null;
let audio: HTMLAudioElement | null = null;
let url: string | null = null;

function engines(style: Style, volume: number) {
  if (!ctx) {
    ctx = new AudioContext();
    volumeNode = ctx.createGain();
    volumeNode.gain.value = volume;
    volumeNode.connect(ctx.destination);
    gen = new GenerativeMusic(ctx, volumeNode, style);
  }
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.volume = volume;
    audio.addEventListener("ended", () => void useMusic.getState().next());
    audio.addEventListener("error", () => useMusic.setState({ error: "Couldn't play this file — try MP3, M4A/AAC, OGG or WAV." }));
  }
  return { ctx, gen: gen!, audio };
}

export const useMusic = create<MusicState>((set, get) => {
  const prefs = (): Prefs => {
    const s = get();
    return { source: s.source, style: s.style, volume: s.volume, shuffle: s.shuffle, resume: s.resume };
  };
  const loadTrack = async (id: string) => {
    const rec = await tx<Stored | undefined>("readonly", (s) => s.get(id));
    if (!rec) throw new Error("Track not found.");
    const { audio } = engines(get().style, get().volume);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(rec.blob);
    audio.src = url;
    set({ current: id, error: null });
  };
  return {
    ...DEFAULTS,
    playing: false,
    tracks: [],
    current: null,
    error: null,
    ready: false,

    async init() {
      if (get().ready) return;
      const p = readPrefs();
      let tracks: Track[] = [];
      try {
        const all = await tx<Stored[]>("readonly", (s) => s.getAll());
        tracks = all.sort((a, b) => a.order - b.order).map(({ id, name, size }) => ({ id, name, size }));
      } catch {}
      set({ ...p, tracks, ready: true });
    },

    async play() {
      const s = get();
      const e = engines(s.style, s.volume);
      if (e.ctx.state === "suspended") await e.ctx.resume();
      try {
        if (s.source === "builtin") {
          e.audio.pause();
          e.gen.setStyle(s.style);
          e.gen.start();
        } else {
          e.gen.stop(0.3);
          if (!s.tracks.length) {
            set({ error: "Add some music files first." });
            return;
          }
          if (!s.current || !s.tracks.some((t) => t.id === s.current)) await loadTrack(s.tracks[0].id);
          await e.audio.play();
        }
        set({ playing: true, error: null, resume: true });
        savePrefs(prefs());
      } catch (err) {
        set({ playing: false, error: err instanceof Error ? err.message : String(err) });
      }
    },
    pause() {
      gen?.stop();
      audio?.pause();
      set({ playing: false, resume: false });
      savePrefs(prefs());
    },
    async toggle() {
      if (get().playing) get().pause();
      else await get().play();
    },
    async setSource(source) {
      const was = get().playing;
      gen?.stop(0.3);
      audio?.pause();
      set({ source, playing: false, error: null });
      savePrefs(prefs());
      // keep playing in the new source — unless the playlist is still empty
      if (was && !(source === "playlist" && !get().tracks.length)) await get().play();
    },
    async setStyle(style) {
      set({ style, source: "builtin" });
      savePrefs(prefs());
      if (gen && get().playing) gen.setStyle(style);
      else await get().play();
    },
    setVolume(volume) {
      set({ volume });
      if (volumeNode && ctx) volumeNode.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
      if (audio) audio.volume = volume;
      savePrefs(prefs());
    },
    setShuffle(shuffle) {
      set({ shuffle });
      savePrefs(prefs());
    },
    async addFiles(files) {
      const list = Array.from(files).filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(f.name));
      let order = get().tracks.length;
      const added: Track[] = [];
      for (const f of list) {
        const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const rec: Stored = { id, name: f.name.replace(/\.[^.]+$/, ""), size: f.size, blob: f, order: order++ };
        try {
          await tx("readwrite", (s) => s.put(rec));
          added.push({ id: rec.id, name: rec.name, size: rec.size });
        } catch {
          set({ error: "Your browser's storage is full — remove some tracks first." });
          break;
        }
      }
      set((s) => ({ tracks: [...s.tracks, ...added] }));
      return added.length;
    },
    async removeTrack(id) {
      await tx("readwrite", (s) => s.delete(id));
      const wasCurrent = get().current === id;
      set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id), current: wasCurrent ? null : s.current }));
      if (wasCurrent) {
        audio?.pause();
        if (get().playing && get().tracks.length) await get().next();
        else set({ playing: false });
      }
    },
    async playTrack(id) {
      set({ source: "playlist" });
      gen?.stop(0.3);
      await loadTrack(id);
      await get().play();
    },
    async next() {
      const s = get();
      if (!s.tracks.length) return;
      const i = s.tracks.findIndex((t) => t.id === s.current);
      let n = (i + 1) % s.tracks.length;
      if (s.shuffle && s.tracks.length > 1) {
        do n = Math.floor(Math.random() * s.tracks.length);
        while (n === i);
      }
      await loadTrack(s.tracks[n].id);
      if (s.playing || s.source === "playlist") await get().play();
    },
    async prev() {
      const s = get();
      if (!s.tracks.length) return;
      if (audio && audio.currentTime > 4) {
        audio.currentTime = 0;
        return;
      }
      const i = s.tracks.findIndex((t) => t.id === s.current);
      await loadTrack(s.tracks[(i - 1 + s.tracks.length) % s.tracks.length].id);
      if (s.playing) await get().play();
    },
  };
});
