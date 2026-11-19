// Pure helpers for order automation (unit-tested).

/** Is `now` (Malaysia time) within [start, end)? Handles overnight ranges like 22:00–06:00. */
export function inHours(now: Date, start: string, end: string) {
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  if (start === end) return true;
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}
