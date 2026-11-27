/** Payout check: per-order sales vs what the marketplace pays (pure — unit-tested; used by server and browser). */

export type PayoutState = "final" | "estimate" | "waiting" | "unshipped";
export const STATE_LABEL: Record<PayoutState, string> = {
  final: "Final",
  estimate: "Estimate",
  waiting: "Waiting for payout data",
  unshipped: "Not shipped yet",
};

export interface PayoutRow {
  platform: "shopee" | "lazada";
  id: string;
  status: string;
  /** ISO time the order was placed */
  at: string;
  items: string;
  gross: number;
  /** what the marketplace pays you; null until it's known */
  net: number | null;
  /** fees by name (negative = taken off) */
  fees: Record<string, number>;
  state: PayoutState;
  /** product cost for the order (null when some items have no cost) */
  cost: number | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
const SHIPPED = new Set(["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "DELIVERED", "CONFIRMED", "IN_TRANSIT", "READY_TO_SHIP_PENDING"]);

export function payoutState(status: string, net: number | null | undefined, fees: Record<string, unknown> | null | undefined, platform: string): PayoutState {
  if (net != null) return fees && (fees as { _final?: boolean })._final ? "final" : "estimate";
  const s = status.toUpperCase();
  // Lazada posts payouts after delivery; Shopee after shipping
  if (SHIPPED.has(s) || (platform === "lazada" && /SHIPPED|DELIVERED|CONFIRMED/.test(s))) return "waiting";
  return "unshipped";
}

/** Only named fees (drops the internal _final flag). */
export function cleanFees(fees: Record<string, unknown> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(fees ?? {})) if (!k.startsWith("_") && typeof v === "number" && v) out[k] = money(v);
  return out;
}

export interface PayoutTotals {
  orders: number;
  gross: number;
  /** sales of the orders that have payout data */
  grossWithPayout: number;
  net: number;
  fees: number;
  cost: number;
  byState: Record<PayoutState, number>;
}
export function payoutTotals(rows: PayoutRow[]): PayoutTotals {
  const byState: Record<PayoutState, number> = { final: 0, estimate: 0, waiting: 0, unshipped: 0 };
  let gross = 0, grossWithPayout = 0, net = 0, cost = 0;
  for (const r of rows) {
    byState[r.state]++;
    gross += r.gross;
    if (r.net != null) {
      grossWithPayout += r.gross;
      net += r.net;
      cost += r.cost ?? 0;
    }
  }
  return { orders: rows.length, gross: money(gross), grossWithPayout: money(grossWithPayout), net: money(net), fees: money(net - grossWithPayout), cost: money(cost), byState };
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV for Excel: one row per order. */
export function payoutCsv(rows: PayoutRow[], tz = "Asia/Kuala_Lumpur"): string {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const head = ["Date", "Platform", "Order ID", "Status", "Items", "Sales (RM)", "Fees (RM)", "Payout (RM)", "Payout", "Product cost (RM)", "Profit before ads (RM)"];
  const lines = rows.map((r) => [
    day(r.at),
    r.platform === "shopee" ? "Shopee" : "Lazada",
    r.id,
    r.status,
    r.items,
    r.gross.toFixed(2),
    r.net != null ? (r.net - r.gross).toFixed(2) : "",
    r.net != null ? r.net.toFixed(2) : "",
    STATE_LABEL[r.state],
    r.cost != null ? r.cost.toFixed(2) : "",
    r.net != null && r.cost != null ? (r.net - r.cost).toFixed(2) : "",
  ]);
  return [head, ...lines].map((l) => l.map(cell).join(",")).join("\n");
}
