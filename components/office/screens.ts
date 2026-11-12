"use client";

import type { Company } from "@/lib/data/types";
import { demoEcommerce, formatMYR } from "@/lib/data/demo";
import { makeScreenTexture } from "./materials";

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

/** CEO office performance wall. Shows demo values only in demo mode. */
export function perfScreenTexture(demoMode: boolean) {
  return makeScreenTexture((g, w, h) => {
    header(g, w, "Business Performance", "Water Guardian Solution · MYR · Asia/Kuala_Lumpur");
    if (!demoMode) {
      pill(g, w - 40, 44, "NO LIVE DATA", "#475569", "#f8fafc");
      g.fillStyle = "#cbd5e1";
      g.font = "600 44px system-ui, sans-serif";
      g.fillText("Data Unavailable", 48, 260);
      g.font = "28px system-ui, sans-serif";
      g.fillStyle = "#94a3b8";
      g.fillText("No marketplace integration is connected yet.", 48, 310);
      g.fillText("Connect Shopee / Lazada or import CSV in Phase 3.", 48, 350);
      return;
    }
    const d = demoEcommerce();
    pill(g, w - 40, 44, "DEMO DATA", "#fbbf24");
    const kpis = [
      ["Today", formatMYR(d.today.shopee + d.today.lazada)],
      ["Month to date", formatMYR(d.mtd)],
      ["Parcels to pack", String(d.parcels.shopee + d.parcels.lazada)],
    ];
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
    // trend
    const vals = d.days.map((x) => x.shopee + x.lazada);
    const max = Math.max(...vals);
    const min = Math.min(...vals) * 0.8;
    const x0 = 48;
    const y0 = 520;
    const cw = w - 96;
    const ch = 200;
    g.strokeStyle = "#38bdf8";
    g.lineWidth = 5;
    g.beginPath();
    vals.forEach((v, i) => {
      const x = x0 + (i / (vals.length - 1)) * cw;
      const y = y0 - ((v - min) / (max - min)) * ch;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    g.lineTo(x0 + cw, y0);
    g.lineTo(x0, y0);
    g.fillStyle = "rgba(56,189,248,0.15)";
    g.fill();
    g.fillStyle = "#64748b";
    g.font = "22px system-ui, sans-serif";
    g.fillText("30-day revenue (sample)", x0, y0 + 36);
  });
}

export function receptionTexture(companies: Company[]) {
  return makeScreenTexture((g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#0f1f36");
    grad.addColorStop(1, "#1e3a5f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
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
