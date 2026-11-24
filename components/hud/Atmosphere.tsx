"use client";

import { useEffect, useRef, useState } from "react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { useWeather, weatherIcon } from "@/lib/office/weather";
import { getSim } from "@/lib/office/runtime";
import { klHourNow } from "@/lib/office/lighting";
import { formatMYR } from "@/lib/data/demo";
import { celebrationsToday, randomStaffDates } from "@/lib/office/office-life";
import { PRAISE, useMoments } from "@/lib/office/moments";

const klDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const once = (key: string) => {
  try {
    if (localStorage.getItem(key) === klDate()) return false;
    localStorage.setItem(key, klDate());
    return true;
  } catch {
    return false;
  }
};

/** Small KL weather chip for the top bar (refreshes every 20 minutes). */
export function WeatherChip() {
  const w = useWeather((s) => s.w);
  useEffect(() => {
    void useWeather.getState().load();
    const t = setInterval(() => void useWeather.getState().load(), 20 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!w) return null;
  return (
    <span className="hidden items-center gap-0.5 whitespace-nowrap rounded-md px-1 text-xs text-slate-600 md:flex" title={`Kuala Lumpur now: ${w.temp}°C${w.raining ? " — raining" : ""}`}>
      <span aria-hidden>{weatherIcon(w)}</span>
      {w.temp}°
    </span>
  );
}

/**
 * Office life: lunch at the kopitiam around 12:30 (Malaysia time), and a small celebration
 * the first time today's sales beat the best day of the last 30.
 */
export function TeamMoments() {
  const summary = useLive((s) => s.summary);
  const toast = useUI((s) => s.toast);
  const [confetti, setConfetti] = useState(false);

  // one-time switch to lighting that follows Malaysia time (the CEO can still pick a fixed light)
  useEffect(() => {
    try {
      if (localStorage.getItem("ov:auto-light") !== "1") {
        localStorage.setItem("ov:auto-light", "1");
        if (useOffice.getState().settings.lighting === "day") useOffice.getState().updateSettings({ lighting: "auto" });
      }
    } catch {}
  }, []);

  // lunch: between 12:30 and 13:30, once a day, about half the team heads to the kopitiam
  useEffect(() => {
    const check = () => {
      const h = klHourNow();
      if (h < 12.5 || h >= 13.5) return;
      if (!once("ov:lunch-day")) return;
      const sim = getSim();
      const staff = useOffice.getState().employees.filter((e) => e.active && e.status === "available");
      let n = 0;
      for (const e of staff) if (Math.random() < 0.5 && sim.startLunch(e.id)) n++;
      if (n) toast("info", `🍜 Lunch time — ${n} of the team headed to the Kopitiam`);
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [toast]);

  // birthdays and work anniversaries: a toast once a day each (balloons appear at their desk)
  const employees = useOffice((s) => s.employees);
  const staffDates = useOffice((s) => s.settings.staffDates);
  // anyone without dates gets a made-up (but stable) birthday and join date, saved once
  useEffect(() => {
    if (!employees.length) return;
    const missing = employees.filter((e) => !staffDates?.[e.id]?.birthday && !staffDates?.[e.id]?.joinedOn);
    if (!missing.length) return;
    const t = setTimeout(() => {
      const cur = useOffice.getState().settings.staffDates ?? {};
      const add = Object.fromEntries(missing.filter((e) => !cur[e.id]).map((e) => [e.id, randomStaffDates(e.id)]));
      if (Object.keys(add).length) useOffice.getState().updateSettings({ staffDates: { ...cur, ...add } });
    }, 4000); // after the saved office has loaded, so real dates win
    return () => clearTimeout(t);
  }, [employees, staffDates]);
  useEffect(() => {
    const people = employees.map((e) => ({ id: e.id, name: e.name, active: e.active, ...(staffDates?.[e.id] ?? {}) }));
    for (const c of celebrationsToday(people)) {
      if (!once(`ov:celebrate:${c.kind}:${c.id}`)) continue;
      const first = c.name.split(" ")[0];
      if (c.kind === "birthday") toast("success", `🎂 It's ${first}'s birthday today! Balloons and cake are at their desk.`);
      else toast("success", `🎉 ${first} has been with the team ${c.years} year${c.years === 1 ? "" : "s"} today!`);
      useOffice.getState().logActivity(c.id, c.kind === "birthday" ? `🎂 ${c.name}'s birthday` : `🎉 ${c.name}'s ${c.years}-year work anniversary`);
    }
  }, [employees, staffDates, toast]);

  // emotes: 💦 when a task starts, 💡 (and a happy skip) when it's done, ❤️ when the CEO says something kind
  const tasks = useOffice((s) => s.tasks);
  const chats = useOffice((s) => s.chatMessages);
  const prevTasks = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const now = new Map(tasks.map((t) => [t.id, t.status]));
    const prev = prevTasks.current;
    prevTasks.current = now;
    if (!prev) return;
    const mo = useMoments.getState();
    for (const t of tasks) {
      const was = prev.get(t.id);
      if (was === t.status) continue;
      if (t.status === "completed") {
        mo.emote(t.employeeId, "💡");
        mo.happy(t.employeeId, 40_000);
      } else if (t.status === "running" && was !== "running") mo.emote(t.employeeId, "💦", 2500);
    }
  }, [tasks]);
  const seenChat = useRef<number | null>(null);
  useEffect(() => {
    if (seenChat.current === null) {
      seenChat.current = chats.length;
      return;
    }
    const fresh = chats.slice(seenChat.current);
    seenChat.current = chats.length;
    for (const m of fresh) {
      if (m.role === "ceo" && PRAISE.test(m.content)) {
        useMoments.getState().emote(m.employeeId, "❤️", 4000);
        useMoments.getState().happy(m.employeeId, 60_000);
      }
    }
  }, [chats]);

  // new orders: the team cheers; a big one (RM 200+) gets confetti too
  const lastToday = useRef<{ orders: number; revenue: number; day: string } | null>(null);
  useEffect(() => {
    if (!summary) return;
    const cur = { orders: summary.today.orders, revenue: summary.today.revenue, day: klDate() };
    const prev = lastToday.current;
    lastToday.current = cur;
    if (!prev || prev.day !== cur.day || cur.orders <= prev.orders) return;
    const n = cur.orders - prev.orders;
    const amount = cur.revenue - prev.revenue;
    useMoments.getState().cheer(4500);
    useMoments.getState().emote("emp-orders", "🎉", 4500);
    if (amount >= 200) {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 6000);
      toast("success", `💰 Big order${n > 1 ? "s" : ""} — ${formatMYR(amount)} just came in! The team is cheering.`);
    } else toast("info", `🛒 ${n} new order${n > 1 ? "s" : ""} — ${formatMYR(amount)}`);
  }, [summary, toast]);

  // record day
  useEffect(() => {
    if (!summary?.days?.length) return;
    const today = summary.today.revenue;
    const before = summary.days.slice(0, -1).map((d) => d.revenue);
    const best = Math.max(0, ...before);
    if (today > 0 && best > 0 && today > best && once("ov:record-day")) {
      useMoments.getState().cheer(6000);
      setConfetti(true);
      toast("success", `🎉 Record sales day! ${formatMYR(today)} beats your best day of the last 30 (${formatMYR(best)})`);
      setTimeout(() => setConfetti(false), 6000);
    }
  }, [summary, toast]);

  if (!confetti) return null;
  const colors = ["#fdb927", "#552583", "#eb6834", "#2a78d6", "#10b981", "#ef4444"];
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
      {Array.from({ length: 90 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-[-5%] block h-2.5 w-1.5 animate-[ovConfetti_3.2s_ease-in_forwards] rounded-sm"
          style={{ left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDelay: `${Math.random() * 1.4}s`, transform: `rotate(${Math.random() * 360}deg)` }}
        />
      ))}
    </div>
  );
}
