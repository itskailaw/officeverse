"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Boxes,
  CalendarPlus,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Network,
  Package,
  PackagePlus,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { formatMYR } from "@/lib/data/demo";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "./Avatar";
import { Logo } from "./Extras";
import { StatusBadge } from "./EmployeePanel";
import { openWelcome } from "./WelcomeBrief";
import { useT } from "@/lib/i18n";
import { openCommandPalette } from "./CommandPalette";

/** Lite view: the quick, no-3D version for phones (and anyone who switches to it). */
export function MobileDashboard({ onOpen3D }: { onOpen3D: () => void }) {
  const all = useOffice((s) => s.employees);
  const employees = useMemo(() => all.filter((e) => e.active), [all]);
  const demo = useOffice((s) => s.settings.demoMode);
  const ceoName = useOffice((s) => s.settings.ceoName);
  const approvalsAll = useOffice((s) => s.approvals);
  const notifications = useOffice((s) => s.notifications);
  const pendingApprovals = useMemo(() => approvalsAll.filter((a) => a.status === "pending").length, [approvalsAll]);
  const unread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const live = useLive((s) => s.summary);
  const role = useLive((s) => s.status?.role);
  const owner = role === "owner";
  const set = useUI((s) => s.set);
  const [q, setQ] = useState("");
  const { t, lang } = useT();

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greet = t(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  const toPack = live ? live.toPack.readyToShip + live.toPack.processed : null;
  const urgent = live?.toPack.urgent ?? 0;
  const people = employees.filter((e) => !q.trim() || `${e.name} ${e.title}`.toLowerCase().includes(q.trim().toLowerCase()));

  const actions: { label: string; icon: React.ReactNode; onClick: () => void; badge?: number; show?: boolean; tone?: string }[] = [
    { label: t("Packing"), icon: <Package />, onClick: () => set({ dialog: "fulfil", fulfilStage: live?.toPack.readyToShip ? "process" : "ship" }), badge: toPack ?? undefined, show: owner, tone: "bg-sky-500" },
    { label: t("Approvals"), icon: <CheckSquare />, onClick: () => set({ dialog: "dashboard", dashboardTab: "approvals" }), badge: pendingApprovals, tone: "bg-amber-500" },
    { label: t("Dashboard"), icon: <LayoutDashboard />, onClick: () => set({ dialog: "dashboard", dashboardTab: "overview" }), tone: "bg-indigo-500" },
    { label: t("Order history"), icon: <ClipboardList />, onClick: () => set({ dialog: "purchases" }), show: owner, tone: "bg-emerald-500" },
    { label: t("Stock"), icon: <Boxes />, onClick: () => set({ dialog: "stock" }), tone: "bg-teal-500" },
    { label: t("Stock in"), icon: <PackagePlus />, onClick: () => { try { sessionStorage.setItem("ov:stock-section", "in"); } catch {} set({ dialog: "stock" }); }, tone: "bg-cyan-600" },
    { label: t("Marketing"), icon: <Megaphone />, onClick: () => set({ dialog: "marketing" }), tone: "bg-pink-500" },
    { label: t("Today"), icon: <Sun />, onClick: () => openWelcome(), badge: unread, tone: "bg-orange-500" },
    { label: t("Org chart"), icon: <Network />, onClick: () => set({ dialog: "dashboard", dashboardTab: "org" }), tone: "bg-violet-500" },
    { label: t("Meeting"), icon: <CalendarPlus />, onClick: () => set({ dialog: "meeting-call" }), tone: "bg-slate-500" },
  ];

  return (
    <div className="h-dvh overflow-y-auto bg-slate-50 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-panel/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
        <Logo size={32} />
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold text-slate-900">OfficeVerse</div>
          <div className="text-[10px] text-slate-500">{t("Lite")}</div>
        </div>
        {demo && <Badge variant="demo">DEMO</Badge>}
        <button onClick={() => openCommandPalette()} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 active:bg-slate-100" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
        <button onClick={() => set({ dialog: "settings" })} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 active:bg-slate-100" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </button>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <div className="text-lg font-bold text-slate-900">
            {greet}, {ceoName?.split(" ")[0] || t("Boss")} 👋
          </div>
          <div className="text-xs text-slate-500">{new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kuala_Lumpur" })}</div>
        </div>

        {/* today at a glance */}
        <div className="grid grid-cols-3 gap-2">
          <Tile label={t("Sales today")} value={live ? formatMYR(live.today.revenue) : "—"} />
          <Tile label={t("Orders today")} value={live ? String(live.today.orders) : "—"} />
          <Tile label={t("To pack")} value={toPack === null ? "—" : String(toPack)} warn={urgent > 0} />
        </div>
        {urgent > 0 && owner && (
          <button onClick={() => set({ dialog: "fulfil", fulfilStage: "ship" })} className="w-full rounded-xl bg-red-50 px-3 py-2 text-left text-xs font-semibold text-red-800 ring-1 ring-red-200">
            🔴 {urgent} parcel{urgent > 1 ? "s" : ""} {t("must ship soon — open Packing →")}
          </button>
        )}
        {pendingApprovals > 0 && (
          <button onClick={() => set({ dialog: "dashboard", dashboardTab: "approvals" })} className="w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
            ✋ {pendingApprovals} {t("waiting for your approval →")}
          </button>
        )}

        {/* shortcuts */}
        <div className="grid grid-cols-4 gap-2">
          {actions
            .filter((a) => a.show !== false)
            .map((a) => (
              <button key={a.label} onClick={a.onClick} className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-panel p-2.5 text-[11px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 active:scale-95">
                <span className={`grid h-10 w-10 place-items-center rounded-xl text-white ${a.tone ?? "bg-slate-500"} [&_svg]:h-5 [&_svg]:w-5`}>{a.icon}</span>
                <span className="text-center leading-tight">{a.label}</span>
                {!!a.badge && <span className="absolute right-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{a.badge > 99 ? "99+" : a.badge}</span>}
              </button>
            ))}
        </div>

        {/* team */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">{t("Your team")}</div>
            <span className="text-xs text-slate-500">{employees.length}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find someone")} className="ml-auto h-8 w-36 rounded-lg border border-slate-200 bg-panel px-2 text-xs text-slate-800" />
          </div>
          <div className="overflow-hidden rounded-2xl bg-panel ring-1 ring-slate-200">
            {people.map((e) => (
              <button key={e.id} onClick={() => set({ selectedEmployeeId: e.id })} className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 active:bg-slate-50">
                <Avatar id={e.id} appearance={e.appearance} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{e.name}</span>
                  <span className="block truncate text-xs text-slate-500">{e.title}</span>
                </span>
                <StatusBadge status={e.status} />
                <MessageSquare className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        </div>

        <button onClick={onOpen3D} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-200/70 py-3 text-xs font-medium text-slate-700 active:bg-slate-300/70">
          <Box className="h-4 w-4" /> {t("Open the full 3D office")}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 text-center shadow-sm ring-1 ${warn ? "bg-red-50 ring-red-200" : "bg-panel ring-slate-200"}`}>
      <div className={`truncate text-lg font-bold ${warn ? "text-red-700" : "text-slate-900"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
