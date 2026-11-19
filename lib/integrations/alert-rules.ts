// Pure alert rules (unit-tested): what to send now, and the updated "already sent" state.

export interface AlertState {
  /** alert key → ISO time it was sent */
  sent: Record<string, string>;
  /** first run seeds existing returns without alerting */
  seeded?: boolean;
}
export interface AlertInput {
  now: number;
  urgent: { platform: "shopee" | "lazada"; id: string; shipBy: string }[];
  shopeeAdBalance: number | null;
  adThreshold: number;
  cancelledToday: number;
  returns: { platform: "shopee" | "lazada"; id: string; items: string; reason: string | null; refund: number; requestedAt: string | null }[];
  returnsAvailable: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const klDate = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const klHour = (t: number) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(new Date(t)));
const klTime = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" });
const NAME = { shopee: "Shopee", lazada: "Lazada" } as const;

export function decideAlerts(input: AlertInput, prev: AlertState | undefined) {
  const sent: Record<string, string> = {};
  // keep a week of history
  for (const [k, v] of Object.entries(prev?.sent ?? {})) if (input.now - Date.parse(v) < 7 * 86400 * 1000) sent[k] = v;
  const at = new Date(input.now).toISOString();
  const quiet = klHour(input.now) >= 23 || klHour(input.now) < 7;
  const messages: string[] = [];
  let seeded = prev?.seeded ?? false;

  // 1. urgent parcels (always, even in quiet hours)
  const fresh = input.urgent.filter((u) => !sent[`ship:${u.platform}:${u.id}`]);
  if (fresh.length) {
    const by = (["shopee", "lazada"] as const).map((p) => [p, fresh.filter((u) => u.platform === p).length] as const).filter(([, n]) => n);
    const first = fresh.map((u) => u.shipBy).sort()[0];
    messages.push(
      `⏰ <b>${fresh.length} parcel${fresh.length > 1 ? "s" : ""} must ship within 6 hours</b>\n` +
        by.map(([p, n]) => `• ${NAME[p]}: ${n}`).join("\n") +
        (first ? `\nEarliest deadline: ${klTime(first)}` : ""),
    );
    for (const u of fresh) sent[`ship:${u.platform}:${u.id}`] = at;
  }

  if (!quiet) {
    // 2. Shopee ads balance running low (once a day)
    const day = klDate(input.now);
    if (input.shopeeAdBalance != null && input.shopeeAdBalance < input.adThreshold && !sent[`adlow:${day}`]) {
      messages.push(`📣 <b>Shopee Ads balance is low: RM ${input.shopeeAdBalance.toFixed(2)}</b>\nTop up soon so your ads keep running (alert below RM ${input.adThreshold}).`);
      sent[`adlow:${day}`] = at;
    }
    // 3. cancellation spike (at 3, 5 and 10 in a day)
    for (const n of [10, 5, 3]) {
      if (input.cancelledToday >= n) {
        const k = `cancel:${day}:${n}`;
        if (!sent[k]) {
          messages.push(`❌ <b>${input.cancelledToday} orders cancelled today</b>\nWorth checking the reasons in Seller Centre (stock, price or delivery issues?).`);
          for (const m of [3, 5, 10]) if (m <= n) sent[`cancel:${day}:${m}`] = at;
        }
        break;
      }
    }
    // 4. new return / refund requests
    if (input.returnsAvailable) {
      const newReturns = input.returns.filter((r) => !sent[`ret:${r.platform}:${r.id}`]);
      if (!seeded) {
        for (const r of newReturns) sent[`ret:${r.platform}:${r.id}`] = at; // don't alert old requests on the first run
        seeded = true;
      } else if (newReturns.length) {
        messages.push(
          `↩️ <b>${newReturns.length} new return / refund request${newReturns.length > 1 ? "s" : ""}</b>\n` +
            newReturns
              .slice(0, 5)
              .map((r) => `• ${NAME[r.platform]}: ${esc(r.items || "item")}${r.reason ? ` — ${esc(r.reason.slice(0, 80))}` : ""}${r.refund ? ` (RM ${r.refund.toFixed(2)})` : ""}`)
              .join("\n") +
            `\nMei Ling can review them: Dashboard → Returns → Ask Mei Ling.`,
        );
        for (const r of newReturns) sent[`ret:${r.platform}:${r.id}`] = at;
      }
    }
  }
  return { messages, state: { sent, seeded } as AlertState };
}
