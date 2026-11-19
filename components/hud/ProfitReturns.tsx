"use client";

import { useMemo, useState } from "react";
import { Bot, Calculator, RotateCcw, TrendingUp } from "lucide-react";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import type { LiveSummary, ProfitFigures } from "@/lib/integrations/client";
import { enqueueTask } from "@/lib/ai/runner";
import { formatMYR } from "@/lib/data/demo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, timeAgo } from "@/lib/utils";

type Plat = "shopee" | "lazada";
const DOT: Record<Plat, string> = { shopee: "#eb6834", lazada: "#2a78d6" };

function Line({ label, value, neg, strong, note }: { label: string; value: number; neg?: boolean; strong?: boolean; note?: string | null }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2 py-1 text-xs", strong && "border-t border-slate-200 pt-2 text-sm")}>
      <span className={cn("text-slate-600", strong && "font-semibold text-slate-900")}>
        {label}
        {note && <span className="ml-1.5 text-[10px] text-slate-400">{note}</span>}
      </span>
      <span className={cn("tabular-nums", strong ? "font-bold" : "font-medium", neg ? "text-red-600" : strong ? (value >= 0 ? "text-emerald-700" : "text-red-600") : "text-slate-800")}>
        {neg && value > 0 ? "−" : ""}
        {formatMYR(Math.abs(value), 2)}
      </span>
    </div>
  );
}

/** Month-to-date profit: marketplace payout → product cost → ad spend → estimated profit. */
export function ProfitPanel({ s, view }: { s: LiveSummary; view: "all" | Plat }) {
  const [costsOpen, setCostsOpen] = useState(false);
  const p = s.profit;
  const f: ProfitFigures | undefined = p ? (view === "all" ? p.total : p.byPlatform[view]) : undefined;
  const fees = f ? Object.entries(f.feeBreakdown).sort((a, b) => a[1] - b[1]).slice(0, 4) : [];
  return (
    <div className="rounded-xl border border-slate-200 bg-panel p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <TrendingUp className="h-3.5 w-3.5" /> Profit — month to date{view !== "all" ? ` · ${view === "shopee" ? "Shopee" : "Lazada"}` : ""}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setCostsOpen(true)}>
          <Calculator /> Product costs{p?.costsEntered ? ` (${p.costsEntered})` : ""}
        </Button>
      </div>
      {!p ? (
        <p className="py-3 text-xs text-slate-500">Run the 0005 database update in Supabase (SQL Editor) to start tracking marketplace fees and payouts.</p>
      ) : !f || !f.ordersWithFees ? (
        <p className="py-3 text-xs text-slate-500">
          Waiting for payout data — it appears as orders ship (Shopee) or once Lazada posts the transactions. {f?.ordersTotal ? `${f.ordersTotal} orders this month so far.` : ""}
        </p>
      ) : (
        <>
          <Line label="Sales (orders with payout data)" value={f.gross} note={`${f.ordersWithFees}/${f.ordersTotal} orders`} />
          <Line label="Marketplace fees" value={-f.fees} neg />
          {fees.length > 0 && (
            <div className="-mt-0.5 mb-1 pl-3 text-[10px] text-slate-400">{fees.map(([k, v]) => `${k} ${formatMYR(Math.abs(v), 2)}`).join(" · ")}</div>
          )}
          <Line label="Net payout" value={f.net} />
          <Line
            label="Product cost"
            value={f.productCost}
            neg
            note={p.costsEntered ? `${Math.round(f.costCoverage * 100)}% of units costed` : "enter costs →"}
          />
          <Line label="Ad spend" value={f.adSpend} neg note={view === "shopee" ? "not tracked yet" : "Lazada only"} />
          <Line label="Estimated profit" value={f.estProfit} strong note={f.margin != null ? `${f.margin}% margin` : null} />
          {!p.costsEntered && <p className="mt-1 text-[10px] text-amber-700">Add your product costs to see a real profit figure.</p>}
        </>
      )}
      <ProductCostsDialog s={s} open={costsOpen} onOpenChange={setCostsOpen} />
    </div>
  );
}

