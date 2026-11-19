import "server-only";
import type { LiveSummary } from "./summary";
import { escapeHtml } from "./telegram";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const rm2 = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Computed comparisons for the AI commentary, so the model never has to do arithmetic
 * or guess: week-over-week per platform, yesterday vs the same weekday last week, etc.
 */
export function briefingFacts(s: LiveSummary) {
  const days = s.days; // oldest → newest, last entry = today (partial)
  const done = days.slice(0, -1); // complete days only
  const sum = (arr: typeof days, k: "revenue" | "shopee" | "lazada") => Math.round(arr.reduce((a, d) => a + (d[k] ?? 0), 0));
  const last7 = done.slice(-7);
  const prev7 = done.slice(-14, -7);
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const plats = (["shopee", "lazada"] as const).filter((p) => s.platforms[p].connected);
  const y = done.at(-1);
  const lastWeekSameDay = done.at(-8);
  return {
    currency: "MYR",
    connected: plats,
    yesterday: { date: y?.date, revenue: Math.round(y?.revenue ?? 0), orders: y?.orders ?? 0, sameWeekdayLastWeek: Math.round(lastWeekSameDay?.revenue ?? 0), changePct: pct(y?.revenue ?? 0, lastWeekSameDay?.revenue ?? 0) },
    last7Days: {
      total: sum(last7, "revenue"),
      previous7: sum(prev7, "revenue"),
      changePct: pct(sum(last7, "revenue"), sum(prev7, "revenue")),
      byPlatform: Object.fromEntries(plats.map((p) => [p, { last7: sum(last7, p), previous7: sum(prev7, p), changePct: pct(sum(last7, p), sum(prev7, p)) }])),
    },
    monthToDate: s.monthToDate,
    parcels: s.toPack,
    cancelledToday: s.cancelledToday,
    ads: {
      shopeeBalance: s.ads.shopee?.balance ?? null,
      lazadaYesterday: s.ads.lazada?.yesterday ? { spend: s.ads.lazada.yesterday.spend, adSales: s.ads.lazada.yesterday.revenue, roi: s.ads.lazada.yesterday.roi } : null,
      lazadaMonthToDate: s.ads.lazada?.monthToDate ? { spend: s.ads.lazada.monthToDate.spend, adSales: s.ads.lazada.monthToDate.revenue, roi: s.ads.lazada.monthToDate.roi } : null,
    },
    bestSellers30d: s.bestSellers30d.slice(0, 5),
  };
}

/** Morning briefing text (Telegram HTML). Figures come straight from the data; `notes` is the assistant's optional commentary. */
export function briefingText(s: LiveSummary | null, opts: { ceoName?: string; appUrl?: string; from?: string; notes?: string[] } = {}) {
  const date = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const lines: string[] = [
    opts.from
      ? `☀️ <b>Good morning Boss</b> — ${escapeHtml(opts.from)} here with your briefing for ${date}`
      : `☀️ <b>Good morning${opts.ceoName ? `, ${escapeHtml(opts.ceoName)}` : ""}</b> — ${date}`,
  ];
  if (!s) {
    lines.push("", "No marketplace is connected yet, so there are no sales figures to report.");
    return lines.join("\n");
  }
  const plats = (["shopee", "lazada"] as const).filter((p) => s.platforms[p].connected);
  const name = { shopee: "Shopee", lazada: "Lazada" };

  lines.push("", `💰 <b>Yesterday: ${rm(s.yesterday.revenue)}</b> · ${s.yesterday.orders} orders`);
  if (plats.length > 1) for (const p of plats) { const f = s.byPlatform[p]; if (f) lines.push(`   • ${name[p]}: ${rm(f.yesterday.revenue)} · ${f.yesterday.orders} orders`); }
  lines.push(`📅 Month to date: ${rm(s.monthToDate.revenue)} · ${s.monthToDate.orders} orders`);

  const t = s.toPack;
  lines.push("", `📦 <b>To process: ${t.readyToShip}</b> · To ship: ${t.processed}`);
  if (plats.length > 1)
    for (const p of plats) {
      const f = s.byPlatform[p];
      if (f && f.toPack.total) lines.push(`   • ${name[p]}: ${f.toPack.readyToShip} to process · ${f.toPack.processed} to ship`);
    }
  if (t.urgent) lines.push(`⚠️ <b>${t.urgent} parcel${t.urgent > 1 ? "s" : ""} must ship within 24 hours</b>`);
  if (s.cancelledToday) lines.push(`❌ ${s.cancelledToday} cancelled today so far`);

  const ads: string[] = [];
  if (s.ads.shopee) ads.push(`Shopee balance ${rm2(s.ads.shopee.balance)}`);
  const lz = s.ads.lazada?.yesterday;
  if (lz) ads.push(`Lazada spent ${rm2(lz.spend)} yesterday${lz.roi != null ? ` (ROI ${lz.roi.toFixed(1)}x)` : ""}`);
  if (ads.length) lines.push("", `📣 Ads: ${ads.join(" · ")}`);

  const top = s.bestSellers30d[0];
  if (top) lines.push(`🏆 Best seller (30 days): ${escapeHtml(top.name)} — ${top.units} units`);

  if (opts.notes?.length) {
    lines.push("", `💬 <b>${escapeHtml(opts.from ?? "Notes")}'s notes</b>`);
    for (const n of opts.notes) lines.push(`• ${escapeHtml(n)}`);
  }

  lines.push("", "<i>Gross order value before fees and refunds · Malaysia time</i>");
  if (opts.appUrl) lines.push(`<a href="${opts.appUrl}">Open OfficeVerse</a>`);
  return lines.join("\n");
}
