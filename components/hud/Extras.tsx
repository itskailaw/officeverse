"use client";

import { useTouchLayout } from "@/lib/hooks/useTouchLayout";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, HelpCircle, Map as MapIcon, X } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { CEO_ID } from "@/lib/data/seed";
import { STATUS_META } from "@/lib/data/types";
import { OFFICE_D, OFFICE_W, ROOMS } from "@/lib/office/layout";
import { getSim } from "@/lib/office/runtime";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** OfficeVerse brand mark (or the uploaded company logo). */
export function Logo({ size = 32 }: { size?: number }) {
  const logo = useOffice((s) => s.settings.logoUrl);
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="Company logo" style={{ height: size, width: size }} className="rounded-lg bg-panel object-contain p-0.5 ring-1 ring-slate-200" />;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="OfficeVerse">
      <defs>
        <linearGradient id="ov-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b5a8f" />
          <stop offset="1" stopColor="#13263f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#ov-g)" />
      {/* isometric building */}
      <path d="M16 6l9 5v10l-9 5-9-5V11z" fill="#f8fafc" opacity="0.12" />
      <path d="M16 8.5l7 3.9-7 3.9-7-3.9z" fill="#f8fafc" />
      <path d="M9 12.4l7 3.9v7.7l-7-3.9z" fill="#b07d4f" />
      <path d="M23 12.4l-7 3.9v7.7l7-3.9z" fill="#7dd3fc" />
      <circle cx="16" cy="5.2" r="1.6" fill="#fbbf24" />
    </svg>
  );
}

