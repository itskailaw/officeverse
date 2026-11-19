// Kobe Day (24 August, Malaysia time). `?kobeday=1` previews it on any day.
export function isKobeDay(now = new Date()): boolean {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("kobeday") === "1") return true;
  const md = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit", day: "2-digit" }).format(now);
  return md === "08-24";
}
