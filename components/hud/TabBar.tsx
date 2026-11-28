"use client";

import { useUrgentGlow } from "@/lib/motion";
import { useState } from "react";
import { Boxes, Building2, Megaphone, Music2, CalendarPlus, Hammer, Layers, LayoutDashboard, Lightbulb, MoreHorizontal, Package, Settings, Tag, UserPlus, Users, X } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { useTouchLayout } from "@/lib/hooks/useTouchLayout";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { startDance } from "@/lib/office/dance";

const LIGHT_CYCLE = ["auto", "day", "evening", "night"] as const;
const WALL_CYCLE = ["cutaway", "full", "hidden"] as const;
const WALL_LABEL = { cutaway: "Cut-away", full: "Walls up", hidden: "Walls down" } as const;

/** Bottom tab bar for iPad / phone: the five things used most, with big touch targets. */
export function TabBar() {
  const touch = useTouchLayout();
  const ui = useUI();
  const settings = useOffice((s) => s.settings);
  const update = useOffice((s) => s.updateSettings);
  const live = useLive((s) => s.summary);
  const role = useLive((s) => s.status?.role);
  const [more, setMore] = useState(false);
  const glow = useUrgentGlow(live?.toPack.urgent ?? 0);
  const { t } = useT();
  if (!touch) return null;
  const parcels = live ? live.toPack.readyToShip + live.toPack.processed : 0;
  const active = ui.dialog === "fulfil" ? "pack" : ui.dialog === "dashboard" ? (ui.dashboardTab === "team" ? "team" : "dash") : more ? "more" : "office";
  const tab = (id: string, label: string, icon: React.ReactNode, onClick: () => void, badge?: number) => (
    <button
      key={id}
      onClick={onClick}
      className={cn(id === "pack" && glow, "relative flex h-14 min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition [&_svg]:h-5 [&_svg]:w-5", active === id ? "bg-navy text-white" : "text-slate-600 active:bg-slate-100")}
      aria-label={label}
    >
      {icon}
      {label}
      {!!badge && <span className="absolute right-2 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
  const close = () => setMore(false);
  const sheetItem = (label: string, icon: React.ReactNode, onClick: () => void, on?: boolean) => (
    <button
      key={label}
      onClick={() => {
        onClick();
      }}
      className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-medium [&_svg]:h-5 [&_svg]:w-5", on ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 text-slate-700 active:bg-slate-100")}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      {more && (
        <div className="pointer-events-auto absolute inset-0 z-40 bg-slate-950/20" onClick={close}>
          <div
            className="anim-up absolute inset-x-3 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-panel p-3 shadow-2xl"
            style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center text-xs font-semibold text-slate-700">
              {t("More")}
              <button onClick={close} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-500 active:bg-slate-100" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {sheetItem(`💡 ${t(settings.lighting[0].toUpperCase() + settings.lighting.slice(1))}`, <Lightbulb />, () => update({ lighting: LIGHT_CYCLE[(LIGHT_CYCLE.indexOf(settings.lighting as (typeof LIGHT_CYCLE)[number]) + 1) % 4] }))}
              {sheetItem(t(WALL_LABEL[settings.walls as keyof typeof WALL_LABEL] ?? "Walls"), <Layers />, () => update({ walls: WALL_CYCLE[(WALL_CYCLE.indexOf(settings.walls as (typeof WALL_CYCLE)[number]) + 1) % 3] }))}
              {sheetItem(t("Name tags"), <Tag />, () => update({ showNameTags: !settings.showNameTags }), settings.showNameTags)}
              {sheetItem(t(ui.mode === "build" ? "Build: on" : "Build mode"), <Hammer />, () => ui.set({ mode: ui.mode === "build" ? "live" : "build", selectedEmployeeId: null, selectedFurnitureId: null }), ui.mode === "build")}
              {sheetItem(t("Meeting"), <CalendarPlus />, () => {
                close();
                ui.set({ dialog: "meeting-call" });
              })}
              {sheetItem(t("Hire"), <UserPlus />, () => {
                close();
                ui.set({ dialog: "hire" });
              })}
              {sheetItem(t("Dance break"), <Music2 />, () => {
                close();
                startDance();
              })}
              {sheetItem(t("Marketing"), <Megaphone />, () => {
                close();
                ui.set({ dialog: "marketing" });
              })}
              {sheetItem(t("Stock"), <Boxes />, () => {
                close();
                ui.set({ dialog: "stock" });
              })}
              {sheetItem(t("Settings"), <Settings />, () => {
                close();
                ui.set({ dialog: "settings" });
              })}
            </div>
          </div>
        </div>
      )}
      <nav
        className="pointer-events-auto absolute inset-x-3 z-40 mx-auto flex max-w-2xl gap-1 rounded-2xl border border-panel/70 bg-panel/95 p-1 shadow-xl backdrop-blur"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {tab("office", t("Office"), <Building2 />, () => {
          close();
          ui.set({ dialog: null, selectedEmployeeId: null, notificationsOpen: false });
        })}
        {role === "owner" &&
          tab(
            "pack",
            t("Packing"),
            <Package />,
            () => {
              close();
              ui.set({ dialog: "fulfil", fulfilStage: live && live.toPack.readyToShip && !settings.autoArrange?.enabled ? "process" : "ship" });
            },
            parcels,
          )}
        {tab("dash", t("Dashboard"), <LayoutDashboard />, () => {
          close();
          ui.set({ dialog: "dashboard", dashboardTab: "overview" });
        })}
        {tab("team", t("Team"), <Users />, () => {
          close();
          ui.set({ dialog: "dashboard", dashboardTab: "team" });
        })}
        {tab("more", t("More"), <MoreHorizontal />, () => setMore((m) => !m))}
      </nav>
    </>
  );
}
