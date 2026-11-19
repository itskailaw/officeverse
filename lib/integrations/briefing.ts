import "server-only";
import type { LiveSummary } from "./summary";
import { escapeHtml } from "./telegram";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const rm2 = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Morning briefing text (Telegram HTML) from the live summary. Plain facts only — no AI, no estimates. */
export function briefingText(s: LiveSummary | null, opts: { ceoName?: string; appUrl?: string } = {}) {
  const date = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const lines: string[] = [`☀️ <b>Good morning${opts.ceoName ? `, ${escapeHtml(opts.ceoName)}` : ""}</b> — ${date}`];
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

  lines.push("", "<i>Gross order value before fees and refunds · Malaysia time</i>");
  if (opts.appUrl) lines.push(`<a href="${opts.appUrl}">Open OfficeVerse</a>`);
  return lines.join("\n");
}
