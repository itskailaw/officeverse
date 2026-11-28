"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCountUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A number that rolls from its last value to the new one. */
export function CountUp({ value, format, ms }: { value: number; format: (n: number) => string; ms?: number }) {
  const v = useCountUp(value, ms);
  return <>{format(v)}</>;
}

/** Shimmer placeholder in the shape of the content that's loading. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("ov-skel block h-3", className)} />;
}
/** A few shimmer rows (list loading). */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5 py-3", className)} aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

const SCENES = {
  coffee: { emoji: "☕", who: "Mei Ling is having a coffee", steam: true },
  relax: { emoji: "🌴", who: "", steam: false },
  sparkle: { emoji: "✨", who: "", steam: false },
  boxes: { emoji: "📦", who: "", steam: false },
  sleep: { emoji: "😴", who: "", steam: false },
} as const;
/** Friendly little looping scene for "nothing here" states. */
export function EmptyState({ kind = "sparkle", text, sub, className }: { kind?: keyof typeof SCENES; text: string; sub?: string; className?: string }) {
  const s = SCENES[kind];
  return (
    <div className={cn("flex flex-col items-center gap-1.5 py-5 text-center", className)}>
      <div className="relative h-12 w-12">
        {s.steam && (
          <span className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-3 w-1 rounded-full bg-slate-300" style={{ animation: `ov-steam 1.8s ${i * 0.35}s ease-out infinite` }} />
            ))}
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center text-[34px]" style={{ animation: "ov-float 2.6s ease-in-out infinite" }} aria-hidden>
          {s.emoji}
        </span>
      </div>
      <div className="text-xs font-semibold text-slate-700">{text}</div>
      {(sub || s.who) && <div className="text-[11px] text-slate-500">{sub || s.who}</div>}
    </div>
  );
}

/**
 * Sliding highlight behind the active item of a tab bar / segmented control.
 * Put `ref` on the bar (position: relative) and `data-active="true"` on the active button.
 */
export function useSlider<T extends HTMLElement>(dep: unknown) {
  const [el, setEl] = useState<T | null>(null);
  const [box, setBox] = useState<{ left: number; width: number; top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const a = el.querySelector<HTMLElement>('[data-active="true"]');
      setBox(a ? { left: a.offsetLeft, width: a.offsetWidth, top: a.offsetTop, height: a.offsetHeight } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, dep]);
  return { ref: setEl, box };
}
export function SliderPill({ box, className }: { box: { left: number; width: number; top: number; height: number } | null; className?: string }) {
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute z-0 transition-[left,width] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]", className)}
      style={{ left: box.left, width: box.width, top: box.top, height: box.height }}
    />
  );
}

/**
 * A detail panel that grows out of the element that was clicked (and shrinks back into it).
 * Lives inside the surrounding window, so Esc / clicking the backdrop close only the panel.
 */
export function ExpandSheet({ from, onClose, children, width = 860, height = 500 }: { from: HTMLElement; onClose: () => void; children: React.ReactNode; width?: number; height?: number }) {
  const sheet = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const closing = useRef(false);

  const measure = () => {
    const box = from.closest<HTMLElement>('[role="dialog"]')?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const r = from.getBoundingClientRect();
    const w = Math.min(width, box.width - 24);
    const h = Math.min(height, box.height - 24);
    const left = (box.width - w) / 2;
    const top = Math.max(12, (box.height - h) / 2);
    return { dx: r.left - box.left - left, dy: r.top - box.top - top, sx: r.width / w, sy: r.height / h, left, top, w, h };
  };
  const [g] = useState(measure);
  useLayoutEffect(() => {
    const el = sheet.current!;
    el.style.transition = "none";
    el.style.transform = `translate(${g.dx}px, ${g.dy}px) scale(${g.sx}, ${g.sy})`;
    from.style.visibility = "hidden";
    void el.offsetWidth;
    el.style.transition = "transform 0.48s cubic-bezier(.2,.9,.25,1)";
    el.style.transform = "none";
    const t = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(t);
      from.style.visibility = "";
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setShown(false);
    const m = measure();
    const el = sheet.current;
    if (el) {
      el.style.transition = "transform 0.38s cubic-bezier(.4,0,.2,1)";
      el.style.transform = `translate(${m.dx}px, ${m.dy}px) scale(${m.sx}, ${m.sy})`;
    }
    setTimeout(onClose, 380);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-40">
      <div className={cn("absolute inset-0 bg-slate-950/30 backdrop-blur-[1.5px] transition-opacity duration-300", shown ? "opacity-100" : "opacity-0")} onClick={close} />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        className="absolute origin-top-left overflow-hidden rounded-[22px] bg-panel shadow-2xl ring-1 ring-slate-200"
        style={{ left: g.left, top: g.top, width: g.w, height: g.h }}
      >
        <button type="button" onClick={close} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" aria-label="Close">
          ✕
        </button>
        <div className={cn("group h-full overflow-y-auto p-5 transition-opacity duration-200", shown ? "opacity-100 delay-150" : "opacity-0")} data-open={shown ? "1" : "0"}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Text that types itself out (after `delay` ms), with a blinking caret while it types. */
export function TypeText({ text, delay = 0, cps = 55 }: { text: string; delay?: number; cps?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(text.length);
      return;
    }
    setN(0);
    let i = 0;
    let iv: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(iv);
      }, 1000 / cps);
    }, delay);
    return () => {
      clearTimeout(start);
      if (iv) clearInterval(iv);
    };
  }, [text, delay, cps]);
  return (
    <span aria-label={text}>
      <span aria-hidden className={n > 0 && n < text.length ? "ov-caret" : undefined}>
        {text.slice(0, n)}
      </span>
      <span aria-hidden className="invisible">
        {text.slice(n)}
      </span>
    </span>
  );
}