function ProductCostsDialog({ s, open, onOpenChange }: { s: LiveSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const saved = useOffice((x) => x.settings.productCosts);
  const update = useOffice((x) => x.updateSettings);
  const toast = useUI((x) => x.toast);
  const names = useMemo(() => {
    const set = new Set<string>(Object.keys(saved ?? {}));
    for (const b of s.bestSellers30d) set.add(b.name);
    for (const p of ["shopee", "lazada"] as const) for (const b of s.byPlatform?.[p]?.bestSellers30d ?? []) set.add(b.name);
    return [...set];
  }, [s, saved]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (n: string) => draft[n] ?? (saved?.[n] != null ? String(saved[n]) : "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Product costs" description="What one unit costs you (stock + packaging), in RM. Used only for the estimated profit." className="max-w-lg">
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {!names.length && <p className="text-xs text-slate-500">No products sold in the last 30 days yet.</p>}
          {names.map((n) => (
            <label key={n} className="flex items-center gap-3 text-xs">
              <span className="flex-1 text-slate-700">{n}</span>
              <span className="text-slate-400">RM</span>
              <Input
                className="h-8 w-24 text-right"
                inputMode="decimal"
                value={val(n)}
                placeholder="0.00"
                onChange={(e) => setDraft((d) => ({ ...d, [n]: e.target.value.replace(/[^0-9.]/g, "") }))}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const next: Record<string, number> = { ...(saved ?? {}) };
              for (const n of names) {
                const v = Number(val(n));
                if (Number.isFinite(v) && v > 0) next[n] = Math.round(v * 100) / 100;
                else delete next[n];
              }
              update({ productCosts: next });
              setDraft({});
              onOpenChange(false);
              toast("success", "Product costs saved — profit updates on the next refresh.");
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Return / refund requests with a shortcut to Mei Ling. */
export function ReturnsPanel({ s, view }: { s: LiveSummary; view: "all" | Plat }) {
  const r = s.returns;
  const toast = useUI((x) => x.toast);
  const assign = useOffice((x) => x.assignTask);
  const mei = useOffice((x) => x.employees.find((e) => e.id === "emp-cs" && e.active));
  const rows = (r?.recent ?? []).filter((x) => view === "all" || x.platform === view);
  const open = view === "all" ? (r?.open ?? 0) : (r?.byPlatform[view]?.open ?? 0);
  const last30 = view === "all" ? (r?.last30 ?? 0) : (r?.byPlatform[view]?.last30 ?? 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <RotateCcw className="h-3.5 w-3.5" /> Returns &amp; refunds
          {r?.available && (
            <span className={cn("ml-1 rounded-full px-1.5 text-[10px] font-bold", open ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500")}>{open} open</span>
          )}
        </div>
        {mei && r?.available && open > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => {
              const res = assign({
                employeeId: mei.id,
                title: "Review open return & refund requests",
                instructions:
                  "Use get_business_metrics (returns) to review every open return/refund request. For each: summarise the reason, check for patterns (same product / same defect), recommend accept or dispute with a short reason, and draft a polite reply to the buyer. Submit each buyer reply with request_approval (customer_message). Do not promise refunds.",
                priority: "high",
              });
              if (res.ok && res.id) {
                enqueueTask(res.id);
                toast("success", "Mei Ling is reviewing the returns");
              }
            }}
          >
            <Bot /> Ask Mei Ling
          </Button>
        )}
      </div>
      {!r?.available ? (
        <p className="py-3 text-xs text-slate-500">Run the 0005 database update in Supabase (SQL Editor); returns then sync with your orders.</p>
      ) : !rows.length ? (
        <p className="py-3 text-xs text-slate-500">No return or refund requests in the last 60 days. 🎉</p>
      ) : (
        <>
          <div className="mb-1 text-[11px] text-slate-500">
            {last30} in the last 30 days{view === "all" ? ` · refunds ${formatMYR(r.refund30, 2)}` : ""}
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((x) => (
              <div key={`${x.platform}-${x.id}`} className={cn("rounded-lg border p-2 text-xs", x.open ? "border-amber-200 bg-amber-50/60" : "border-slate-100")}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[x.platform] }} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{x.items || `Order ${x.orderId ?? ""}`}</span>
                  {x.refund > 0 && <span className="tabular-nums text-slate-700">{formatMYR(x.refund, 2)}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 pl-4 text-[10px] text-slate-500">
                  <span className={cn("rounded px-1 font-semibold", x.open ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{x.status.replace(/_/g, " ").toLowerCase()}</span>
                  {x.reason && <span className="truncate">{x.reason}</span>}
                  {x.requestedAt && <span>{timeAgo(x.requestedAt)}</span>}
                  {x.dueAt && x.open && <span className="font-medium text-red-600">respond by {new Date(x.dueAt).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
