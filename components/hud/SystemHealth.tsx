"use client";

import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { CheckCircle2, CircleSlash, Loader2, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { cn, timeAgo } from "@/lib/utils";

type Level = "ok" | "warn" | "bad" | "off";
interface Check {
  key: string;
  area: string;
  label: string;
  level: Level;
  detail: string;
  fix?: string;
}

/** Shared so the top-bar dot and the Settings card use one fetch. */
export const useHealth = create<{ checks: Check[] | null; at: string | null; loading: boolean; error: string | null; load(): Promise<void> }>((set) => ({
  checks: null,
  at: null,
  loading: false,
  error: null,
  async load() {
    set({ loading: true });
    try {
      const r = await fetch("/api/health/system", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      set({ checks: j.checks, at: j.at, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
    set({ loading: false });
  },
}));

const ICON: Record<Level, React.ReactNode> = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  warn: <TriangleAlert className="h-4 w-4 text-amber-600" />,
  bad: <ShieldAlert className="h-4 w-4 text-red-600" />,
  off: <CircleSlash className="h-4 w-4 text-slate-400" />,
};

/** Loads health once for owners and every 10 minutes (drives the red dot on Settings). */
export function useHealthPolling() {
  const role = useLive((s) => s.status?.role);
  useEffect(() => {
    if (role !== "owner") return;
    void useHealth.getState().load();
    const t = setInterval(() => void useHealth.getState().load(), 10 * 60_000);
    return () => clearInterval(t);
  }, [role]);
  const checks = useHealth((s) => s.checks);
  return checks?.some((c) => c.level === "bad") ? "bad" : checks?.some((c) => c.level === "warn") ? "warn" : null;
}

/** Settings → Data & system: everything OfficeVerse depends on, with what to do when something's wrong. */
export function SystemHealthCard() {
  const { checks, at, loading, error, load } = useHealth();
  const role = useLive((s) => s.status?.role);
  const it = useOffice((s) => s.employees.find((e) => e.id === "emp-it" && e.active));
  const refresh = useCallback(() => void load(), [load]);
  useEffect(() => {
    if (role === "owner") refresh();
  }, [role, refresh]);
  const [showOk, setShowOk] = useState(false);
  if (role !== "owner") return null;
  const bad = checks?.filter((c) => c.level === "bad").length ?? 0;
  const warn = checks?.filter((c) => c.level === "warn").length ?? 0;
  const areas = [...new Set((checks ?? []).map((c) => c.area))];
  return (
    <div className={cn("rounded-xl border p-3", bad ? "border-red-200" : warn ? "border-amber-200" : "border-slate-200")}>
      <div className="mb-2 flex items-center gap-2">
        <div className="text-xs font-semibold text-slate-700">System health</div>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", bad ? "bg-red-100 text-red-800" : warn ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>
          {!checks ? "checking…" : bad ? `${bad} problem${bad > 1 ? "s" : ""}` : warn ? `${warn} to look at` : "All good"}
        </span>
        <button onClick={refresh} disabled={loading} className="ml-auto flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:underline disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Check again
        </button>
      </div>
      {error && <div className="mb-2 rounded-lg bg-red-50 p-2 text-[11px] text-red-700">{error}</div>}
      <div className="space-y-2">
        {areas.map((area) => {
          const list = (checks ?? []).filter((c) => c.area === area && (showOk || c.level === "bad" || c.level === "warn"));
          const hidden = (checks ?? []).filter((c) => c.area === area).length - list.length;
          return (
            <div key={area}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{area}</div>
              {list.map((c) => (
                <div key={c.key} className="flex gap-2 py-1 text-xs">
                  <span className="mt-0.5 shrink-0">{ICON[c.level]}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800">{c.label}</span> <span className="text-slate-600">— {c.detail}</span>
                    {c.fix && (c.level === "bad" || c.level === "warn") && <div className="text-[11px] text-sky-800">↳ {c.fix}</div>}
                  </div>
                </div>
              ))}
              {hidden > 0 && !showOk && <div className="py-0.5 text-[11px] text-emerald-700">✓ {hidden} working normally</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
        <button onClick={() => setShowOk((v) => !v)} className="font-medium text-slate-500 hover:underline">
          {showOk ? "Hide working items" : "Show everything"}
        </button>
        <span className="ml-auto">
          {it ? `${it.name.split(" ")[0]} (IT) checks every 10 min and messages you on Telegram if something breaks` : "Checked every 10 minutes"}
          {at ? ` · ${timeAgo(at)}` : ""}
        </span>
      </div>
    </div>
  );
}
