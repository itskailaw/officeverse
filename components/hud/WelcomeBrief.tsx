"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckSquare, Megaphone, Package, PackageCheck, RotateCcw, TrendingDown, TrendingUp, X } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { demoEcommerce, formatMYR } from "@/lib/data/demo";
import { festiveTheme } from "@/lib/office/festive";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEEN_KEY = "ov:welcome-seen"; // sessionStorage: once per sign-in session
const PREF_KEY = "ov:welcome-off"; // localStorage: "don't show when I sign in"
const LAST_VISIT = "ov:last-visit";
const SHOWN_KEY = "ov:welcome-shown-at"; // localStorage: when it was last shown

/** Open the pop-up from anywhere (e.g. the clock in the top bar). */
export const openWelcome = () => window.dispatchEvent(new Event("ov:open-welcome"));

const FESTIVE: Record<string, string> = { raya: "Selamat Hari Raya! 🌙", cny: "Gong Xi Fa Cai! 🧧", deepavali: "Happy Deepavali! 🪔", kobe: "Happy Kobe Day — Mamba mentality 🐍" };

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(now));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

interface Brief {
  live: boolean;
  toProcess: number;
  toShip: number;
  urgent: number;
  perPlatform: { p: "shopee" | "lazada"; process: number; ship: number }[];
  today: number;
  todayOrders: number;
  yesterday: number;
  mtd: number;
  returnsOpen: number;
  cancelledToday: number;
  adsLow: number | null;
}

function briefFrom(summary: ReturnType<typeof useLive.getState>["summary"], demo: boolean): Brief | null {
  if (summary) {
    const per = (["shopee", "lazada"] as const)
      .filter((p) => summary.platforms[p]?.connected)
      .map((p) => ({ p, process: summary.byPlatform?.[p]?.toPack.readyToShip ?? 0, ship: summary.byPlatform?.[p]?.toPack.processed ?? 0 }));
    const bal = summary.ads.shopee?.balance;
    return {
      live: true,
      toProcess: summary.toPack.readyToShip,
      toShip: summary.toPack.processed,
      urgent: summary.toPack.urgent,
      perPlatform: per,
      today: summary.today.revenue,
      todayOrders: summary.today.orders,
      yesterday: summary.yesterday.revenue,
      mtd: summary.monthToDate.revenue,
      returnsOpen: summary.returns?.open ?? 0,
      cancelledToday: summary.cancelledToday,
      adsLow: bal != null && bal < 50 ? bal : null,
    };
  }
  if (!demo) return null;
  const d = demoEcommerce();
  return {
    live: false,
    toProcess: d.parcels.shopee,
    toShip: d.parcels.lazada,
    urgent: 1,
    perPlatform: [
      { p: "shopee", process: d.parcels.shopee, ship: 0 },
      { p: "lazada", process: 0, ship: d.parcels.lazada },
    ],
    today: d.today.shopee + d.today.lazada,
    todayOrders: 0,
    yesterday: d.days[d.days.length - 2].shopee + d.days[d.days.length - 2].lazada,
    mtd: d.mtd,
    returnsOpen: 0,
    cancelledToday: 0,
    adsLow: null,
  };
}