/** Company switcher with brand colour dots. */
export function CompanySwitcher() {
  const companies = useOffice((s) => s.companies);
  const value = useUI((s) => s.companyFilter);
  const set = useUI((s) => s.set);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);
  const active = companies.filter((c) => c.active);
  const current = active.find((c) => c.id === value);
  const options = [{ id: "all", name: "All companies", color: "" }, ...active];
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-panel px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        {current ? (
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: current.color }} />
        ) : (
          <span className="flex -space-x-1">
            {active.slice(0, 3).map((c) => (
              <span key={c.id} className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: c.color }} />
            ))}
          </span>
        )}
        <span className="max-w-40 truncate">{current?.name ?? "All companies"}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="anim-up absolute left-0 top-10 z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-panel p-1 shadow-xl">
          {options.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                set({ companyFilter: c.id });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
            >
              {c.color ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} /> : <span className="h-2.5 w-2.5 rounded-full border border-slate-300" />}
              <span className="flex-1 truncate font-medium">{c.name}</span>
              {value === c.id && <Check className="h-3.5 w-3.5 text-sky-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ minimap
const MAP_W = 220;
const SCALE = MAP_W / OFFICE_W;
const MAP_H = OFFICE_D * SCALE;
const ROOM_FILL: Record<string, string> = {
  ceo: "#5a3a24",
  boardroom: "#a0714a",
  ea: "#c4b5fd",
  kopitiam: "#d6a46a",
  game: "#7c3aed",
  garden: "#86c06c",
  corridor: "#e2e8f0",
  reception: "#f1f5f9",
  it: "#475569",
};

/** Top-down map with live employee dots. Click a room to fly the camera there. */
export function Minimap() {
  const [open, setOpen] = useState(true);
  const employees = useOffice((s) => s.employees);
  const selected = useUI((s) => s.selectedEmployeeId);
  const camera = useUI((s) => s.camera);
  const set = useUI((s) => s.set);
  const svgRef = useRef<SVGSVGElement>(null);
  const dots = useRef<Map<string, SVGCircleElement>>(new Map());

  const touch = useTouchLayout();
  useEffect(() => {
    try {
      const v = localStorage.getItem("ov:minimap");
      // tablets / phones: folded unless the CEO opened it
      if (v === "0" || (v === null && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 1024))) setOpen(false);
    } catch {}
  }, []);

  // move dots every frame without React re-renders
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const loop = () => {
      const sim = getSim();
      for (const [id, el] of dots.current) {
        const a = sim.agents.get(id);
        if (!a) continue;
        el.setAttribute("cx", String(a.x * SCALE));
        el.setAttribute("cy", String(a.z * SCALE));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem("ov:minimap", v ? "1" : "0");
    } catch {}
  };

  if (!open)
    return (
      <button
        onClick={() => toggle(true)}
        title="Show minimap"
        className={cn(
          "pointer-events-auto absolute right-3 z-20 grid place-items-center rounded-xl border border-panel/70 bg-panel/90 text-slate-600 shadow-lg backdrop-blur hover:bg-slate-100",
          touch ? "bottom-[calc(9.25rem+env(safe-area-inset-bottom))] h-11 w-11" : "bottom-16 h-10 w-10",
        )}
      >
        <MapIcon className="h-4 w-4" />
      </button>
    );

  return (
    <div
      className={cn(
        "anim-up pointer-events-auto absolute right-3 z-20 hidden rounded-2xl border border-panel/70 bg-panel/90 p-2 shadow-lg backdrop-blur sm:block",
        touch ? "bottom-[calc(9.25rem+env(safe-area-inset-bottom))]" : "bottom-16",
      )}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Floor plan</span>
        <button onClick={() => toggle(false)} className="text-slate-400 hover:text-slate-700" aria-label="Hide minimap">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <svg ref={svgRef} width={MAP_W} height={MAP_H} className="rounded-lg">
        <rect width={MAP_W} height={MAP_H} fill="#cbd5e1" />
        {ROOMS.map((r) => (
          <g key={r.id} className="cursor-pointer" onClick={() => camera({ kind: "focus", x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 })}>
            <rect
              x={r.x0 * SCALE + 0.6}
              y={r.z0 * SCALE + 0.6}
              width={(r.x1 - r.x0) * SCALE - 1.2}
              height={(r.z1 - r.z0) * SCALE - 1.2}
              rx={2}
              fill={ROOM_FILL[r.id] ?? "#e7ecf2"}
              className="transition hover:opacity-80"
            >
              <title>{r.name}</title>
            </rect>
          </g>
        ))}
        {employees
          .filter((e) => e.active)
          .map((e) => (
            <circle
              key={e.id}
              ref={(el) => {
                if (el) dots.current.set(e.id, el);
                else dots.current.delete(e.id);
              }}
              r={selected === e.id ? 3.4 : 2.3}
              fill={STATUS_META[e.status].color}
              stroke={selected === e.id ? "#0f172a" : "#ffffff"}
              strokeWidth={selected === e.id ? 1.4 : 0.8}
              className="cursor-pointer"
              onClick={() => set({ selectedEmployeeId: e.id })}
            >
              <title>{e.name}</title>
            </circle>
          ))}
        <circle
          ref={(el) => {
            if (el) dots.current.set(CEO_ID, el);
            else dots.current.delete(CEO_ID);
          }}
          r={3.4}
          fill="#d4a017"
          stroke="#0f172a"
          strokeWidth={1}
        >
          <title>You</title>
        </circle>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------ welcome tour
const STEPS = [
  {
    title: "Welcome to OfficeVerse 👋",
    body: "This is your company headquarters. Your AI employees work at their desks in each department. Let's take a 30-second tour.",
  },
  {
    title: "Move around",
    body: "Left-drag pans, right-drag rotates and the scroll wheel zooms. Click a room label or the floor plan in the corner to fly there. Q/E rotate, WASD pan.",
  },
  {
    title: "Your avatar",
    body: "You're the one with the gold ring in the CEO Suite. Click anywhere on the floor to walk there. Click your desk to open the Executive Dashboard.",
  },
  {
    title: "Your team",
    body: "Click an employee to open their profile, give them tasks, visit them or call them to your office. Press and drag someone to pick them up and move them.",
  },
  {
    title: "Run the company",
    body: "Call meetings from the left toolbar, rearrange furniture in Build mode, and personalise everything in Settings. Demo data is always clearly labelled.",
  },
];

export function WelcomeTour() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (!localStorage.getItem("ov:tour-done")) setStep(0);
    } catch {}
    const reopen = () => setStep(0);
    window.addEventListener("ov:tour", reopen);
    return () => window.removeEventListener("ov:tour", reopen);
  }, []);
  const finish = () => {
    setStep(null);
    try {
      localStorage.setItem("ov:tour-done", "1");
    } catch {}
  };
  if (step === null) return null;
  const s = STEPS[step];
  return (
    <div className="pointer-events-auto fixed inset-0 z-[55] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
      <div className="anim-up w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-panel shadow-2xl">
        <div className="flex items-center gap-3 bg-gradient-to-r from-[#13263f] to-[#2b5a8f] px-5 py-4 text-white">
          <Logo size={36} />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-sky-200">
              Step {step + 1} of {STEPS.length}
            </div>
            <div className="text-base font-semibold">{s.title}</div>
          </div>
        </div>
        <p className="px-5 py-4 text-sm leading-relaxed text-slate-600">{s.body}</p>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-navy" : "w-1.5 bg-slate-200")} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={finish}>
              Skip
            </Button>
            <Button size="sm" onClick={() => (step + 1 < STEPS.length ? setStep(step + 1) : finish())}>
              {step + 1 < STEPS.length ? (
                <>
                  Next <ChevronRight />
                </>
              ) : (
                "Let's go"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourButton() {
  return (
    <button
      title="Show the tour again"
      onClick={() => window.dispatchEvent(new Event("ov:tour"))}
      className="pointer-events-auto absolute bottom-3 left-3 z-20 grid h-10 w-10 place-items-center rounded-xl border border-panel/70 bg-panel/90 text-slate-600 shadow-lg backdrop-blur hover:bg-slate-100"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
