/** Stock-in records and monthly supplier invoices (pure — unit-tested; used in the browser). */

export type Unit = "pcs" | "box";
export interface InvSku {
  sku: string;
  /** what it is (optional) */
  name?: string;
  /** pieces in one box, so quantities can be entered by the box */
  pcsPerBox?: number;
  /** supplier price per piece, RM */
  price?: number;
  /** usual supplier */
  supplier?: string;
}
export interface ReceiptLine {
  sku: string;
  qty: number;
  unit: Unit;
  /** pieces received (qty × pcs per box for boxes) */
  pcs: number;
  /** price per piece at the time, RM */
  price: number;
}
export interface Receipt {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  supplier: string;
  /** supplier's DO / invoice number */
  ref?: string;
  note?: string;
  lines: ReceiptLine[];
}
export interface Inventory {
  skus: InvSku[];
  suppliers: string[];
  receipts: Receipt[];
  /** "supplier|YYYY-MM" → date paid */
  paid?: Record<string, string>;
}

export const DEFAULT_SKUS = [
  "WF", "WFR", "WFAC", "WFPPC", "ADAPTER", "EXTENSION", "WT", "WTR", "WTPPC", "WTST", "MB", "MBST", "SG", "SH", "SHR",
  "AF", "AFR", "JF", "JFP", "HSH", "UMB", "WFJ", "WFJR", "SEAL TAPE", "HOSE 2.0", "HOSE 3.0",
  "MDBC BOX (BIG)", "MDBC BOX (MEDIUM)", "MDBC BOX (SMALL)",
];

export const emptyInventory = (): Inventory => ({ skus: DEFAULT_SKUS.map((sku) => ({ sku })), suppliers: [], receipts: [] });

/** Pieces for a quantity entered in pcs or boxes (null when boxes but the box size isn't set). */
export function toPcs(qty: number, unit: Unit, pcsPerBox?: number): number | null {
  if (!(qty > 0)) return 0;
  if (unit === "pcs") return Math.round(qty);
  return pcsPerBox && pcsPerBox > 0 ? Math.round(qty * pcsPerBox) : null;
}

export const money = (n: number) => Math.round(n * 100) / 100;
export const lineAmount = (l: Pick<ReceiptLine, "pcs" | "price">) => money(l.pcs * l.price);
export const receiptTotal = (r: Receipt) => money(r.lines.reduce((a, l) => a + lineAmount(l), 0));

export interface StatementRow {
  sku: string;
  pcs: number;
  price: number;
  amount: number;
}
/**
 * A supplier's statement for a month: every stock-in line, grouped by SKU and price
 * (the same SKU at two prices stays as two rows), plus the deliveries and the total to pay.
 */
export function monthStatement(inv: Inventory, supplier: string, month: string) {
  const receipts = inv.receipts.filter((r) => r.supplier === supplier && r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const rows = new Map<string, StatementRow>();
  for (const r of receipts)
    for (const l of r.lines) {
      const k = `${l.sku}|${l.price}`;
      const row = rows.get(k) ?? { sku: l.sku, pcs: 0, price: l.price, amount: 0 };
      row.pcs += l.pcs;
      row.amount = money(row.pcs * row.price);
      rows.set(k, row);
    }
  const order = new Map(inv.skus.map((s, i) => [s.sku, i]));
  const list = [...rows.values()].sort((a, b) => (order.get(a.sku) ?? 999) - (order.get(b.sku) ?? 999) || a.price - b.price);
  return { receipts, rows: list, total: money(list.reduce((a, r) => a + r.amount, 0)), pcs: list.reduce((a, r) => a + r.pcs, 0) };
}

/** Pieces received per SKU in a date range (inclusive YYYY-MM-DD). */
export function receivedBySku(inv: Inventory, from: string, to: string) {
  const m = new Map<string, number>();
  for (const r of inv.receipts) if (r.date >= from && r.date <= to) for (const l of r.lines) m.set(l.sku, (m.get(l.sku) ?? 0) + l.pcs);
  return m;
}
