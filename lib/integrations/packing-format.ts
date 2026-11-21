/** Pure helpers for the daily packing-list email (no server imports — unit tested). */

export interface PackingSettings {
  enabled: boolean;
  /** "HH:MM", Malaysia time */
  time: string;
  to: string;
  paper?: "thermal" | "a6" | "a5" | "a4" | "original";
  /** daily: once a day at `time`; instant: right after Farid confirms new orders */
  mode?: "daily" | "instant";
}
export interface PackLine {
  platform: "shopee" | "lazada";
  id: string;
  tracking: string | null;
  items: { name: string; model: string | null; qty: number }[];
  /** emailed before and still not shipped: first emailed at, ship-by deadline */
  overdue?: { since: string; shipBy: string | null };
}

const KL = "Asia/Kuala_Lumpur";
export const klDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: KL, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const klHM = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: KL, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Is today's scheduled email due? `today` = today's automatic attempts (newest first). */
export function packingDue(now: Date, s: Pick<PackingSettings, "enabled" | "time" | "to" | "mode"> | null | undefined, today: { status: string; sent_at: string }[]): boolean {
  if (!s?.enabled || !s.to || !/^\d{2}:\d{2}$/.test(s.time) || s.mode === "instant") return false;
  if (klHM(now) < s.time) return false;
  const mine = today.filter((r) => klDate(new Date(r.sent_at)) === klDate(now));
  if (mine.some((r) => r.status === "sent" || r.status === "empty")) return false;
  // one in progress (another scheduler run) — leave it, unless it got stuck
  if (mine.some((r) => r.status === "sending" && now.getTime() - Date.parse(r.sent_at) < 15 * 60_000)) return false;
  // give up for the day after 3 failures (the owner is told each time)
  return mine.filter((r) => r.status === "failed").length < 3;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const NAME = { shopee: "Shopee", lazada: "Lazada" } as const;
const COLOR = { shopee: "#eb6834", lazada: "#2a78d6" } as const;

const fmt = (iso: string, withTime = false) =>
  new Intl.DateTimeFormat("en-MY", { timeZone: KL, day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) }).format(new Date(iso));

export function packingSubject(lines: PackLine[], now = new Date()) {
  const d = new Intl.DateTimeFormat("en-MY", { timeZone: KL, day: "numeric", month: "short" }).format(now);
  const n = lines.length;
  const late = lines.filter((l) => l.overdue).length;
  const items = lines.reduce((a, l) => a + l.items.reduce((b, i) => b + i.qty, 0), 0);
  return late
    ? `Packing list ${d} — ${n - late} new + ${late} not shipped yet (${items} items)`
    : `Packing list ${d} — ${n} parcel${n === 1 ? "" : "s"} (${items} items)`;
}

/** Email body: numbered parcels in the same order as the attached airway bills, plus a pick-list total. */
export function packingHtml(lines: PackLine[], opts: { from?: string; problems?: string[]; separate?: "shopee" | "lazada" | null; appUrl?: string } = {}) {
  const totals = new Map<string, number>();
  for (const l of lines) for (const i of l.items) {
    const k = i.model ? `${i.name} — ${i.model}` : i.name;
    totals.set(k, (totals.get(k) ?? 0) + i.qty);
  }
  const pick = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const firstSep = opts.separate ? lines.findIndex((l) => l.platform === opts.separate) : -1;
  const rows = lines
    .map((l, i) => {
      const late = l.overdue;
      const sectionHead =
        late && i === 0
          ? `<tr><td colspan="3" style="padding:12px 8px 4px;font:700 12px sans-serif;color:#b91c1c;text-transform:uppercase;letter-spacing:.04em">⚠️ Not shipped yet — pack these first</td></tr>`
          : !late && i > 0 && lines[i - 1].overdue
            ? `<tr><td colspan="3" style="padding:14px 8px 4px;font:700 12px sans-serif;color:#0f766e;text-transform:uppercase;letter-spacing:.04em">New orders</td></tr>`
            : "";
      const head =
        sectionHead +
        (i === firstSep
          ? `<tr><td colspan="3" style="padding:14px 8px 4px;font:600 11px sans-serif;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${NAME[l.platform]} labels — separate attachment</td></tr>`
          : "");
      const items = l.items.length
        ? l.items.map((it) => `<div><b>${it.qty}×</b> ${esc(it.name)}${it.model ? ` <span style="color:#64748b">— ${esc(it.model)}</span>` : ""}</div>`).join("")
        : `<div style="color:#94a3b8">Items not synced — check the label</div>`;
      return `${head}<tr style="border-top:1px solid #e2e8f0">
<td style="padding:10px 8px;vertical-align:top;width:34px"><div style="width:30px;height:30px;border-radius:7px;background:${late ? "#b91c1c" : "#0f172a"};color:#fff;font:700 15px sans-serif;text-align:center;line-height:30px">${i + 1}</div></td>
<td style="padding:10px 8px;vertical-align:top;white-space:nowrap;font:12px sans-serif;color:#334155"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLOR[l.platform]}"></span> <b>${NAME[l.platform]}</b><br><span style="font-family:monospace;color:#64748b">#${esc(l.id)}</span>${l.tracking ? `<br><span style="font-family:monospace;font-size:11px;color:#64748b">AWB ${esc(l.tracking)}</span>` : ""}${late ? `<br><span style="display:inline-block;margin-top:3px;padding:1px 6px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600">Not shipped · since ${fmt(late.since)}${late.shipBy ? ` · ship by ${fmt(late.shipBy, true)}` : ""}</span>` : ""}</td>
<td style="padding:10px 8px;vertical-align:top;font:14px/1.45 sans-serif;color:#0f172a">${items}</td></tr>`;
    })
    .join("");
  const problems = opts.problems?.length
    ? `<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font:12px sans-serif"><b>Not included (${opts.problems.length}):</b><br>${opts.problems.map(esc).join("<br>")}</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:16px">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:14px;padding:20px">
<div style="font:600 18px sans-serif;color:#0f172a">📦 Packing list — ${lines.length} parcel${lines.length === 1 ? "" : "s"}</div>
<div style="font:13px sans-serif;color:#64748b;margin-top:4px">Same order as the attached airway bills: #1 is the first page.${opts.from ? ` — ${esc(opts.from)}` : ""}</div>
${problems}
<div style="margin-top:14px;padding:10px 12px;border-radius:8px;background:#f8fafc;font:13px/1.6 sans-serif;color:#0f172a"><b>Pick list</b><br>${pick.map(([k, q]) => `<b>${q}×</b> ${esc(k)}`).join("<br>")}</div>
<table style="width:100%;border-collapse:collapse;margin-top:12px">${rows}</table>
${opts.appUrl ? `<div style="margin-top:16px;font:12px sans-serif"><a href="${esc(opts.appUrl)}" style="color:#0369a1">Open OfficeVerse</a> to tick parcels off as you pack.</div>` : ""}
</div></body></html>`;
}

export function packingText(lines: PackLine[]) {
  return lines
    .map((l, i) => `${i + 1}. ${l.overdue ? "[NOT SHIPPED YET] " : ""}${NAME[l.platform]} #${l.id}${l.tracking ? ` (AWB ${l.tracking})` : ""}\n${l.items.map((it) => `   ${it.qty}x ${it.name}${it.model ? ` — ${it.model}` : ""}`).join("\n")}`)
    .join("\n\n");
}
