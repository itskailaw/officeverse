"use client";

import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { cn } from "@/lib/utils";
import { PRICES } from "./AIUsageCard";

type FaridMonth = { month: string; confirmed: number; failed: number; minutes: number[] };
const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const mins = (m: number) => (m < 1 ? "<1 min" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

/** One row per employee for the month: work done, quality, speed and what their AI costs. */
export function Scorecards() {
  const employees = useOffice((s) => s.employees);
  const tasks = useOffice((s) => s.tasks);
  const chats = useOffice((s) => s.chatMessages);
  const qa = useOffice((s) => s.settings.qaStats);
  const [farid, setFarid] = useState<FaridMonth[] | null>(null);
  const [range, setRange] = useState<"month" | "last">("month");
  useEffect(() => {
    fetch("/api/scorecards", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setFarid(j.farid))
      .catch(() => {});
  }, []);
  const now = new Date();
  const month = range === "month" ? now.toISOString().slice(0, 7) : new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);

  const rows = useMemo(() => {
    const cost = (u: { input: number; output: number }, model?: string | null) => {
      const p = PRICES[model ?? ""] ?? PRICES["claude-opus-5-5"];
      return (u.input * p[0] + u.output * p[1]) / 1_000_000;
    };
    return employees
      .filter((e) => e.active)
      .map((e) => {
        const mine = tasks.filter((t) => t.employeeId === e.id && t.updatedAt.startsWith(month));
        const done = mine.filter((t) => t.status === "completed").length;
        const failed = mine.filter((t) => t.status === "failed").length;
        const talk = chats.filter((c) => c.employeeId === e.id && c.role === "employee" && c.createdAt.startsWith(month));
        const spend = [...mine.map((t) => (t.usage ? cost(t.usage, t.model) : 0)), ...talk.map((c) => (c.usage ? cost(c.usage, c.model) : 0))].reduce((a, b) => a + b, 0);
        let special: { label: string; value: string; good?: boolean } | null = null;
        if (e.id === "emp-orders") {
          const f = farid?.find((x) => x.month === month);
          const med = f ? median(f.minutes) : null;
          special =
            f && f.confirmed + f.failed
              ? { label: "Orders confirmed", value: `${f.confirmed}${f.failed ? ` · ${f.failed} failed` : ""}${med != null ? ` · median ${mins(med)} after payment` : ""}`, good: !f.failed }
              : { label: "Orders confirmed", value: "none yet" };
        } else if (qa?.[e.id]?.planted) {
          const s = qa[e.id];
          const rate = Math.round((s.caught / s.planted) * 100);
          special = { label: "QA catch rate", value: `${rate}% (${s.caught}/${s.planted})${s.missed ? ` · ${s.missed} missed` : ""}`, good: rate >= 90 };
        }
        return { e, done, failed, chats: talk.length, spend, special, total: done + talk.length };
      })
      .filter((r) => r.total || r.special)
      .sort((a, b) => b.done - a.done || b.chats - a.chats);
  }, [employees, tasks, chats, qa, farid, month]);
  const top = rows[0];

  return (
    <div className="mb-4 rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <div className="text-sm font-semibold text-slate-800">Scorecards</div>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="ml-auto h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" aria-label="Period">
          <option value="month">This month</option>
          <option value="last">Last month</option>
        </select>
      </div>
      {!rows.length ? (
        <p className="py-4 text-center text-xs text-slate-500">No work recorded {range === "month" ? "this month" : "last month"} yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 pr-2 font-medium">Employee</th>
                <th className="px-2 py-1 text-right font-medium">Tasks done</th>
                <th className="px-2 py-1 text-right font-medium">Chats</th>
                <th className="px-2 py-1 font-medium">Speciality</th>
                <th className="py-1 pl-2 text-right font-medium">AI cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.e.id}>
                  <td className="py-1.5 pr-2">
                    <div className="font-medium text-slate-800">
                      {r === top && r.done > 0 ? "🏆 " : ""}
                      {r.e.name}
                    </div>
                    <div className="text-[10px] text-slate-500">{r.e.title}</div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.done}
                    {r.failed ? <span className="text-red-600"> · {r.failed} failed</span> : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.chats}</td>
                  <td className="px-2 py-1.5">
                    {r.special ? (
                      <span className={cn("text-[11px]", r.special.good === false ? "text-amber-700" : "text-slate-700")}>
                        <span className="text-slate-400">{r.special.label}: </span>
                        {r.special.value}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-slate-700">{r.spend < 0.01 && r.spend > 0 ? "<$0.01" : `$${r.spend.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1 text-[10px] text-slate-400">AI cost is an estimate from tasks and chats in OfficeVerse; your Anthropic Console has the exact bill.</p>
    </div>
  );
}
