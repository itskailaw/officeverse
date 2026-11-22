// Malaysian shopping and festive calendar for campaign planning (pure — unit-tested).
// Moving festivals come from the festive table (2026-2029); double-day sales, payday and
// fixed holidays are worked out for any year.

import { FESTIVE_DAYS } from "../office/festive.ts";

export type EventKind = "mega" | "festival" | "double" | "payday" | "holiday";
export interface ShopEvent {
  /** stable per occurrence, e.g. "11.11-2026" */
  id: string;
  name: string;
  /** first day, YYYY-MM-DD (Malaysia time) */
  date: string;
  kind: EventKind;
  /** a one-line hint for the campaign */
  tip: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** nth weekday (0 = Sunday) of a month; n = -1 for the last */
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  if (n < 0) {
    const last = new Date(Date.UTC(y, m, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return iso(y, m, last.getUTCDate() - back);
  }
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return iso(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

const MEGA: Record<number, string> = { 9: "9.9 Super Shopping Day", 10: "10.10 Brands Festival", 11: "11.11 Biggest Sale", 12: "12.12 Birthday Sale" };

/** Every campaign-worthy date in a calendar year. */
export function eventsOfYear(y: number): ShopEvent[] {
  const out: ShopEvent[] = [];
  for (let m = 1; m <= 12; m++) {
    const mega = MEGA[m];
    out.push({
      id: `${m}.${m}-${y}`,
      name: mega ?? `${m}.${m} Sale`,
      date: iso(y, m, m),
      kind: mega ? "mega" : "double",
      tip: mega ? "Platform-wide mega sale: free-shipping vouchers, flash deals and the biggest ad push of the quarter." : "Monthly double-day sale: join the platform campaign with a small shop voucher.",
    });
    out.push({ id: `payday-${y}-${pad(m)}`, name: "Payday Sale", date: iso(y, m, 25), kind: "payday", tip: "Buyers just got paid: bundles and add-on deals convert well." });
  }
  const fest = (key: keyof typeof FESTIVE_DAYS, name: string, tip: string) => {
    for (const f of FESTIVE_DAYS[key]) if (f.start.startsWith(String(y))) out.push({ id: `${key}-${y}`, name, date: f.start, kind: "festival", tip });
  };
  fest("cny", "Chinese New Year", "Gifting and spring-cleaning: fresh-start bundles; couriers pause around the holiday, so ship early.");
  fest("raya", "Hari Raya Aidilfitri", "Biggest gifting season: Ramadan sale in the weeks before; couriers slow down in the last week.");
  fest("deepavali", "Deepavali", "Festive gifting and home preparation: family bundles.");
  // Ramadan sale starts about 30 days before Raya
  for (const f of FESTIVE_DAYS.raya) {
    if (!f.start.startsWith(String(y))) continue;
    const d = new Date(Date.parse(`${f.start}T12:00:00+08:00`) - 30 * 86400000);
    out.push({ id: `ramadan-${y}`, name: "Ramadan Sale", date: iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), kind: "festival", tip: "A month of evening shopping: run ads after buka puasa (8–11 pm)." });
  }
  out.push({ id: `mothers-${y}`, name: "Mother's Day", date: nthWeekday(y, 5, 0, 2), kind: "holiday", tip: "Gift for mum: a healthier-home angle works well." });
  out.push({ id: `fathers-${y}`, name: "Father's Day", date: nthWeekday(y, 6, 0, 3), kind: "holiday", tip: "Gift for dad: practical home upgrades." });
  out.push({ id: `merdeka-${y}`, name: "Merdeka Day", date: iso(y, 8, 31), kind: "holiday", tip: "Patriotic 31% or RM31 deals around the date." });
  out.push({ id: `msiaday-${y}`, name: "Malaysia Day", date: iso(y, 9, 16), kind: "holiday", tip: "Follows 9.9 — a second, smaller push." });
  out.push({ id: `blackfriday-${y}`, name: "Black Friday", date: nthWeekday(y, 11, 5, 4), kind: "mega", tip: "Between 11.11 and 12.12: keep the 11.11 momentum going." });
  out.push({ id: `xmas-${y}`, name: "Christmas", date: iso(y, 12, 25), kind: "holiday", tip: "Year-end gifting; ship by mid-December to arrive in time." });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const klToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(now);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

/** Events from today up to `days` ahead, soonest first (payday hidden unless asked). */
export function upcomingEvents(now = new Date(), days = 90, opts: { payday?: boolean } = {}) {
  const today = klToday(now);
  const y = Number(today.slice(0, 4));
  return [...eventsOfYear(y), ...eventsOfYear(y + 1)]
    .map((e) => ({ ...e, daysLeft: daysBetween(today, e.date) }))
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= days && (opts.payday || e.kind !== "payday"));
}

/** How far ahead to remind: mega sales and festivals at 14 and 3 days, double days at 5, the rest at 7. */
export const reminderDays = (k: EventKind): number[] => (k === "mega" || k === "festival" ? [14, 3] : k === "double" ? [5] : k === "holiday" ? [7] : []);

/** Reminders due now that haven't been sent ("<event id>:<days>" keys). */
export function dueReminders(now: Date, sent: string[]) {
  const done = new Set(sent);
  const out: { key: string; event: ShopEvent & { daysLeft: number } }[] = [];
  for (const e of upcomingEvents(now, 15)) {
    // the closest threshold already reached (so a missed day doesn't send two reminders at once)
    const hit = reminderDays(e.kind).filter((d) => e.daysLeft <= d).sort((a, b) => a - b)[0];
    if (hit === undefined) continue;
    const key = `${e.id}:${hit}`;
    if (!done.has(key)) out.push({ key, event: e });
  }
  return out;
}
