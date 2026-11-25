"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useMusic } from "@/lib/audio/music";
import { openWelcome } from "./WelcomeBrief";
import { openMarketing } from "./MarketingStudio";
import { startDance } from "@/lib/office/dance";
import { cn } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  keywords?: string;
  run: () => void;
}

/** Open the quick-action menu from anywhere (e.g. the search button in the top bar). */
export const openCommandPalette = () => window.dispatchEvent(new Event("ov:cmdk"));

/** ⌘K / Ctrl+K: type to jump anywhere or do something. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const employees = useOffice((s) => s.employees);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ov:cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ov:cmdk", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const ui = () => useUI.getState();
    const office = () => useOffice.getState();
    const base: Cmd[] = [
      { id: "dash", label: "Dashboard", hint: "Sales, parcels, ads, profit", keywords: "overview sales revenue", run: () => ui().set({ dialog: "dashboard", dashboardTab: "overview" }) },
      { id: "process", label: "Arrange drop-off", hint: "Orders to process", keywords: "confirm orders to process farid", run: () => ui().set({ dialog: "fulfil", fulfilStage: "process" }) },
      { id: "labels", label: "Print airway bills", hint: "To ship → print labels", keywords: "awb labels print to ship packing", run: () => ui().set({ dialog: "fulfil", fulfilStage: "ship" }) },
      { id: "purchases", label: "Order history", hint: "Past orders, product totals, Excel download", keywords: "purchase list orders bought items history record stock export csv excel farid", run: () => ui().set({ dialog: "purchases" }) },
      { id: "stock", label: "Stock", hint: "Counts, days left, pack names", keywords: "inventory restock pack names", run: () => ui().set({ dialog: "stock" }) },
      { id: "approvals", label: "Approvals", hint: "Cancellations, review replies, team requests", keywords: "approve review cancel", run: () => ui().set({ dialog: "dashboard", dashboardTab: "approvals" }) },
      { id: "org", label: "Org chart", hint: "Who's who, with photos", keywords: "organisation organization chart structure staff photos", run: () => ui().set({ dialog: "dashboard", dashboardTab: "org" }) },
      { id: "team", label: "Team & scorecards", hint: "Everyone's work this month", keywords: "staff employees scorecards", run: () => ui().set({ dialog: "dashboard", dashboardTab: "team" }) },
      { id: "glance", label: "Today at a glance", hint: "Parcels, sales, alerts", keywords: "welcome summary today", run: () => openWelcome() },
      { id: "subtitles", label: "Subtitle Studio", hint: "Lina translates, Adam checks", keywords: "translate srt cip amare", run: () => ui().set({ dialog: "subtitles" }) },
      { id: "listing", label: "Write a product listing", hint: "Hafiz · English & Malay", keywords: "marketing title description keywords seo shopee lazada", run: () => openMarketing("listing") },
      { id: "reply", label: "Draft a buyer reply", hint: "Mei Ling · chat answers", keywords: "customer chat message answer question", run: () => openMarketing("reply") },
      { id: "campaign", label: "Sale campaigns", hint: "11.11, Raya, payday… with plans", keywords: "campaign festive 11.11 12.12 raya cny voucher calendar", run: () => openMarketing("campaign") },
      { id: "dance", label: "Dance break 💃", hint: "Everyone dances for a few seconds", keywords: "dance party fun celebrate", run: () => startDance() },
      { id: "meeting", label: "Call a meeting", hint: "Gather staff in the boardroom", run: () => ui().set({ dialog: "meeting-call" }) },
      { id: "hire", label: "Hire an AI employee", hint: "Add someone to the team", run: () => ui().set({ dialog: "hire" }) },
      { id: "settings", label: "Settings", hint: "Integrations, system health, app & notifications", keywords: "health telegram notifications install", run: () => ui().set({ dialog: "settings" }) },
      { id: "music", label: useMusic.getState().playing ? "Pause music" : "Play music", hint: "Background music", keywords: "music lofi jazz", run: () => void useMusic.getState().toggle() },
      { id: "light", label: "Lighting: follow Malaysia time", hint: "Day / evening / night by the clock", keywords: "auto night day", run: () => office().updateSettings({ lighting: "auto" }) },
      { id: "night", label: "Lighting: night", hint: "", run: () => office().updateSettings({ lighting: "night" }) },
      { id: "walls", label: "Walls: cycle", hint: "Cut-away · up · down", run: () => office().updateSettings({ walls: ({ cutaway: "full", full: "hidden", hidden: "cutaway" } as const)[office().settings.walls] }) },
      { id: "fly-ceo", label: "Go to: CEO suite", hint: "Camera", run: () => ui().camera({ kind: "focus", x: 46, z: 5.5, zoom: 40 }) },
      { id: "fly-work", label: "Go to: work floor", hint: "Camera", run: () => ui().camera({ kind: "focus", x: 15.5, z: 5.5, zoom: 26 }) },
      { id: "fly-fun", label: "Go to: pantry & game room", hint: "Camera", run: () => ui().camera({ kind: "focus", x: 19, z: 21, zoom: 26 }) },
      { id: "home", label: "Back to start view", hint: "Camera", run: () => ui().camera({ kind: "reset" }) },
    ];
    const people = employees
      .filter((e) => e.active)
      .map<Cmd>((e) => ({ id: `emp-${e.id}`, label: `Chat with ${e.name}`, hint: e.title, keywords: e.title, run: () => ui().set({ selectedEmployeeId: e.id }) }));
    return [...base, ...people];
  }, [employees, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return commands.slice(0, 12);
    return commands.filter((c) => words.every((w) => `${c.label} ${c.hint} ${c.keywords ?? ""}`.toLowerCase().includes(w))).slice(0, 12);
  }, [q, commands]);

  if (!open) return null;
  const go = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    // after this key press / click has finished, so it doesn't land on the window that opens
    setTimeout(() => c.run(), 60);
  };
  return (
    <div className="fixed inset-0 z-[65] bg-slate-950/40 p-4 pt-[12vh] backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quick actions">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(list.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(list[sel]);
              }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Type to jump: print labels, stock, Farid, music…"
            className="h-12 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden rounded border border-slate-200 px-1.5 text-[10px] text-slate-400 sm:block">esc</kbd>
        </div>
        <div className="scrollbar-thin max-h-[50vh] overflow-y-auto p-1">
          {!list.length && <p className="p-4 text-center text-xs text-slate-500">Nothing matches “{q}”.</p>}
          {list.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(c)}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === sel ? "bg-sky-50" : "")}
            >
              <span className="text-sm font-medium text-slate-800">{c.label}</span>
              {c.hint && <span className="ml-auto truncate text-[11px] text-slate-400">{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
