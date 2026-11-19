"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { isKobeDay } from "@/lib/office/kobeday";

const COLORS = ["#552583", "#fdb927", "#7c3aed", "#f8fafc"];

/** 24 August: purple & gold confetti and a banner (once per year, dismissible). */
export function KobeDay() {
  const [show, setShow] = useState(false);
  const [burst, setBurst] = useState(false);
  const year = new Date().getFullYear();
  useEffect(() => {
    if (!isKobeDay()) return;
    let seen = false;
    try {
      seen = localStorage.getItem("ov:kobeday") === String(year) && !location.search.includes("kobeday=1");
    } catch {}
    if (seen) return;
    setShow(true);
    setBurst(true);
    const t = window.setTimeout(() => setBurst(false), 7000);
    return () => window.clearTimeout(t);
  }, [year]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.8,
        dur: 3.2 + Math.random() * 2.5,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * 360,
        round: i % 3 === 0,
      })),
    [],
  );
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem("ov:kobeday", String(year));
    } catch {}
  };
  return (
    <>
      {burst && (
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
          <style>{`@keyframes ov-fall{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(110vh) rotate(720deg)}}`}</style>
          {pieces.map((p, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                top: 0,
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 0.45,
                background: p.color,
                borderRadius: p.round ? "50%" : 2,
                transform: `rotate(${p.rot}deg)`,
                animation: `ov-fall ${p.dur}s ${p.delay}s ease-in forwards`,
              }}
            />
          ))}
        </div>
      )}
      <div className="pointer-events-auto fixed left-1/2 top-16 z-[61] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#fdb927]/60 bg-gradient-to-r from-[#552583] to-[#3b1a63] px-4 py-2.5 text-white shadow-xl">
        <span className="text-2xl" aria-hidden>
          🐍
        </span>
        <div>
          <div className="text-sm font-bold text-[#fdb927]">Happy Kobe Day · 8/24</div>
          <div className="text-xs text-violet-100">Mamba Mentality all day — the game room is lit up purple &amp; gold.</div>
        </div>
        <button onClick={close} className="ml-2 rounded-lg p-1 text-violet-200 hover:bg-white/10" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
