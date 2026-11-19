"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, PackageCheck, Printer, RefreshCw, XCircle } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { formatMYR } from "@/lib/data/demo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

type Plat = "shopee" | "lazada";
interface Order {
  platform: Plat;
  id: string;
  stage: "process" | "ship";
  status: string;
  amount: number;
  orderedAt: string;
  paidAt: string;
  paidKnown: boolean;
  shipBy: string | null;
  items: { name: string; model: string | null; qty: number }[];
}
const NAME: Record<Plat, string> = { shopee: "Shopee", lazada: "Lazada" };

type Sort = "paid" | "paid-new" | "oldest" | "newest" | "deadline" | "amount";
const SORTS: { v: Sort; label: string }[] = [
  { v: "paid", label: "Paid — oldest first" },
  { v: "paid-new", label: "Paid — newest first" },
  { v: "oldest", label: "Order time — oldest first" },
  { v: "newest", label: "Order time — newest first" },
  { v: "deadline", label: "Ship-by deadline (most urgent)" },
  { v: "amount", label: "Amount (highest first)" },
];
const SORT_KEY = "ov:fulfil-sort-v2";
function readSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY) as Sort | null;
    return v && SORTS.some((x) => x.v === v) ? v : "paid";
  } catch {
    return "paid";
  }
}
type Paper = "original" | "a5" | "a6" | "a4" | "thermal";
const PAPERS: { v: Paper; label: string }[] = [
  { v: "thermal", label: "A6 thermal label (100×150 mm)" },
  { v: "a6", label: "A6 paper (105×148 mm)" },
  { v: "a5", label: "A5" },
  { v: "a4", label: "A4" },
  { v: "original", label: "As sent by marketplace" },
];
function readPaper(): Paper {
  try {
    const v = localStorage.getItem("ov:label-paper-v2") as Paper | null;
    return v && PAPERS.some((x) => x.v === v) ? v : "thermal";
  } catch {
    return "thermal";
  }
}
const t = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
const DOT: Record<Plat, string> = { shopee: "#eb6834", lazada: "#2a78d6" };

function due(shipBy: string | null) {
  if (!shipBy) return null;
  const h = (Date.parse(shipBy) - Date.now()) / 3600000;
  const label = new Date(shipBy).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return { label, urgent: h < 24, late: h < 0 };
}

