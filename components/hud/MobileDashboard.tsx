"use client";

import { useMemo } from "react";
import { Box, CalendarPlus, LayoutDashboard, Settings } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "./Avatar";
import { Logo } from "./Extras";
import { StatusBadge } from "./EmployeePanel";

/** Simplified layout for phones, where the full 3D office is too heavy. */
export function MobileDashboard({ onOpen3D }: { onOpen3D: () => void }) {
  const all = useOffice((s) => s.employees);
  const employees = useMemo(() => all.filter((e) => e.active), [all]);
  const demo = useOffice((s) => s.settings.demoMode);
  const pending = useOffice((s) => s.tasks.filter((t) => t.status === "queued").length);
  const unread = useOffice((s) => s.notifications.filter((n) => !n.read).length);
  const set = useUI((s) => s.set);
  return (
    <div className="h-dvh overflow-y-auto bg-slate-50 pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-panel px-4 py-3">
        <Logo size={32} />
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold">OfficeVerse</div>
          <div className="text-[10px] text-slate-500">Mobile dashboard</div>
        </div>
        {demo && <Badge variant="demo">DEMO</Badge>}
        <Button variant="ghost" size="icon" onClick={() => set({ dialog: "settings" })} aria-label="Settings">
          <Settings />
        </Button>
      </header>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Team" value={employees.length} />
          <Tile label="Queued tasks" value={pending} />
          <Tile label="Unread alerts" value={unread} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => set({ dialog: "dashboard", dashboardTab: "overview" })}>
            <LayoutDashboard /> Dashboard
          </Button>
          <Button variant="outline" onClick={() => set({ dialog: "meeting-call" })}>
            <CalendarPlus /> Meeting
          </Button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-panel">
          {employees.map((e) => (
            <button key={e.id} onClick={() => set({ selectedEmployeeId: e.id })} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0">
              <Avatar id={e.id} appearance={e.appearance} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{e.name}</span>
                <span className="block truncate text-xs text-slate-500">{e.title}</span>
              </span>
              <StatusBadge status={e.status} />
            </button>
          ))}
        </div>
        <Button variant="secondary" className="w-full" onClick={onOpen3D}>
          <Box /> Open the 3D office anyway
        </Button>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-panel p-3 text-center">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
