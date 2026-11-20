"use client";

import type { Company } from "@/lib/data/types";
import { demoEcommerce, formatMYR } from "@/lib/data/demo";
import { makeScreenTexture } from "./materials";
import { liveSources, type LiveSummary } from "@/lib/integrations/client";

const NAVY = "#0f1f36";

function header(g: CanvasRenderingContext2D, w: number, title: string, sub?: string) {
  g.fillStyle = NAVY;
  g.fillRect(0, 0, w, 999);
  g.fillStyle = "#e2e8f0";
  g.font = "600 40px system-ui, sans-serif";
  g.fillText(title, 48, 74);
  if (sub) {
    g.fillStyle = "#94a3b8";
    g.font = "26px system-ui, sans-serif";
    g.fillText(sub, 48, 114);
  }
}

function pill(g: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg = "#111827") {
  g.font = "700 24px system-ui, sans-serif";
  const w = g.measureText(text).width + 32;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - w, y, w, 40, 20);
  g.fill();
  g.fillStyle = fg;
  g.fillText(text, x - w + 16, y + 28);
}

function drawKpis(g: CanvasRenderingContext2D, kpis: [string, string][]) {
  kpis.forEach(([k, v], i) => {
    const x = 48 + i * 320;
    g.fillStyle = "#13294a";
    g.beginPath();
    g.roundRect(x, 150, 296, 120, 16);
    g.fill();
    g.fillStyle = "#94a3b8";
    g.font = "24px system-ui, sans-serif";
    g.fillText(k, x + 20, 190);
    g.fillStyle = "#f8fafc";
    g.font = "700 40px system-ui, sans-serif";
    g.fillText(v, x + 20, 245);
  });
}

