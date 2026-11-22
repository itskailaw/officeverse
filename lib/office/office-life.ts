// Small pure helpers for office life: who's celebrating today, employee of the month,
// and when staff cars arrive and leave (unit-tested).

export const klParts = (now = new Date()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, md: `${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday as string };
};

export interface Person {
  id: string;
  name: string;
  active: boolean;
  birthday?: string;
  joinedOn?: string;
}
export type Celebration = { id: string; name: string; kind: "birthday" | "anniversary"; years?: number };

/** Birthdays (MM-DD) and work anniversaries (whole years since joinedOn) today. 29 Feb birthdays count on 28 Feb in other years. */
export function celebrationsToday(people: Person[], now = new Date()): Celebration[] {
  const { date, md } = klParts(now);
  const y = Number(date.slice(0, 4));
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const out: Celebration[] = [];
  for (const p of people) {
    if (!p.active) continue;
    const b = p.birthday?.trim();
    if (b && (b === md || (b === "02-29" && !leap && md === "02-28"))) out.push({ id: p.id, name: p.name, kind: "birthday" });
    const j = p.joinedOn?.trim();
    if (j && /^\d{4}-\d{2}-\d{2}$/.test(j) && j.slice(5) === md && Number(j.slice(0, 4)) < y) out.push({ id: p.id, name: p.name, kind: "anniversary", years: y - Number(j.slice(0, 4)) });
  }
  return out;
}

/** Last month's "YYYY-MM" in Malaysia time. */
export function lastMonth(now = new Date()) {
  const { date } = klParts(now);
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Top employee of a month: most tasks completed, then most chats answered. */
export function employeeOfMonth(
  people: Person[],
  tasks: { employeeId: string; status: string; updatedAt: string }[],
  chats: { employeeId: string; role: string; createdAt: string }[],
  month: string,
) {
  let best: { id: string; name: string; done: number; chats: number } | null = null;
  for (const p of people) {
    if (!p.active) continue;
    const done = tasks.filter((t) => t.employeeId === p.id && t.status === "completed" && t.updatedAt.startsWith(month)).length;
    const talk = chats.filter((c) => c.employeeId === p.id && c.role === "employee" && c.createdAt.startsWith(month)).length;
    if (!done && !talk) continue;
    if (!best || done > best.done || (done === best.done && talk > best.chats)) best = { id: p.id, name: p.name, done, chats: talk };
  }
  return best;
}

/** Cheap stable hash → [0, 1). */
export function seeded(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * When the car in a parking bay arrives and leaves today (minutes after midnight, Malaysia time),
 * or null if that bay stays empty. Weekdays most bays fill 7:45–9:30 and empty 17:15–19:30;
 * weekends only a few.
 */
export function bayTimes(date: string, weekday: string, bay: number): { arrive: number; leave: number } | null {
  const r = (k: string) => seeded(`${date}:${bay}:${k}`);
  const weekend = weekday === "Sat" || weekday === "Sun";
  if (r("used") > (weekend ? 0.18 : 0.85)) return null;
  return weekend
    ? { arrive: 9 * 60 + 30 + Math.floor(r("a") * 150), leave: 13 * 60 + Math.floor(r("l") * 240) }
    : { arrive: 7 * 60 + 45 + Math.floor(r("a") * 105), leave: 17 * 60 + 15 + Math.floor(r("l") * 135) };
}
