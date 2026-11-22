// Which festive outfit the office wears today (Malaysia time). Pure, unit-tested.
// Islamic and lunar festival dates move each year; the table covers 2026-2029
// (Hari Raya / Deepavali dates are the expected public-holiday dates).

export type FestiveTheme = "raya" | "cny" | "deepavali" | "kobe";

export const FESTIVE_DAYS: Record<Exclude<FestiveTheme, "kobe">, { start: string; days: number }[]> = {
  cny: [
    { start: "2026-02-17", days: 3 },
    { start: "2027-02-06", days: 3 },
    { start: "2028-01-26", days: 3 },
    { start: "2029-02-13", days: 3 },
  ],
  raya: [
    { start: "2026-03-20", days: 7 },
    { start: "2027-03-10", days: 7 },
    { start: "2028-02-27", days: 7 },
    { start: "2029-02-14", days: 7 },
  ],
  deepavali: [
    { start: "2026-11-08", days: 2 },
    { start: "2027-10-28", days: 2 },
    { start: "2028-10-17", days: 2 },
    { start: "2029-11-05", days: 2 },
  ],
};

const klDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function festiveTheme(now = new Date()): FestiveTheme | null {
  const today = klDate(now);
  if (today.slice(5) === "08-24") return "kobe";
  for (const [theme, list] of Object.entries(FESTIVE_DAYS) as [Exclude<FestiveTheme, "kobe">, { start: string; days: number }[]][]) {
    for (const { start, days } of list) {
      const end = klDate(new Date(Date.parse(`${start}T12:00:00+08:00`) + (days - 1) * 86400 * 1000));
      if (today >= start && today <= end) return theme;
    }
  }
  return null;
}

export type DecorTheme = "raya" | "cny" | "deepavali" | "merdeka" | "christmas";

/** Which decorations are up today: they go up before the festival and stay a while after. */
export function decorTheme(now = new Date()): DecorTheme | null {
  const today = klDate(now);
  const md = today.slice(5);
  const shift = (d: string, n: number) => klDate(new Date(Date.parse(`${d}T12:00:00+08:00`) + n * 86400 * 1000));
  const windows: Record<Exclude<DecorTheme, "merdeka" | "christmas">, [number, number]> = { raya: [-14, 30], cny: [-10, 14], deepavali: [-7, 2] };
  for (const theme of ["raya", "cny", "deepavali"] as const) {
    for (const { start } of FESTIVE_DAYS[theme]) {
      if (today >= shift(start, windows[theme][0]) && today <= shift(start, windows[theme][1])) return theme;
    }
  }
  if (md >= "08-15" && md <= "09-16") return "merdeka";
  if (md >= "12-01" && md <= "12-26") return "christmas";
  return null;
}