function drawTrend(g: CanvasRenderingContext2D, w: number, vals: number[], label: string, color = "#38bdf8") {
  const x0 = 48;
  const y0 = 520;
  const cw = w - 96;
  const ch = 200;
  if (vals.length < 2) return;
  const max = Math.max(...vals);
  const min = Math.min(...vals) * 0.8;
  const range = max - min || 1;
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.beginPath();
  vals.forEach((v, i) => {
    const x = x0 + (i / (vals.length - 1)) * cw;
    const y = y0 - ((v - min) / range) * ch;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.stroke();
  g.lineTo(x0 + cw, y0);
  g.lineTo(x0, y0);
  g.fillStyle = color === "#38bdf8" ? "rgba(56,189,248,0.15)" : "rgba(235,104,52,0.18)";
  g.fill();
  g.fillStyle = "#64748b";
  g.font = "22px system-ui, sans-serif";
  g.fillText(label, x0, y0 + 36);
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/** CEO office performance wall: live Shopee data when connected, else labelled demo data or "unavailable". */
export function perfScreenTexture(demoMode: boolean, live?: LiveSummary | null) {
  return makeScreenTexture((g, w) => {
    header(g, w, "Business Performance", "Water Guardian Solution · MYR · Asia/Kuala_Lumpur");
    if (live) {
      const sources = liveSources(live).toUpperCase();
      pill(g, w - 40, 44, `LIVE · ${sources}`, "#10b981", "#ffffff");
      const urgent = (n?: number) => (n ? `  (${n} urgent)` : "");
      drawKpis(g, [
        ["Revenue today", formatMYR(live.today.revenue)],
        ["To process", `${live.toPack.readyToShip}${urgent(live.toPack.urgentToProcess)}`],
        ["To ship", `${live.toPack.processed}${urgent(live.toPack.urgentToShip)}`],
      ]);
      const syncs = [live.platforms.shopee.lastSync, live.platforms.lazada.lastSync].filter((x): x is string => !!x).sort();
      drawTrend(g, w, live.days.map((d) => d.revenue), `${liveSources(live)} revenue, last 30 days · synced ${ago(syncs[0] ?? null)}`, "#eb6834");
      return;
    }
    if (!demoMode) {
      pill(g, w - 40, 44, "NO LIVE DATA", "#475569", "#f8fafc");
      g.fillStyle = "#cbd5e1";
      g.font = "600 44px system-ui, sans-serif";
      g.fillText("Data Unavailable", 48, 260);
      g.font = "28px system-ui, sans-serif";
      g.fillStyle = "#94a3b8";
      g.fillText("No marketplace data yet.", 48, 310);
      g.fillText("Connect Shopee in Settings → Integrations.", 48, 350);
      return;
    }
    const d = demoEcommerce();
    pill(g, w - 40, 44, "DEMO DATA", "#fbbf24");
    drawKpis(g, [
      ["Today", formatMYR(d.today.shopee + d.today.lazada)],
      ["Month to date", formatMYR(d.mtd)],
      ["Parcels to pack", String(d.parcels.shopee + d.parcels.lazada)],
    ]);
    drawTrend(g, w, d.days.map((x) => x.shopee + x.lazada), "30-day revenue (sample)");
  });
}

export function receptionTexture(companies: Company[], logo?: HTMLImageElement | null) {
  return makeScreenTexture((g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0f1f36");
    grad.addColorStop(1, "#1e3a5f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    if (logo) {
      const s = Math.min(150 / logo.width, 110 / logo.height);
      g.drawImage(logo, w - 64 - logo.width * s, 50, logo.width * s, logo.height * s);
    }
    g.fillStyle = "#f8fafc";
    g.font = "700 64px system-ui, sans-serif";
    g.fillText("OfficeVerse", 64, 120);
    g.fillStyle = "#94a3b8";
    g.font = "28px system-ui, sans-serif";
    g.fillText("Your Business. Your People. Your Universe.", 64, 166);
    companies
      .filter((c) => c.active)
      .slice(0, 5)
      .forEach((c, i) => {
        const y = 250 + i * 62;
        g.fillStyle = c.color;
        g.beginPath();
        g.arc(84, y - 10, 14, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#e2e8f0";
        g.font = "600 34px system-ui, sans-serif";
        g.fillText(c.name, 116, y);
      });
  });
}

export function meetingTexture(topic: string | null) {
  return makeScreenTexture((g, w) => {
    header(g, w, "Meeting Room", topic ? "In session" : "Available");
    g.fillStyle = topic ? "#f8fafc" : "#64748b";
    g.font = "700 46px system-ui, sans-serif";
    const text = topic ?? "Click the table to call a meeting";
    const words = text.split(" ");
    let line = "";
    let y = 260;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > w - 100) {
        g.fillText(line, 48, y);
        line = word;
        y += 58;
      } else line = test;
    }
    g.fillText(line, 48, y);
  });
}

/**
 * The CEO's curved ultrawide monitor (drawn across 9 curved panels, 1530×420): today's revenue per
 * platform, a 30-day revenue chart, parcels waiting, and a clock. Live data when connected, else sample.
 */
export function ceoMonitorTexture(demoMode: boolean, live: LiveSummary | null | undefined, now = new Date()) {
  return makeScreenTexture(
    (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0b1424");
      bg.addColorStop(1, "#0f1f36");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const d = live
        ? {
            shopee: live.byPlatform?.shopee?.today.revenue ?? 0,
            lazada: live.byPlatform?.lazada?.today.revenue ?? 0,
            orders: live.today.orders,
            mtd: live.monthToDate.revenue,
            process: live.toPack.readyToShip,
            ship: live.toPack.processed,
            urgent: live.toPack.urgent,
            days: live.days.map((x) => ({ s: x.shopee ?? x.revenue, l: x.lazada ?? 0 })),
            tag: "LIVE",
          }
        : demoMode
          ? (() => {
              const e = demoEcommerce();
              return {
                shopee: e.today.shopee,
                lazada: e.today.lazada,
                orders: 0,
                mtd: e.mtd,
                process: e.parcels.shopee,
                ship: e.parcels.lazada,
                urgent: 0,
                days: e.days.map((x) => ({ s: x.shopee, l: x.lazada })),
                tag: "DEMO",
              };
            })()
          : null;

      // top bar: title, live pill, clock
      g.fillStyle = "#e2e8f0";
      g.font = "600 30px system-ui, sans-serif";
      g.fillText("CEO Command Centre", 34, 50);
      const clock = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(now);
      g.font = "600 26px system-ui, sans-serif";
      g.fillStyle = "#fdb927";
      const cw = g.measureText(clock).width;
      g.fillText(clock, w - 34 - cw, 50);
      if (d) pill(g, w - 60 - cw, 22, d.tag, d.tag === "LIVE" ? "#10b981" : "#fbbf24", d.tag === "LIVE" ? "#fff" : "#111827");
      g.fillStyle = "#1e3a5f";
      g.fillRect(34, 70, w - 68, 2);

      if (!d) {
        g.fillStyle = "#94a3b8";
        g.font = "28px system-ui, sans-serif";
        g.fillText("Connect Shopee or Lazada in Settings → Integrations to see your live numbers here.", 34, 220);
        return;
      }

      // left: KPI tiles
      const tile = (x: number, y: number, tw: number, label: string, value: string, color: string) => {
        g.fillStyle = "#13294a";
        g.beginPath();
        g.roundRect(x, y, tw, 132, 14);
        g.fill();
        g.fillStyle = color;
        g.fillRect(x, y + 14, 5, 104);
        g.fillStyle = "#94a3b8";
        g.font = "22px system-ui, sans-serif";
        g.fillText(label, x + 20, y + 40);
        g.fillStyle = "#f8fafc";
        g.font = "700 40px system-ui, sans-serif";
        g.fillText(value, x + 20, y + 96);
      };
      tile(34, 92, 250, "Shopee today", formatMYR(d.shopee), "#eb6834");
      tile(298, 92, 250, "Lazada today", formatMYR(d.lazada), "#2a78d6");
      tile(34, 238, 250, "Month to date", formatMYR(d.mtd), "#fdb927");
      tile(298, 238, 250, `To process${d.urgent ? ` · ${d.urgent} urgent` : ""}`, `${d.process} / ship ${d.ship}`, d.urgent ? "#ef4444" : "#10b981");

      // right: stacked 30-day revenue bars (Shopee + Lazada)
      const x0 = 590;
      const y0 = 360;
      const ww = w - x0 - 34;
      const hh = 240;
      g.fillStyle = "#94a3b8";
      g.font = "22px system-ui, sans-serif";
      g.fillText("Revenue · last 30 days", x0, 100);
      g.fillStyle = "#eb6834";
      g.fillRect(x0 + 260, 86, 14, 14);
      g.fillStyle = "#94a3b8";
      g.fillText("Shopee", x0 + 282, 100);
      g.fillStyle = "#2a78d6";
      g.fillRect(x0 + 380, 86, 14, 14);
      g.fillStyle = "#94a3b8";
      g.fillText("Lazada", x0 + 402, 100);
      const days = d.days.slice(-30);
      const max = Math.max(1, ...days.map((x) => x.s + x.l));
      const bw = ww / Math.max(days.length, 1);
      for (let k = 1; k <= 3; k++) {
        g.fillStyle = "#1e3a5f";
        g.fillRect(x0, y0 - (hh * k) / 3, ww, 1);
      }
      days.forEach((x, i) => {
        const bx = x0 + i * bw + bw * 0.15;
        const hs = (x.s / max) * hh;
        const hl = (x.l / max) * hh;
        g.fillStyle = "#eb6834";
        g.fillRect(bx, y0 - hs, bw * 0.7, hs);
        g.fillStyle = "#2a78d6";
        g.fillRect(bx, y0 - hs - hl, bw * 0.7, hl);
      });
      // today highlighted
      if (days.length) {
        g.strokeStyle = "#fdb927";
        g.lineWidth = 3;
        const last = days[days.length - 1];
        const th = ((last.s + last.l) / max) * hh;
        g.strokeRect(x0 + (days.length - 1) * bw + bw * 0.1, y0 - th - 4, bw * 0.8, th + 4);
      }
      g.fillStyle = "#64748b";
      g.font = "20px system-ui, sans-serif";
      g.fillText(`Peak ${formatMYR(max)} / day`, x0, y0 + 34);
    },
    1530,
    420,
  );
}
