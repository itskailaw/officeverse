// Pure helpers for marketplace fees / returns (unit-tested).

export const money = (v: unknown) => {
  const n = Number(String(v ?? "0").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Shopee payment.get_escrow_detail → order_income. `escrow_amount` is what the seller receives.
 * Named fees are shown individually; everything else (shipping, vouchers, rebates) is "Other adjustments".
 */
export function shopeeFees(income: Record<string, unknown>, gross: number) {
  const net = money(income.escrow_amount);
  const fees: Record<string, number> = {};
  const add = (label: string, key: string) => {
    const v = money(income[key]);
    if (v) fees[label] = -Math.abs(v);
  };
  add("Commission", "commission_fee");
  add("Service fee", "service_fee");
  add("Transaction fee", "seller_transaction_fee");
  const named = Object.values(fees).reduce((s, v) => s + v, 0);
  const other = Math.round((net - gross - named) * 100) / 100;
  if (Math.abs(other) >= 0.01) fees["Other adjustments"] = other;
  return { net, fees };
}

/** Lazada finance transaction lines → per-order net payout and fees (fees are the negative lines). */
export function lazadaFeesByOrder(lines: Record<string, unknown>[]) {
  const out = new Map<string, { net: number; fees: Record<string, number> }>();
  for (const l of lines) {
    const order = String(l.order_no ?? l.order_number ?? "").trim();
    if (!order) continue;
    const amt = money(l.amount);
    const name = String(l.fee_name ?? l.transaction_type ?? "Other").trim() || "Other";
    const o = out.get(order) ?? { net: 0, fees: {} };
    o.net = Math.round((o.net + amt) * 100) / 100;
    if (amt < 0) o.fees[name] = Math.round(((o.fees[name] ?? 0) + amt) * 100) / 100;
    out.set(order, o);
  }
  return out;
}
