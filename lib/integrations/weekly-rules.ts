/** Monday weekly review: last 7 days vs the 7 before (pure — unit-tested). */
import { displayOf } from "../data/product-names.ts";

export interface WeekOrder {
  platform: "shopee" | "lazada";
  ordered_at: string;
  sale: boolean;
  cancelled: boolean;
  gross: number;
  net: number | null;
  items: { name: string; model?: string | null; sku?: string | null; qty: number; price?: number }[];
}
export interface WeekFacts {
  from: string;
  to: string;
  revenue: { now: number; prev: number; byPlatform: Record<string, { now: number; prev: number }> };
  orders: { now: number; prev: number };
  aov: { now: number; prev: number };
  cancelled: { now: number; prev: number };
  net: { now: number; covered: number } | null;
  best: { name: string; units: number; prevUnits: number }[];
  falling: { name: string; units: number; prevUnits: number }[];
  returns: { now: number; prev: number };
  busiestDay: { day: string; revenue: number } | null;
}

const KL = "Asia/Kuala_Lumpur";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: KL }).format(new Date(iso));

export function weekFacts(orders: WeekOrder[], returns: { requested_at: string }[], now = Date.now(), names?: Map<string, string>): WeekFacts {
  const WEEK = 7 * 86400000;
  const inNow = (t: number) => t > now - WEEK && t <= now;
  const inPrev = (t: number) => t > now - 2 * WEEK && t <= now - WEEK;
  const f: WeekFacts = {
    from: new Date(now - WEEK).toISOString(),
    to: new Date(now).toISOString(),
    revenue: { now: 0, prev: 0, byPlatform: {} },
    orders: { now: 0, prev: 0 },
    aov: { now: 0, prev: 0 },
    cancelled: { now: 0, prev: 0 },
    net: null,
    best: [],
    falling: [],
    returns: { now: 0, prev: 0 },
    busiestDay: null,
  };
  const units = new Map<string, { now: number; prev: number }>();
  const days = new Map<string, number>();
  let net = 0;
  let netCovered = 0;
  for (const o of orders) {
    const t = Date.parse(o.ordered_at);
    const w = inNow(t) ? "now" : inPrev(t) ? "prev" : null;
    if (!w) continue;
    if (o.cancelled) f.cancelled[w]++;
    if (!o.sale) continue;
    f.revenue[w] += o.gross;
    f.orders[w]++;
    const bp = (f.revenue.byPlatform[o.platform] ??= { now: 0, prev: 0 });
    bp[w] += o.gross;
    if (w === "now") {
      days.set(dayKey(o.ordered_at), (days.get(dayKey(o.ordered_at)) ?? 0) + o.gross);
      if (o.net != null) {
        net += o.net;
        netCovered++;
      }
    }
    for (const i of o.items) {
      const k = displayOf(i, names);
      const label = k.sub && !k.pack ? `${k.main} (${k.sub})` : k.main;
      const u = units.get(label) ?? { now: 0, prev: 0 };
      u[w] += i.qty;
      units.set(label, u);
    }
  }
  for (const r of returns) {
    const t = Date.parse(r.requested_at);
    if (inNow(t)) f.returns.now++;
    else if (inPrev(t)) f.returns.prev++;
  }
  f.aov = { now: f.orders.now ? f.revenue.now / f.orders.now : 0, prev: f.orders.prev ? f.revenue.prev / f.orders.prev : 0 };
  if (netCovered) f.net = { now: net, covered: netCovered };
  const list = [...units.entries()].map(([name, u]) => ({ name, units: u.now, prevUnits: u.prev }));
  f.best = list.filter((x) => x.units > 0).sort((a, b) => b.units - a.units).slice(0, 5);
  f.falling = list.filter((x) => x.prevUnits >= 3 && x.units < x.prevUnits * 0.6).sort((a, b) => b.prevUnits - b.units - (a.prevUnits - a.units)).slice(0, 3);
  const bd = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bd) f.busiestDay = { day: bd[0], revenue: bd[1] };
  return f;
}

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
export const pct = (now: number, prev: number) => (prev ? `${now >= prev ? "▲" : "▼"} ${Math.abs(Math.round(((now - prev) / prev) * 100))}%` : now ? "new" : "–");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const weekday = (d: string) => new Intl.DateTimeFormat("en-MY", { timeZone: KL, weekday: "long", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00+08:00`));

/** Telegram version (HTML). */
export function weeklyTelegram(f: WeekFacts, notes: string[] = [], from = "Sophia") {
  const P = (k: string) => (k === "shopee" ? "Shopee" : "Lazada");
  const lines = [
    `📊 <b>Weekly review</b> — ${from}`,
    `<b>Sales:</b> ${rm(f.revenue.now)} (${pct(f.revenue.now, f.revenue.prev)} vs last week)`,
    ...Object.entries(f.revenue.byPlatform).map(([p, v]) => `   • ${P(p)}: ${rm(v.now)} (${pct(v.now, v.prev)})`),
    `<b>Orders:</b> ${f.orders.now} (${pct(f.orders.now, f.orders.prev)}) · avg ${rm(f.aov.now)}`,
    f.net ? `<b>Payout after fees:</b> ${rm(f.net.now)} (${f.net.covered} orders with fees so far)` : "",
    f.busiestDay ? `<b>Best day:</b> ${weekday(f.busiestDay.day)} — ${rm(f.busiestDay.revenue)}` : "",
    f.best.length ? `<b>Top sellers:</b>\n${f.best.map((b) => `   ${b.units}× ${esc(b.name)}`).join("\n")}` : "",
    f.falling.length ? `<b>Slowing down:</b>\n${f.falling.map((b) => `   ${esc(b.name)}: ${b.units} (was ${b.prevUnits})`).join("\n")}` : "",
    `<b>Cancelled:</b> ${f.cancelled.now} · <b>Return requests:</b> ${f.returns.now}`,
    notes.length ? `\n💡 ${notes.map(esc).join("\n💡 ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/** Email version. */
export function weeklyHtml(f: WeekFacts, notes: string[] = [], from = "Sophia") {
  const P = (k: string) => (k === "shopee" ? "Shopee" : "Lazada");
  const tile = (label: string, value: string, sub: string) =>
    `<td style="padding:10px;border-radius:10px;background:#f8fafc;vertical-align:top"><div style="font:11px sans-serif;color:#64748b;text-transform:uppercase">${label}</div><div style="font:700 20px sans-serif;color:#0f172a">${value}</div><div style="font:12px sans-serif;color:#64748b">${sub}</div></td>`;
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:16px"><div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:20px">
<div style="font:600 18px sans-serif;color:#0f172a">📊 Weekly review</div>
<div style="font:13px sans-serif;color:#64748b;margin-top:2px">Last 7 days vs the week before — ${esc(from)}</div>
<table style="width:100%;border-spacing:8px;margin-top:10px"><tr>
${tile("Sales", rm(f.revenue.now), pct(f.revenue.now, f.revenue.prev) + " vs last week")}
${tile("Orders", String(f.orders.now), `${pct(f.orders.now, f.orders.prev)} · avg ${rm(f.aov.now)}`)}
${tile("Returns", String(f.returns.now), `${f.cancelled.now} cancelled`)}
</tr></table>
<div style="font:13px/1.6 sans-serif;color:#0f172a;margin-top:6px">${Object.entries(f.revenue.byPlatform)
    .map(([p, v]) => `<b>${P(p)}</b>: ${rm(v.now)} (${pct(v.now, v.prev)})`)
    .join(" · ")}${f.net ? `<br>Payout after fees: <b>${rm(f.net.now)}</b>` : ""}${f.busiestDay ? `<br>Best day: <b>${weekday(f.busiestDay.day)}</b> — ${rm(f.busiestDay.revenue)}` : ""}</div>
${f.best.length ? `<div style="margin-top:12px;font:600 13px sans-serif">Top sellers</div><div style="font:13px/1.6 sans-serif">${f.best.map((b) => `<b>${b.units}×</b> ${esc(b.name)} <span style="color:#64748b">(${pct(b.units, b.prevUnits)})</span>`).join("<br>")}</div>` : ""}
${f.falling.length ? `<div style="margin-top:12px;font:600 13px sans-serif;color:#b45309">Slowing down</div><div style="font:13px/1.6 sans-serif">${f.falling.map((b) => `${esc(b.name)}: ${b.units} (was ${b.prevUnits})`).join("<br>")}</div>` : ""}
${notes.length ? `<div style="margin-top:14px;padding:10px 12px;border-radius:8px;background:#eff6ff;font:13px/1.6 sans-serif">${notes.map((n) => `💡 ${esc(n)}`).join("<br>")}</div>` : ""}
</div></body></html>`;
}
