"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CalendarPlus,
  CheckCircle2,
  Hammer,
  Info,
  LayoutDashboard,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  RotateCw,
  Scan,
  Settings,
  Tag,
  UserPlus,
  Users,
  XCircle,
  Moon,
  Sun,
  Sunset,
  Clock,
  Layers,
} from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { CATALOG } from "@/lib/office/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, klTime, timeAgo } from "@/lib/utils";
import type { LightingMode, WallMode } from "@/lib/data/types";
import { PriorityDot } from "./ExecutiveDashboard";

function Clock24() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="hidden items-center gap-1 text-xs tabular-nums text-slate-600 md:flex" title="Malaysia time (Asia/Kuala_Lumpur)">
      <Clock className="h-3.5 w-3.5" />
      {klTime(now, { weekday: "short", hour: "2-digit", minute: "2-digit" })} MYT
    </span>
  );
}

const LIGHT_CYCLE: LightingMode[] = ["day", "evening", "night", "auto"];
const WALL_CYCLE: WallMode[] = ["cutaway", "full", "hidden"];
const LIGHT_ICON = { day: <Sun />, evening: <Sunset />, night: <Moon />, auto: <Clock /> };
const WALL_LABEL = { cutaway: "Cut-away", full: "Walls up", hidden: "Walls down" };

export function TopBar({ authLabel }: { authLabel?: React.ReactNode }) {
  const settings = useOffice((s) => s.settings);
  const update = useOffice((s) => s.updateSettings);
  const unread = useOffice((s) => s.notifications.filter((n) => !n.read).length);
  const companies = useOffice((s) => s.companies);
  const ui = useUI();
  return (
    <header className="pointer-events-auto absolute inset-x-3 top-3 z-40 flex h-12 items-center gap-2 rounded-2xl border border-white/70 bg-white/90 px-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-navy text-sm font-bold text-white">OV</div>
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-semibold text-slate-900">OfficeVerse</div>
          <div className="text-[10px] text-slate-500">Your Business. Your People. Your Universe.</div>
        </div>
      </div>
      <select
        value={ui.companyFilter}
        onChange={(e) => ui.set({ companyFilter: e.target.value })}
        className="hidden h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 md:block"
        aria-label="Company"
      >
        <option value="all">All companies</option>
        {companies
          .filter((c) => c.active)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
      </select>
      {settings.demoMode ? (
        <Badge variant="demo" title="Business metrics shown are labelled sample data">
          DEMO MODE
        </Badge>
      ) : (
        <Badge variant="outline">LIVE · no integrations</Badge>
      )}
      {ui.mode === "build" && <Badge variant="warning">BUILD MODE</Badge>}
      <div className="ml-auto flex items-center gap-1">
        <Clock24 />
        <Button
          variant="ghost"
          size="sm"
          title="Lighting"
          onClick={() => update({ lighting: LIGHT_CYCLE[(LIGHT_CYCLE.indexOf(settings.lighting) + 1) % LIGHT_CYCLE.length] })}
        >
          {LIGHT_ICON[settings.lighting]}
          <span className="hidden capitalize lg:inline">{settings.lighting}</span>
        </Button>
        <Button variant="ghost" size="sm" title="Walls" onClick={() => update({ walls: WALL_CYCLE[(WALL_CYCLE.indexOf(settings.walls) + 1) % WALL_CYCLE.length] })}>
          <Layers />
          <span className="hidden lg:inline">{WALL_LABEL[settings.walls]}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Name tags"
          className={settings.showNameTags ? "bg-slate-100" : ""}
          onClick={() => update({ showNameTags: !settings.showNameTags })}
        >
          <Tag />
        </Button>
        <div className="relative">
          <Button variant="ghost" size="icon" title="Notifications" onClick={() => ui.set({ notificationsOpen: !ui.notificationsOpen })}>
            <Bell />
          </Button>
          {unread > 0 && (
            <span className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </div>
        <Button size="sm" onClick={() => ui.set({ dialog: "dashboard", dashboardTab: "overview" })}>
          <LayoutDashboard />
          <span className="hidden sm:inline">Dashboard</span>
        </Button>
        <Button variant="ghost" size="icon" title="Settings" onClick={() => ui.set({ dialog: "settings" })}>
          <Settings />
        </Button>
        {authLabel}
      </div>
    </header>
  );
}

export function NotificationsPanel() {
  const open = useUI((s) => s.notificationsOpen);
  const set = useUI((s) => s.set);
  const list = useOffice((s) => s.notifications);
  const markRead = useOffice((s) => s.markRead);
  const markAll = useOffice((s) => s.markAllRead);
  const clear = useOffice((s) => s.clearNotifications);
  const employees = useOffice((s) => s.employees);
  if (!open) return null;
  return (
    <div className="anim-up pointer-events-auto absolute right-3 top-[68px] z-50 w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-sm font-semibold">Notifications</span>
        <div className="flex gap-2 text-[11px]">
          <button className="text-sky-700 hover:underline" onClick={markAll}>
            Mark all read
          </button>
          <button className="text-slate-500 hover:underline" onClick={clear}>
            Clear
          </button>
        </div>
      </div>
      <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
        {list.length ? (
          list.map((n) => {
            const emp = employees.find((e) => e.id === n.employeeId);
            return (
              <button
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  if (emp) set({ selectedEmployeeId: emp.id, notificationsOpen: false });
                }}
                className={cn("block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !n.read && "bg-sky-50/50")}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <PriorityDot p={n.priority} />
                  <span className="flex-1">{n.title}</span>
                  {n.demo && <Badge variant="demo">DEMO</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{n.body}</p>
                <div className="mt-1 text-[10px] text-slate-400">
                  {emp ? `${emp.name} · ` : ""}
                  {timeAgo(n.createdAt)}
                </div>
              </button>
            );
          })
        ) : (
          <p className="p-6 text-center text-xs text-slate-400">You&apos;re all caught up.</p>
        )}
      </div>
    </div>
  );
}

export function Toolbar() {
  const ui = useUI();
  const live = useOffice((s) => s.meetings.some((m) => m.status === "in_progress"));
  const items: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean }[] = [
    { icon: <MousePointer2 />, label: "Live mode — click floor to walk", active: ui.mode === "live", onClick: () => ui.set({ mode: "live", selectedFurnitureId: null }) },
    { icon: <Hammer />, label: "Build mode — move furniture", active: ui.mode === "build", onClick: () => ui.set({ mode: "build", selectedEmployeeId: null }) },
    { icon: <CalendarPlus />, label: live ? "Meeting in progress" : "Call a meeting", onClick: () => ui.set({ dialog: "meeting-call" }), disabled: live },
    { icon: <UserPlus />, label: "Hire AI employee", onClick: () => ui.set({ dialog: "hire" }) },
    { icon: <Users />, label: "Team directory", onClick: () => ui.set({ dialog: "dashboard", dashboardTab: "team" }) },
  ];
  return (
    <nav className="pointer-events-auto absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-white/70 bg-white/90 p-1.5 shadow-lg backdrop-blur">
      {items.map((it, i) => (
        <button
          key={i}
          title={it.label}
          aria-label={it.label}
          disabled={it.disabled}
          onClick={it.onClick}
          className={cn(
            "group relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 [&_svg]:h-[18px] [&_svg]:w-[18px]",
            it.active && "bg-navy text-white hover:bg-navy",
          )}
        >
          {it.icon}
          <span className="pointer-events-none absolute left-12 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white opacity-0 shadow transition group-hover:opacity-100">
            {it.label}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function CameraControls() {
  const camera = useUI((s) => s.camera);
  const btn = "grid h-9 w-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 [&_svg]:h-4 [&_svg]:w-4";
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-2xl border border-white/70 bg-white/90 p-1 shadow-lg backdrop-blur">
      <button className={btn} title="Rotate left (Q)" onClick={() => camera({ kind: "rotate", dir: -1 })}>
        <RotateCcw />
      </button>
      <button className={btn} title="Rotate right (E)" onClick={() => camera({ kind: "rotate", dir: 1 })}>
        <RotateCw />
      </button>
      <button className={btn} title="Zoom out (-)" onClick={() => camera({ kind: "zoom", dir: -1 })}>
        <Minus />
      </button>
      <button className={btn} title="Zoom in (+)" onClick={() => camera({ kind: "zoom", dir: 1 })}>
        <Plus />
      </button>
      <button className={btn} title="Reset view" onClick={() => camera({ kind: "reset" })}>
        <Scan />
      </button>
    </div>
  );
}

export function HelpHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("ov:hint-dismissed")) setShow(false);
    } catch {}
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 hidden max-w-xs rounded-2xl border border-white/70 bg-white/90 p-3 text-[11px] leading-relaxed text-slate-600 shadow-lg backdrop-blur md:block">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
        <Info className="h-3.5 w-3.5" /> Getting around
      </div>
      <b>Click</b> the floor to walk · <b>click</b> an employee to open their profile · <b>drag</b> an employee to pick them up · <b>click your desk</b> for the
      dashboard · <b>left-drag</b> pans · <b>right-drag</b> rotates · <b>scroll</b> zooms · <b>Q/E</b> rotate · <b>WASD</b> pan
      <button
        className="mt-1.5 block text-sky-700 hover:underline"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem("ov:hint-dismissed", "1");
          } catch {}
        }}
      >
        Got it
      </button>
    </div>
  );
}

