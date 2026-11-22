"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib everywhere).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export type VoiceLang = "en-MY" | "ms-MY";

/**
 * Speak to type: tap to start, words appear as you talk, and it stops by itself after a pause.
 * `onDone` gets the full text when listening ends (empty if nothing was heard).
 */
export function useVoiceInput(opts: { lang: VoiceLang; onText: (t: string) => void; onDone: (t: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const text = useRef("");
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => setSupported(!!ctor()), []);
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return;
    setError(null);
    text.current = "";
    const r = new C();
    r.lang = cb.current.lang;
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      text.current = (finalText + interim).trim();
      cb.current.onText(text.current);
    };
    r.onerror = (e) => {
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone access is blocked — allow it for OfficeVerse in your browser settings."
          : e.error === "no-speech"
            ? "Didn't hear anything — try again."
            : e.error === "network"
              ? "Voice needs an internet connection."
              : null,
      );
    };
    r.onend = () => {
      setListening(false);
      rec.current = null;
      cb.current.onDone(text.current);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);
  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}

/** Plain text for reading aloud: no markdown symbols, links, tables or emoji clutter. */
export function speakable(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|.*\|/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

/** Unlock speech on iPad: it only speaks after a tap, so say nothing once during the tap. */
export function primeSpeech() {
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

/** Read a staff reply aloud in a voice that roughly fits them. */
export function speak(text: string, o: { lang: VoiceLang; female: boolean }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voices = synth.getVoices();
  const base = o.lang.slice(0, 2);
  const pool = voices.filter((v) => v.lang.replace("_", "-").startsWith(base));
  const english = voices.filter((v) => v.lang.startsWith("en"));
  const list = pool.length ? pool : english;
  const femaleHint = /female|woman|samantha|karen|moira|tessa|victoria|zira|aria|siri.*female|amira|yasmin/i;
  const maleHint = /male|man|daniel|alex|fred|rishi|aaron|david|guy/i;
  u.voice = list.find((v) => (o.female ? femaleHint : maleHint).test(v.name)) ?? list.find((v) => v.lang.includes("MY")) ?? list[0] ?? null;
  u.lang = u.voice?.lang ?? o.lang;
  u.pitch = o.female ? 1.1 : 0.9;
  u.rate = 1;
  synth.speak(u);
}

export const stopSpeaking = () => {
  try {
    window.speechSynthesis.cancel();
  } catch {}
};