/** To process → arrange drop-off; To ship → print shipping labels. Owner only. */
export function Fulfilment() {
  const open = useUI((s) => s.dialog === "fulfil");
  const stage = useUI((s) => s.fulfilStage);
  const set = useUI((s) => s.set);
  const toast = useUI((s) => s.toast);
  const role = useLive((s) => s.status?.role);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [sort, setSort] = useState<Sort>(readSort);
  const [paper, setPaper] = useState<Paper>(readPaper);
  const choosePaper = (v: Paper) => {
    setPaper(v);
    try {
      localStorage.setItem("ov:label-paper-v2", v);
    } catch {}
  };
  const [justArranged, setJustArranged] = useState<{ platform: Plat; id: string }[]>([]);
  const chooseSort = (v: Sort) => {
    setSort(v);
    try {
      localStorage.setItem(SORT_KEY, v);
    } catch {}
  };

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch("/api/fulfil/orders", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setOrders(j.orders);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    if (open) {
      setSel(new Set());
      setResults({});
      setJustArranged([]);
      void load();
    }
  }, [open, load]);

  const list = useMemo(() => {
    const l = (orders ?? []).filter((o) => o.stage === stage);
    const cmp: Record<Sort, (a: Order, b: Order) => number> = {
      paid: (a, b) => t(a.paidAt) - t(b.paidAt),
      "paid-new": (a, b) => t(b.paidAt) - t(a.paidAt),
      oldest: (a, b) => t(a.orderedAt) - t(b.orderedAt),
      newest: (a, b) => t(b.orderedAt) - t(a.orderedAt),
      deadline: (a, b) => t(a.shipBy) - t(b.shipBy) || t(a.orderedAt) - t(b.orderedAt),
      amount: (a, b) => b.amount - a.amount,
    };
    return [...l].sort(cmp[sort]);
  }, [orders, stage, sort]);
  const key = (o: Order) => `${o.platform}:${o.id}`;
  const chosen = list.filter((o) => sel.has(key(o)));
  const toggle = (o: Order) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(key(o))) n.delete(key(o));
      else n.add(key(o));
      return n;
    });

  const arrange = async () => {
    if (!chosen.length) return;
    if (!confirm(`Arrange DROP-OFF for ${chosen.length} order${chosen.length > 1 ? "s" : ""}? This updates your store on Shopee/Lazada — you then drop the parcels at the courier.`)) return;
    setBusy("ship");
    const res: Record<string, { ok: boolean; message: string }> = {};
    for (const p of ["shopee", "lazada"] as Plat[]) {
      const ids = chosen.filter((o) => o.platform === p).map((o) => o.id);
      if (!ids.length) continue;
      try {
        const r = await fetch("/api/fulfil/ship", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: p, orderIds: ids }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
        for (const x of j.results as { orderId: string; ok: boolean; message: string }[]) res[`${p}:${x.orderId}`] = x;
      } catch (e) {
        for (const id of ids) res[`${p}:${id}`] = { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    }
    setResults(res);
    const ok = Object.entries(res).filter(([, v]) => v.ok);
    setJustArranged(ok.map(([k]) => ({ platform: k.split(":")[0] as Plat, id: k.split(":").slice(1).join(":") })));
    if (ok.length) useOffice.getState().recordAudit("arrange_shipment", "order", null, `Drop-off arranged: ${ok.map(([k]) => k).join(", ")}`);
    toast(ok.length === Object.keys(res).length ? "success" : "error", `${ok.length} of ${Object.keys(res).length} arranged${ok.length ? " — print the labels under To ship" : ""}`);
    setBusy(null);
    setSel(new Set());
    await load();
    void useLive.getState().loadSummary();
  };

  const print = () => printFor(chosen.map((o) => ({ platform: o.platform, id: o.id })));
  const printFor = async (targets: { platform: Plat; id: string }[]) => {
    if (!targets.length) return;
    setBusy("print");
    for (const p of ["shopee", "lazada"] as Plat[]) {
      const ids = targets.filter((o) => o.platform === p).map((o) => o.id);
      if (!ids.length) continue;
      // open the tab first (popup blockers), then fill it with the PDF
      const tab = window.open("", "_blank");
      try {
        const r = await fetch("/api/fulfil/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: p, orderIds: ids, paper }) });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${r.status})`);
        let problems: string[] = [];
        try {
          problems = JSON.parse(decodeURIComponent(r.headers.get("X-OV-Problems") ?? "%5B%5D"));
        } catch {}
        if (problems.length) toast("error", `${NAME[p]}: ${problems.length} label${problems.length > 1 ? "s" : ""} not printed — ${problems.join(" · ")}`);
        const blob = await r.blob();
        if (blob.size < 100) throw new Error("the marketplace sent an empty label file — try again in a minute");
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.location.assign(url);
        useOffice.getState().recordAudit("print_labels", "order", null, `${NAME[p]} labels: ${ids.join(", ")}`);
      } catch (e) {
        tab?.close();
        toast("error", `${NAME[p]} labels: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "fulfil" : null })}>
      <DialogContent
        title={stage === "process" ? "To process — arrange drop-off" : "To ship — print labels"}
        description={stage === "process" ? "Tick the orders you've packed, then arrange drop-off. You drop the parcels at the courier yourself." : "Print the shipping labels (AWB) for arranged orders."}
        className="h-[85vh] max-w-3xl"
      >
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can arrange shipments and print labels.</p>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(["process", "ship"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      set({ fulfilStage: st });
                      setSel(new Set());
                      setResults({});
                    }}
                    className={cn("rounded-md px-3 py-1 text-xs font-medium", stage === st ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}
                  >
                    {st === "process" ? "To process" : "To ship"} ({(orders ?? []).filter((o) => o.stage === st).length})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-slate-500">Select</span>
                {(
                  [
                    ["All", (o: Order) => !!o],
                    ["Shopee", (o: Order) => o.platform === "shopee"],
                    ["Lazada", (o: Order) => o.platform === "lazada"],
                  ] as [string, (o: Order) => boolean][]
                ).map(([label, pick]) => {
                  const n = list.filter(pick).length;
                  return (
                    <button
                      key={label}
                      onClick={() => setSel(new Set(list.filter(pick).map(key)))}
                      disabled={!n}
                      className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      {label !== "All" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[label.toLowerCase() as Plat] }} />}
                      {label} ({n})
                    </button>
                  );
                })}
                <button
                  onClick={() => setSel(new Set())}
                  disabled={!sel.size}
                  className="rounded-md px-2 py-0.5 font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                Sort
                <select
                  value={sort}
                  onChange={(e) => chooseSort(e.target.value as Sort)}
                  className="h-7 rounded-md border border-slate-200 bg-panel px-1.5 text-[11px] font-medium text-slate-700"
                  aria-label="Sort orders"
                >
                  {SORTS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => void load()} title="Refresh">
                  <RefreshCw />
                </Button>
                {stage === "process" ? (
                  <Button size="sm" onClick={arrange} disabled={!chosen.length || busy !== null}>
                    {busy === "ship" ? <Loader2 className="animate-spin" /> : <PackageCheck />} Arrange drop-off ({chosen.length})
                  </Button>
                ) : (
                  <>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    Paper
                    <select
                      value={paper}
                      onChange={(e) => choosePaper(e.target.value as Paper)}
                      className="h-7 rounded-md border border-slate-200 bg-panel px-1.5 text-[11px] font-medium text-slate-700"
                      aria-label="Label paper size"
                    >
                      {PAPERS.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" onClick={print} disabled={!chosen.length || busy !== null}>
                    {busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />} Print labels ({chosen.length})
                  </Button>
                  </>
                )}
              </div>
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {justArranged.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">
                    {justArranged.length} order{justArranged.length > 1 ? "s" : ""} arranged for drop-off.
                  </span>
                  <Button size="sm" className="ml-auto" onClick={() => void printFor(justArranged)} disabled={busy !== null}>
                    {busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />} Print airway bills now ({PAPERS.find((x) => x.v === paper)?.label})
                  </Button>
                </div>
              )}
              {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{err}</div>}
              {!orders && !err && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
              {orders && !list.length && <p className="text-sm text-slate-500">{stage === "process" ? "No new orders to process. 🎉" : "Nothing waiting for pickup."}</p>}
              {list.map((o) => {
                const d = due(o.shipBy);
                const r = results[key(o)];
                return (
                  <label key={key(o)} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-xs", sel.has(key(o)) ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50")}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sel.has(key(o))} onChange={() => toggle(o)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: DOT[o.platform] }} />
                        <span className="font-semibold text-slate-800">{NAME[o.platform]}</span>
                        <span className="font-mono text-[11px] text-slate-500">#{o.id}</span>
                        <span
                          className="text-slate-400"
                          title={`Ordered ${new Date(o.orderedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}${o.paidKnown ? ` · paid ${new Date(o.paidAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}` : ""}`}
                        >
                          · {o.platform === "shopee" && !o.paidKnown ? "ordered (COD)" : "paid"}{" "}
                          {new Date(o.paidAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} ({timeAgo(o.paidAt)})
                        </span>
                        <span className="ml-auto font-semibold tabular-nums text-slate-800">{formatMYR(o.amount, 2)}</span>
                      </div>
                      <ul className="mt-1 space-y-0.5 text-slate-700">
                        {o.items.map((it, i) => (
                          <li key={i}>
                            <b>{it.qty}×</b> {it.name}
                            {it.model ? <span className="text-slate-500"> — {it.model}</span> : null}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {d && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", d.late ? "bg-red-600 text-white" : d.urgent ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>ship by {d.label}</span>}
                        {r && (
                          <span className={cn("flex items-center gap-1 text-[11px]", r.ok ? "text-emerald-700" : "text-red-700")}>
                            {r.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {r.message}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