/** Pop-up when the CEO signs in: parcels to pack and a short daily update. */
export function WelcomeBrief() {
  const summary = useLive((s) => s.summary);
  const settings = useOffice((s) => s.settings);
  const allApprovals = useOffice((s) => s.approvals);
  const tasks = useOffice((s) => s.tasks);
  const dialog = useUI((s) => s.dialog);
  const [open, setOpen] = useState(false);
  const [lastVisit, setLastVisit] = useState<number | null>(null);
  const [off, setOff] = useState(false);
  const mountedAt = useRef(Date.now());

  // show on sign-in: first open of the day, or 3+ hours since it was last shown — never over the tour or another window
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    const manual = () => setOpen(true);
    window.addEventListener("ov:open-welcome", manual);
    // the installed app often stays open in the background: coming back after 3+ hours counts as opening it again
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 3 * 3600_000) {
        try {
          sessionStorage.removeItem(SEEN_KEY);
        } catch {}
        mountedAt.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener("ov:open-welcome", manual);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  useEffect(() => {
    if (open) return;
    let due = false;
    try {
      setOff(localStorage.getItem(PREF_KEY) === "1");
      const lv = Number(localStorage.getItem(LAST_VISIT));
      if (lv && !lastVisit) setLastVisit(lv);
      // every sign-in / fresh open of OfficeVerse (once per open — not on every window you close)
      due =
        localStorage.getItem(PREF_KEY) !== "1" &&
        !sessionStorage.getItem(SEEN_KEY) &&
        !!localStorage.getItem("ov:tour-done"); // the first-visit tour goes first; we show right after it
    } catch {
      due = false;
    }
    if (!due || dialog) return; // wait for any open window to close
    // show as soon as the marketplace summary has loaded; otherwise after a short wait (demo mode / not connected)
    const startedAt = mountedAt.current;
    const wait = summary ? 800 : settings.demoMode ? 2500 : 4000;
    if (Date.now() - startedAt < wait) return; // checked again on the next tick
    setOpen(true);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
      localStorage.setItem(SHOWN_KEY, String(Date.now()));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, settings.demoMode, dialog, tick, open]);
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem(LAST_VISIT, String(Date.now()));
      } catch {}
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, []);
  useEffect(() => {
    if (dialog && open) setOpen(false);
  }, [dialog, open]);

  if (!open) return null;
  const approvals = allApprovals.filter((a) => a.status === "pending");
  const b = briefFrom(summary, settings.demoMode);
  const now = new Date();
  const theme = festiveTheme(now);
  const pack = b ? b.toProcess + b.toShip : 0;
  const since = lastVisit ?? now.getTime() - 24 * 3600_000;
  const doneSince = tasks.filter((t) => t.status === "completed" && Date.parse(t.updatedAt) > since).length;
  const cancels = approvals.filter((a) => a.id.startsWith("cancel-")).length;
  const autoOn = settings.autoArrange?.enabled;
  const go = (patch: Parameters<ReturnType<typeof useUI.getState>["set"]>[0]) => {
    setOpen(false);
    useUI.getState().set(patch);
  };
  const vsYesterday = b && b.yesterday ? (b.today - b.yesterday) / b.yesterday : null;

  const updates: { icon: React.ReactNode; text: string; tone?: "warn" | "bad" }[] = [];
  if (b?.urgent) updates.push({ icon: <AlertTriangle />, text: `${b.urgent} parcel${b.urgent > 1 ? "s" : ""} must ship within 24 hours`, tone: "bad" });
  if (cancels) updates.push({ icon: <AlertTriangle />, text: `${cancels} buyer cancellation request${cancels > 1 ? "s" : ""} waiting for your decision`, tone: "bad" });
  if (approvals.length - cancels > 0) updates.push({ icon: <CheckSquare />, text: `${approvals.length - cancels} approval${approvals.length - cancels > 1 ? "s" : ""} from your team`, tone: "warn" });
  if (b?.adsLow != null) updates.push({ icon: <Megaphone />, text: `Shopee ads balance is low: ${formatMYR(b.adsLow, 2)}`, tone: "warn" });
  if (b?.returnsOpen) updates.push({ icon: <RotateCcw />, text: `${b.returnsOpen} open return / refund request${b.returnsOpen > 1 ? "s" : ""}`, tone: "warn" });
  if (b?.cancelledToday) updates.push({ icon: <X />, text: `${b.cancelledToday} order${b.cancelledToday > 1 ? "s" : ""} cancelled today` });
  if (doneSince) updates.push({ icon: <CheckSquare />, text: `${doneSince} task${doneSince > 1 ? "s" : ""} finished by your team ${lastVisit ? "since your last visit" : "in the last day"}` });

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Today at a glance">
        <div className="relative bg-gradient-to-br from-[#0f1f36] to-[#1e3a5f] px-5 pb-4 pt-5 text-white">
          <button onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <div className="text-[11px] uppercase tracking-wider text-white/60">
            {new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long" }).format(now)}
          </div>
          <div className="mt-0.5 text-lg font-semibold">
            {greeting(now)}, {settings.ceoName?.split(" ")[0] || "Boss"} 👋
          </div>
          {theme && <div className="text-xs text-[#fdb927]">{FESTIVE[theme]}</div>}
          {b && !b.live && <div className="mt-1 inline-block rounded bg-amber-400/90 px-1.5 text-[10px] font-bold text-slate-900">DEMO DATA</div>}
        </div>

        {!b ? (
          <p className="p-5 text-sm text-slate-600">Connect Shopee or Lazada in Settings → Integrations to see your parcels and sales here every time you sign in.</p>
        ) : (
          <div className="space-y-3 p-4">
            {/* parcels */}
            <button
              onClick={() => go({ dialog: "fulfil", fulfilStage: b.toProcess && !autoOn ? "process" : "ship" })}
              className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm", pack ? "border-sky-200 bg-sky-50" : "border-emerald-200 bg-emerald-50")}
            >
              <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white", pack ? "bg-sky-600" : "bg-emerald-600")}>
                {pack ? <Package className="h-6 w-6" /> : <PackageCheck className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-bold leading-none text-slate-900">
                  {pack} <span className="text-sm font-semibold text-slate-600">parcel{pack === 1 ? "" : "s"} to pack</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-600">
                  {pack ? (
                    <>
                      {b.toShip} ready to ship · {b.toProcess} to confirm{b.toProcess ? (autoOn ? " (Farid's on it)" : "") : ""}
                    </>
                  ) : (
                    "All caught up — nothing waiting 🎉"
                  )}
                </div>
                {b.perPlatform.length > 1 && pack > 0 && (
                  <div className="mt-1 flex gap-2 text-[10px] text-slate-500">
                    {b.perPlatform.map((x) => (
                      <span key={x.p} className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.p === "shopee" ? "#eb6834" : "#2a78d6" }} />
                        {x.p === "shopee" ? "Shopee" : "Lazada"} {x.process + x.ship}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {pack > 0 && <ArrowRight className="h-4 w-4 text-sky-700" />}
            </button>

            {/* sales */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Sales today</div>
                <div className="text-base font-semibold text-slate-900">{formatMYR(b.today)}</div>
                <div className={cn("flex items-center gap-1 text-[11px]", vsYesterday == null ? "text-slate-400" : vsYesterday >= 0 ? "text-emerald-700" : "text-slate-500")}>
                  {vsYesterday != null && (vsYesterday >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
                  {b.todayOrders ? `${b.todayOrders} orders · ` : ""}yesterday {formatMYR(b.yesterday)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">This month</div>
                <div className="text-base font-semibold text-slate-900">{formatMYR(b.mtd)}</div>
                <div className="text-[11px] text-slate-500">month to date</div>
              </div>
            </div>

            {/* small updates */}
            {updates.length > 0 ? (
              <ul className="space-y-1">
                {updates.slice(0, 5).map((u, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0",
                      u.tone === "bad" ? "bg-red-50 text-red-800" : u.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-700",
                    )}
                  >
                    {u.icon}
                    {u.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-[11px] text-slate-500">No alerts — a quiet day so far.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <input
              type="checkbox"
              checked={off}
              onChange={(e) => {
                setOff(e.target.checked);
                try {
                  if (e.target.checked) localStorage.setItem(PREF_KEY, "1");
                  else localStorage.removeItem(PREF_KEY);
                } catch {}
              }}
            />
            Don&apos;t show when I sign in
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => go({ dialog: "dashboard", dashboardTab: "overview" })}>
              Dashboard
            </Button>
            {b && pack > 0 ? (
              <Button size="sm" onClick={() => go({ dialog: "fulfil", fulfilStage: b.toProcess && !autoOn ? "process" : "ship" })}>
                Start packing <ArrowRight />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setOpen(false)}>
                Let&apos;s go
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