export function BuildPanel() {
  const mode = useUI((s) => s.mode);
  const selected = useUI((s) => s.selectedFurnitureId);
  const set = useUI((s) => s.set);
  const item = useOffice((s) => s.furniture.find((f) => f.id === selected));
  const move = useOffice((s) => s.moveFurniture);
  const reset = useOffice((s) => s.resetLayout);
  const toast = useUI((s) => s.toast);
  if (mode !== "build") return null;
  return (
    <div className="anim-up pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-amber-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
      <Hammer className="h-4 w-4 text-amber-600" />
      <span className="text-xs text-slate-700">
        {item ? (
          <>
            <b>{CATALOG[item.type].label}</b> selected — drag to move, <b>R</b> to rotate
          </>
        ) : (
          "Build mode: drag furniture to rearrange. Employees re-route automatically."
        )}
      </span>
      {item && (
        <Button size="sm" variant="outline" onClick={() => move(item.id, item.x, item.z, (item.rot + Math.PI / 2) % (Math.PI * 2))}>
          <RotateCw /> Rotate
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => (reset(), toast("success", "Layout reset"))}>
        Reset layout
      </Button>
      <Button size="sm" onClick={() => set({ mode: "live", selectedFurnitureId: null })}>
        Done
      </Button>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed left-1/2 top-[72px] z-[60] flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "anim-up pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium shadow-lg",
            t.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : t.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700",
          )}
        >
          {t.kind === "error" ? <XCircle className="h-4 w-4 shrink-0" /> : t.kind === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          {t.text}
        </button>
      ))}
    </div>
  );
}
