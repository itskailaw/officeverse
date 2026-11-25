"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, PackagePlus, Plus, Printer, Trash2 } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emptyInventory, lineAmount, monthStatement, receiptTotal, toPcs, type Inventory, type InvSku, type Receipt, type ReceiptLine, type Unit } from "@/lib/data/inventory";

const RM = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const klToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00+08:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
const inp = "h-8 rounded-md border border-slate-200 bg-panel px-2 text-xs text-slate-800";

function useInventory() {
  const saved = useOffice((s) => s.settings.inventory);
  const update = useOffice((s) => s.updateSettings);
  const inv = useMemo<Inventory>(() => saved ?? emptyInventory(), [saved]);
  const save = (next: Inventory) => update({ inventory: next });
  return { inv, save };
}

type Draft = { sku: string; qty: string; unit: Unit; price: string };
const blankLine = (): Draft => ({ sku: "", qty: "", unit: "pcs", price: "" });

/** Priya's stock-in book: record deliveries (pcs or boxes), monthly supplier invoices, SKU prices. */
export function StockIn() {
  const { inv, save } = useInventory();
  const toast = useUI((s) => s.toast);
  const [tab, setTab] = useState<"in" | "invoice" | "skus">("in");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-slate-100 px-5 py-2">
        {(
          [
            ["in", "Record stock in"],
            ["invoice", "Monthly invoice"],
            ["skus", "SKUs & prices"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium", tab === v ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100")}>
            {l}
          </button>
        ))}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "in" && <RecordIn inv={inv} save={save} toast={toast} />}
        {tab === "invoice" && <MonthlyInvoice inv={inv} save={save} />}
        {tab === "skus" && <SkuTable inv={inv} save={save} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ record stock in
function RecordIn({ inv, save, toast }: { inv: Inventory; save: (i: Inventory) => void; toast: (k: "success" | "error" | "info", t: string) => void }) {
  const [date, setDate] = useState(klToday());
  const [supplier, setSupplier] = useState(inv.suppliers[0] ?? "");
  const [ref, setRef] = useState("");
  const [lines, setLines] = useState<Draft[]>([blankLine(), blankLine(), blankLine()]);
  const skuOf = (code: string) => inv.skus.find((s) => s.sku === code);
  const calc = lines.map((l) => {
    const s = skuOf(l.sku);
    const qty = Number(l.qty);
    const pcs = l.sku && qty > 0 ? toPcs(qty, l.unit, s?.pcsPerBox) : 0;
    const price = l.price === "" ? (s?.price ?? 0) : Number(l.price);
    return { ...l, s, pcs, priceNum: Number.isFinite(price) ? price : 0 };
  });
  const filled = calc.filter((l) => l.sku && Number(l.qty) > 0);
  const total = filled.reduce((a, l) => a + (l.pcs ?? 0) * l.priceNum, 0);
  const setLine = (i: number, p: Partial<Draft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const submit = () => {
    if (!supplier.trim()) return toast("error", "Enter the supplier name");
    if (!filled.length) return toast("error", "Add at least one SKU and quantity");
    const noBox = filled.find((l) => l.pcs === null);
    if (noBox) return toast("error", `Set how many pcs are in one box of ${noBox.sku} (SKUs & prices tab), or enter it in pcs`);
    const r: Receipt = {
      id: `rc-${Date.now().toString(36)}`,
      date,
      supplier: supplier.trim(),
      ref: ref.trim() || undefined,
      lines: filled.map<ReceiptLine>((l) => ({ sku: l.sku, qty: Number(l.qty), unit: l.unit, pcs: l.pcs ?? 0, price: l.priceNum })),
    };
    // remember new suppliers and the latest price per SKU
    const suppliers = inv.suppliers.includes(r.supplier) ? inv.suppliers : [...inv.suppliers, r.supplier];
    const skus = inv.skus.map((s) => {
      const l = r.lines.find((x) => x.sku === s.sku);
      return l ? { ...s, price: l.price || s.price, supplier: s.supplier ?? r.supplier } : s;
    });
    save({ ...inv, suppliers, skus, receipts: [...inv.receipts, r] });
    toast("success", `Stock in saved — ${r.lines.reduce((a, l) => a + l.pcs, 0)} pcs from ${r.supplier} (${RM(receiptTotal(r))})`);
    setLines([blankLine(), blankLine(), blankLine()]);
    setRef("");
  };

  const recent = [...inv.receipts].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 15);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <PackagePlus className="h-4 w-4 text-sky-600" /> New stock received
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <label className="text-[11px] font-medium text-slate-600">
            Date received
            <input type="date" value={date} max={klToday()} onChange={(e) => setDate(e.target.value || klToday())} className={cn(inp, "mt-1 w-full")} />
          </label>
          <label className="text-[11px] font-medium text-slate-600">
            Supplier
            <input list="ov-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. ABC Trading" className={cn(inp, "mt-1 w-full")} />
            <datalist id="ov-suppliers">
              {inv.suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="text-[11px] font-medium text-slate-600">
            DO / invoice no. (optional)
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. DO-10233" className={cn(inp, "mt-1 w-full")} />
          </label>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-1 text-left font-medium">SKU</th>
              <th className="pb-1 text-left font-medium">Quantity</th>
              <th className="pb-1 text-left font-medium">Unit</th>
              <th className="pb-1 text-right font-medium">= Pcs</th>
              <th className="pb-1 text-right font-medium">RM / pc</th>
              <th className="pb-1 text-right font-medium">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {calc.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <select value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value, price: "" })} className={cn(inp, "w-40")}>
                    <option value="">— choose —</option>
                    {inv.skus.map((s) => (
                      <option key={s.sku} value={s.sku}>
                        {s.sku}
                        {s.name ? ` · ${s.name}` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input type="number" min={0} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className={cn(inp, "w-20")} />
                </td>
                <td className="py-1 pr-2">
                  <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                    {(["pcs", "box"] as const).map((u) => (
                      <button type="button" key={u} onClick={() => setLine(i, { unit: u })} className={cn("rounded px-2 py-0.5 text-[11px] font-medium", l.unit === u ? "bg-sky-500 text-white" : "text-slate-500")}>
                        {u}
                      </button>
                    ))}
                  </div>
                  {l.unit === "box" && l.s?.pcsPerBox ? <span className="ml-1 text-[10px] text-slate-400">({l.s.pcsPerBox}/box)</span> : null}
                </td>
                <td className={cn("py-1 pr-2 text-right tabular-nums", l.pcs === null ? "text-amber-700" : "text-slate-700")}>{l.pcs === null ? "set box size" : l.pcs || ""}</td>
                <td className="py-1 pr-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={l.price === "" ? (l.s?.price ?? "") : l.price}
                    onChange={(e) => setLine(i, { price: e.target.value })}
                    placeholder="0.00"
                    className={cn(inp, "w-20 text-right")}
                  />
                </td>
                <td className="py-1 text-right font-medium tabular-nums text-slate-900">{l.sku && Number(l.qty) > 0 && l.pcs ? RM(l.pcs * l.priceNum) : ""}</td>
                <td className="py-1 pl-1 text-right">
                  {lines.length > 1 && (
                    <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600" aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            <Plus /> Add line
          </Button>
          <span className="ml-auto text-sm font-semibold text-slate-900">Total {RM(total)}</span>
          <Button size="sm" onClick={submit}>
            <CheckCircle2 /> Save stock in
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-slate-700">Recent stock in</div>
        {!recent.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">Nothing recorded yet — save your first delivery above.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {recent.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-3 py-2 text-xs">
                <div className="w-20 shrink-0 tabular-nums text-slate-500">{new Date(`${r.date}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">
                    {r.supplier}
                    {r.ref && <span className="ml-1 font-normal text-slate-500">· {r.ref}</span>}
                  </div>
                  <div className="text-slate-600">{r.lines.map((l) => `${l.sku} ${l.unit === "box" ? `${l.qty} box (${l.pcs} pcs)` : `${l.pcs} pcs`}`).join(" · ")}</div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums text-slate-900">{RM(receiptTotal(r))}</div>
                <button
                  onClick={() => {
                    if (!confirm(`Delete the ${r.supplier} stock in on ${r.date}?`)) return;
                    save({ ...inv, receipts: inv.receipts.filter((x) => x.id !== r.id) });
                  }}
                  className="shrink-0 text-slate-300 hover:text-red-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ monthly invoice
function MonthlyInvoice({ inv, save }: { inv: Inventory; save: (i: Inventory) => void }) {
  const thisMonth = klToday().slice(0, 7);
  const months = useMemo(() => [...new Set([thisMonth, ...inv.receipts.map((r) => r.date.slice(0, 7))])].sort().reverse(), [inv.receipts, thisMonth]);
  const [month, setMonth] = useState(thisMonth);
  const used = useMemo(() => [...new Set(inv.receipts.filter((r) => r.date.startsWith(month)).map((r) => r.supplier))], [inv.receipts, month]);
  const [supplier, setSupplier] = useState("");
  const sup = supplier && used.includes(supplier) ? supplier : (used[0] ?? "");
  const st = sup ? monthStatement(inv, sup, month) : null;
  const paidKey = `${sup}|${month}`;
  const paid = inv.paid?.[paidKey];
  const company = useOffice((s) => s.companies.find((c) => c.id === "co-wgs")?.name) ?? "Water Guardian Solution";
  const skuName = (code: string) => inv.skus.find((s) => s.sku === code)?.name;

  const csv = () => {
    if (!st) return;
    const rows = [["SKU", "Description", "Pcs", "Price per pc (RM)", "Amount (RM)"], ...st.rows.map((r) => [r.sku, skuName(r.sku) ?? "", r.pcs, r.price.toFixed(2), r.amount.toFixed(2)]), ["", "", "", "Total", st.total.toFixed(2)]];
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const url = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-invoice-${sup.replace(/\W+/g, "-")}-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={inp} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <select value={sup} onChange={(e) => setSupplier(e.target.value)} className={inp} aria-label="Supplier" disabled={!used.length}>
          {!used.length && <option value="">No stock in this month</option>}
          {used.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {st && (
          <>
            <Button size="sm" variant="outline" className="ml-auto" onClick={csv}>
              <Download /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer /> Print / PDF
            </Button>
            <Button
              size="sm"
              variant={paid ? "ghost" : "default"}
              onClick={() => {
                const next = { ...(inv.paid ?? {}) };
                if (paid) delete next[paidKey];
                else next[paidKey] = klToday();
                save({ ...inv, paid: next });
              }}
            >
              <CheckCircle2 /> {paid ? `Paid ${paid} — undo` : "Mark as paid"}
            </Button>
          </>
        )}
      </div>
      {!st ? (
        <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">No stock received in {monthLabel(month)} yet.</p>
      ) : (
        <div id="ov-invoice" className="rounded-2xl bg-white p-6 text-[#0f172a] shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">Supplier statement</div>
              <div className="text-xl font-extrabold">{sup}</div>
              <div className="text-xs text-[#64748b]">
                Stock received by {company} · {monthLabel(month)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-[#64748b]">Amount to pay</div>
              <div className="text-2xl font-extrabold">{RM(st.total)}</div>
              {paid ? <div className="mt-1 inline-block rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold text-[#166534]">PAID {paid}</div> : <div className="mt-1 text-[11px] text-[#b45309]">Unpaid</div>}
            </div>
          </div>
          <table className="mt-5 w-full text-xs">
            <thead className="border-b-2 border-[#0f172a] text-[10px] uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="py-1.5 text-left font-semibold">SKU</th>
                <th className="py-1.5 text-left font-semibold">Description</th>
                <th className="py-1.5 text-right font-semibold">Pcs</th>
                <th className="py-1.5 text-right font-semibold">RM / pc</th>
                <th className="py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {st.rows.map((r) => (
                <tr key={`${r.sku}|${r.price}`}>
                  <td className="py-1.5 font-semibold">{r.sku}</td>
                  <td className="py-1.5 text-[#475569]">{skuName(r.sku) ?? ""}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.pcs.toLocaleString("en-MY")}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.price.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{r.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#0f172a]">
                <td colSpan={2} className="py-2 font-semibold">
                  Total
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">{st.pcs.toLocaleString("en-MY")}</td>
                <td />
                <td className="py-2 text-right text-sm font-extrabold tabular-nums">{RM(st.total)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="mt-5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">Deliveries this month</div>
            <table className="w-full text-[11px] text-[#475569]">
              <tbody>
                {st.receipts.map((r) => (
                  <tr key={r.id}>
                    <td className="w-24 py-0.5">{new Date(`${r.date}T12:00:00+08:00`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td className="py-0.5">{r.ref ?? "—"}</td>
                    <td className="py-0.5">{r.lines.map((l) => `${l.sku} ×${l.pcs}`).join(", ")}</td>
                    <td className="py-0.5 text-right tabular-nums">{RM(receiptTotal(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 text-[10px] text-[#94a3b8]">Prepared by Priya (Inventory) · OfficeVerse · {new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ SKUs & prices
function SkuTable({ inv, save }: { inv: Inventory; save: (i: Inventory) => void }) {
  const [newSku, setNewSku] = useState("");
  const patch = (sku: string, p: Partial<InvSku>) => save({ ...inv, skus: inv.skus.map((s) => (s.sku === sku ? { ...s, ...p } : s)) });
  const num = (v: string) => (v === "" ? undefined : Math.max(0, Number(v)));
  const thisMonth = klToday().slice(0, 7);
  const inMonth = new Map<string, number>();
  for (const r of inv.receipts) if (r.date.startsWith(thisMonth)) for (const l of r.lines) inMonth.set(l.sku, (inMonth.get(l.sku) ?? 0) + l.pcs);
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">Set the supplier price per piece and how many pieces come in a box. Prices fill in automatically when you record stock in (and update to the latest price you enter there).</p>
      <table className="w-full text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="pb-1 text-left font-medium">SKU</th>
            <th className="pb-1 text-left font-medium">Description</th>
            <th className="pb-1 text-left font-medium">Pcs per box</th>
            <th className="pb-1 text-left font-medium">RM per pc</th>
            <th className="pb-1 text-left font-medium">Usual supplier</th>
            <th className="pb-1 text-right font-medium">In this month</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {inv.skus.map((s) => (
            <tr key={s.sku}>
              <td className="py-1.5 pr-2 font-semibold text-slate-900">{s.sku}</td>
              <td className="py-1.5 pr-2">
                <input defaultValue={s.name ?? ""} onBlur={(e) => e.target.value !== (s.name ?? "") && patch(s.sku, { name: e.target.value || undefined })} placeholder="optional" className={cn(inp, "w-44")} />
              </td>
              <td className="py-1.5 pr-2">
                <input type="number" min={1} defaultValue={s.pcsPerBox ?? ""} onBlur={(e) => patch(s.sku, { pcsPerBox: num(e.target.value) })} placeholder="—" className={cn(inp, "w-20")} />
              </td>
              <td className="py-1.5 pr-2">
                <input type="number" min={0} step="0.01" defaultValue={s.price ?? ""} onBlur={(e) => patch(s.sku, { price: num(e.target.value) })} placeholder="0.00" className={cn(inp, "w-24")} />
              </td>
              <td className="py-1.5 pr-2">
                <input list="ov-suppliers-2" defaultValue={s.supplier ?? ""} onBlur={(e) => e.target.value !== (s.supplier ?? "") && patch(s.sku, { supplier: e.target.value || undefined })} className={cn(inp, "w-36")} />
              </td>
              <td className="py-1.5 text-right tabular-nums text-slate-600">{inMonth.get(s.sku) ?? "—"}</td>
              <td className="py-1.5 pl-1 text-right">
                <button
                  onClick={() => {
                    if (inv.receipts.some((r) => r.lines.some((l) => l.sku === s.sku))) return alert("This SKU has stock-in records, so it can't be removed.");
                    save({ ...inv, skus: inv.skus.filter((x) => x.sku !== s.sku) });
                  }}
                  className="text-slate-300 hover:text-red-600"
                  aria-label={`Remove ${s.sku}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="ov-suppliers-2">
        {inv.suppliers.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <div className="flex items-center gap-2">
        <input value={newSku} onChange={(e) => setNewSku(e.target.value.toUpperCase())} placeholder="New SKU" className={cn(inp, "w-40")} />
        <Button
          size="sm"
          variant="outline"
          disabled={!newSku.trim() || inv.skus.some((s) => s.sku === newSku.trim())}
          onClick={() => {
            save({ ...inv, skus: [...inv.skus, { sku: newSku.trim() }] });
            setNewSku("");
          }}
        >
          <Plus /> Add SKU
        </Button>
      </div>
    </div>
  );
}
