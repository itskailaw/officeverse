"use client";

import { useState } from "react";
import { useOffice } from "@/lib/store/office-store";

// USD per million tokens [input, output] — estimates only; the Anthropic Console is authoritative.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

type Item = { key: string; who: string; what: string; at: string; tokens: number; cost: number; model: string | null };

/** Which tasks and chats use the AI tokens: totals, per employee, and the biggest items. */
export function AIUsageCard() {
  const tasks = useOffice((s) => s.tasks);
  const chats = useOffice((s) => s.chatMessages);
  const employees = useOffice((s) => s.employees);
  const [range, setRange] = useState<"month" | "last" | "all">("month");
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString().slice(0, 7);
  const inRange = (at: string) => range === "all" || at.startsWith(range === "month" ? thisMonth : lastMonth);
  const costOf = (u: { input: number; output: number }, model: string | null | undefined) => {
    const p = PRICES[model ?? ""] ?? PRICES["claude-opus-5-5"];
    return (u.input * p[0] + u.output * p[1]) / 1_000_000;
  };
  const name = (id: string | null | undefined) => employees.find((e) => e.id === id)?.name ?? "Unknown";

  const items: Item[] = [];
  for (const t of tasks) {
    if (!t.usage || !inRange(t.updatedAt)) continue;
    items.push({ key: t.id, who: name(t.employeeId), what: t.title, at: t.updatedAt, tokens: t.usage.input + t.usage.output, cost: costOf(t.usage, t.model), model: t.model ?? null });
  }
  // chats: one line per employee per day (a conversation), not per message
  const chatDays = new Map<string, Item>();
  for (const m of chats) {
    if (!m.usage || !inRange(m.createdAt)) continue;
    const k = `${m.employeeId}:${m.createdAt.slice(0, 10)}`;
    const it = chatDays.get(k) ?? { key: k, who: name(m.employeeId), what: m.id.startsWith("tg-") ? "Chat (Telegram)" : "Chat", at: m.createdAt, tokens: 0, cost: 0, model: m.model ?? null };
    it.tokens += m.usage.input + m.usage.output;
    it.cost += costOf(m.usage, m.model);
    chatDays.set(k, it);
  }
  items.push(...chatDays.values());

  const total = items.reduce((a, i) => ({ tokens: a.tokens + i.tokens, cost: a.cost + i.cost }), { tokens: 0, cost: 0 });
  const byWho = new Map<string, { tokens: number; cost: number }>();
  for (const i of items) {
    const w = byWho.get(i.who) ?? { tokens: 0, cost: 0 };
    w.tokens += i.tokens;
    w.cost += i.cost;
    byWho.set(i.who, w);
  }
  const people = [...byWho.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const top = [...items].sort((a, b) => b.cost - a.cost).slice(0, 10);
  const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : `${(n / 1000).toFixed(1)}k`);
  const fmtUsd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-xs font-semibold text-slate-700">AI usage</div>
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="ml-auto h-6 rounded-md border border-slate-200 bg-panel px-1 text-[11px]" aria-label="Period">
          <option value="month">This month</option>
          <option value="last">Last month</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [String(items.length), "Tasks & chats"],
          [fmtTok(total.tokens), "Tokens"],
          [fmtUsd(total.cost), "Est. cost (USD)"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-slate-50 p-2">
            <div className="text-base font-semibold text-slate-900">{v}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{l}</div>
          </div>
        ))}
      </div>
      {people.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">By employee</div>
          <div className="space-y-1">
            {people.map(([who, w]) => (
              <div key={who} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-slate-700">{who}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${total.cost ? (w.cost / total.cost) * 100 : 0}%` }} />
                </div>
                <span className="w-14 text-right tabular-nums text-slate-500">{fmtTok(w.tokens)}</span>
                <span className="w-14 text-right font-semibold tabular-nums text-slate-800">{fmtUsd(w.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {top.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biggest items</div>
          <div className="divide-y divide-slate-100">
            {top.map((i) => (
              <div key={i.key} className="flex items-center gap-2 py-1 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-slate-800" title={i.what}>
                    {i.what}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {i.who} · {new Date(i.at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                    {i.model ? ` · ${i.model.replace(/^claude-/, "")}` : ""}
                  </div>
                </div>
                <span className="tabular-nums text-slate-500">{fmtTok(i.tokens)}</span>
                <span className="w-14 text-right font-semibold tabular-nums text-slate-800">{fmtUsd(i.cost)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Estimates from tasks and chats recorded in OfficeVerse. Sophia&apos;s short morning-briefing notes aren&apos;t included. Your Anthropic Console shows exact billing.
        To spend less, set an employee&apos;s model to Sonnet or Haiku in Edit employee.
      </p>
    </div>
  );
}
