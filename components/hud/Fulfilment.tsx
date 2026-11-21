"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, Mail, PackageCheck, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { formatMYR } from "@/lib/data/demo";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import { shortProduct, variationOf } from "@/lib/data/product-names";

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

/** Loading screen shown in the new tab while the airway bills are fetched (water drip). */
function loadingPage(count: number) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preparing airway bills…</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; font-family: -apple-system, system-ui, sans-serif;
         background: linear-gradient(180deg,#eff6ff,#dbeafe); color:#1e3a5f; }
  @media (prefers-color-scheme: dark) { body { background: linear-gradient(180deg,#0b1220,#13263f); color:#dbeafe; } }
  .wrap { text-align:center; }
  .tap { width:46px; height:18px; margin:0 auto; border-radius:6px 6px 3px 3px; background:#64748b; position:relative; }
  .tap:before { content:""; position:absolute; left:-26px; top:4px; width:30px; height:10px; border-radius:4px; background:#94a3b8; }
  .stage { position:relative; height:150px; width:120px; margin:0 auto; }
  .drop { position:absolute; left:50%; top:0; width:16px; height:16px; margin-left:-8px; background:#38bdf8;
          border-radius:0 50% 50% 50%; transform:rotate(45deg); animation: fall 1.4s cubic-bezier(.55,0,1,.45) infinite; opacity:0; }
  .drop:nth-child(2){ animation-delay:.47s } .drop:nth-child(3){ animation-delay:.94s }
  @keyframes fall { 0%{ top:0; opacity:0; transform:rotate(45deg) scale(.4) } 12%{ opacity:1; transform:rotate(45deg) scale(1) }
                    85%{ top:112px; opacity:1 } 100%{ top:118px; opacity:0; transform:rotate(45deg) scale(.6,.3) } }
  .pool { position:absolute; left:50%; bottom:0; width:96px; height:18px; margin-left:-48px; border-radius:50%;
          background: radial-gradient(ellipse at center,#38bdf8 0%,#0ea5e9 55%,transparent 70%); opacity:.85; }
  .ring { position:absolute; left:50%; bottom:4px; width:20px; height:8px; margin-left:-10px; border:2px solid #7dd3fc; border-radius:50%;
          animation: ripple 1.4s ease-out infinite; opacity:0; }
  .ring:nth-of-type(5){ animation-delay:.47s } .ring:nth-of-type(6){ animation-delay:.94s }
  @keyframes ripple { 0%{ opacity:0; transform:scale(.3) } 8%{ opacity:.9 } 100%{ opacity:0; transform:scale(4.2,3) } }
  h1 { font-size:18px; margin:22px 0 6px; } p { margin:0; font-size:13px; opacity:.75; }
  .err { color:#b91c1c; } @media (prefers-color-scheme: dark) { .err { color:#fca5a5; } }
</style></head><body><div class="wrap">
  <div class="tap"></div>
  <div class="stage"><div class="drop"></div><div class="drop"></div><div class="drop"></div><div class="pool"></div><div class="ring"></div><div class="ring"></div></div>
  <h1 id="t">Preparing ${count} airway bill${count === 1 ? "" : "s"}…</h1>
  <p id="s">Fetching labels from Shopee &amp; Lazada — usually 5–20 seconds.</p>
</div></body></html>`;
}

/** One parcel in the packing list, in the order its airway bill comes out of the printer. */
interface PackRow {
  platform: Plat;
  id: string;
  tracking: string | null;
  items: Order["items"];
}
interface Packing {
  at: string;
  rows: PackRow[];
  /** labels a marketplace sent as a web page, printed from a second tab after the main PDF */
  separate?: Plat | null;
}
const PACK_KEY = "ov:packing-v1";
const PACKED_KEY = "ov:packed-v1";
function readJSON<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function writeJSON(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

/** Tick-off list that follows the printed airway bills top to bottom. */
function PackingList({ packing, onBack }: { packing: Packing; onBack: () => void }) {
  const [packed, setPacked] = useState<Set<string>>(() => new Set(readJSON<string[]>(PACKED_KEY, [])));
  const k = (r: PackRow) => `${r.platform}:${r.id}`;
  const toggle = (r: PackRow) =>
    setPacked((s) => {
      const n = new Set(s);
      if (n.has(k(r))) n.delete(k(r));
      else n.add(k(r));
      writeJSON(PACKED_KEY, [...n].slice(-500));
      return n;
    });
  const done = packing.rows.filter((r) => packed.has(k(r))).length;
  const next = packing.rows.findIndex((r) => !packed.has(k(r)));
  const all = done === packing.rows.length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft /> Orders
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">Packing list — same order as your airway bills</div>
          <div className="text-[11px] text-slate-500">
            Label #1 is the first page of the PDF. Click a parcel once it&apos;s packed. Printed{" "}
            {new Date(packing.at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", all ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")}>
          {all ? "All packed ✓" : `${done} / ${packing.rows.length} packed`}
        </div>
      </div>
      <div className="h-1 bg-slate-100">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${packing.rows.length ? (done / packing.rows.length) * 100 : 0}%` }} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {packing.rows.map((r, i) => {
          const isDone = packed.has(k(r));
          const second = packing.separate && r.platform === packing.separate;
          const firstOfSecond = second && packing.rows.findIndex((x) => x.platform === packing.separate) === i;
          return (
            <div key={k(r)}>
              {firstOfSecond && <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Second tab — {NAME[r.platform]} labels</div>}
              <button
                onClick={() => toggle(r)}
                className={cn(
                  "flex w-full gap-3 rounded-xl border p-3 text-left text-xs transition",
                  isDone ? "border-emerald-200 bg-emerald-50/60 opacity-70" : i === next ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base font-bold tabular-nums", isDone ? "bg-emerald-500 text-white" : "bg-slate-900 text-white")}>
                  {isDone ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: DOT[r.platform] }} />
                    <span className="font-semibold text-slate-800">{NAME[r.platform]}</span>
                    <span className="font-mono text-[11px] text-slate-500">#{r.id}</span>
                    {r.tracking && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">AWB {r.tracking}</span>}
                    {i === next && !isDone && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-sky-700">Pack next</span>}
                  </div>
                  <ul className={cn("mt-1 space-y-0.5 text-sm", isDone ? "text-slate-500 line-through" : "text-slate-800")}>
                    {r.items.length ? (
                      r.items.map((it, n) => (
                        <li key={n} title={it.model ? `${it.name} — ${it.model}` : it.name}>
                          <b>{it.qty}×</b> {variationOf(it.model) || shortProduct(it.name)}
                          {variationOf(it.model) ? <span className="text-xs text-slate-500"> · {shortProduct(it.name)}</span> : null}
                        </li>
                      ))
                    ) : (
                      <li className="text-xs text-slate-400">Items not synced — check the label</li>
                    )}
                  </ul>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Farid emails the packing list + merged airway bills every day at the chosen time. */
function PackingEmailBar({ paper }: { paper: Paper }) {
  const cfg = useOffice((s) => s.settings.packingEmail) ?? { enabled: false, time: "12:00", to: "" };
  const update = useOffice((s) => s.updateSettings);
  const toast = useUI((s) => s.toast);
  const [to, setTo] = useState(cfg.to);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ configured: boolean; log: { at: string; status: string; count: number; error: string | null; manual: boolean }[] } | null>(null);
  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/fulfil/packing-email", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const set = (patch: Partial<typeof cfg>) => update({ packingEmail: { ...cfg, to: to.trim(), paper, ...patch } });
  const sendNow = async () => {
    if (!valid) return toast("error", "Enter the email address first");
    set({});
    setBusy(true);
    try {
      const r = await fetch("/api/fulfil/packing-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: to.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      toast(j.status === "sent" ? "success" : "info", j.status === "sent" ? `Packing list emailed — ${j.count} parcel${j.count === 1 ? "" : "s"}` : "Nothing new to pack since the last email");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
    void loadStatus();
  };
  const last = status?.log[0];
  const lastText = last
    ? `${last.status === "sent" ? `Last email: ${last.count} parcel${last.count === 1 ? "" : "s"}` : last.status === "empty" ? "Last check: nothing new to pack" : last.status === "failed" ? "Last email failed" : "Sending…"} · ${new Date(last.at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : null;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 border-b px-5 py-2 text-xs", cfg.enabled ? "border-sky-100 bg-sky-50/70" : "border-slate-100 bg-slate-50/70")}>
      <Mail className="h-4 w-4 shrink-0 self-start text-slate-500 sm:self-center" />
      <div className="min-w-[16rem] flex-1">
        <div className="font-semibold text-slate-800">Packing list & airway bills by email</div>
        <div className="text-[11px] text-slate-500">
          {status && !status.configured ? (
            <span className="font-medium text-amber-700">Email isn&apos;t set up yet — add RESEND_API_KEY in Vercel, then redeploy.</span>
          ) : cfg.enabled ? (
            cfg.mode === "instant"
              ? "On — right after Farid confirms new orders: their airway bills (one merged PDF) + packing list, emailed within a minute."
              : `On — every day at ${cfg.time}: new To-ship parcels + one merged airway-bill PDF (Shopee & Lazada).`
          ) : (
            "Off — Farid can email new parcels and their airway bills to you every day."
          )}
          {lastText && <span className={cn("ml-1", last?.status === "failed" && "text-red-700")} title={last?.error ?? undefined}>· {lastText}{last?.status === "failed" && last.error ? ` — ${last.error.slice(0, 120)}` : ""}</span>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onBlur={() => to.trim() !== cfg.to && set({})}
        placeholder="you@example.com"
        className="h-7 w-52 rounded-md border border-slate-200 bg-panel px-2 text-[11px] text-slate-800 placeholder:text-slate-400"
        aria-label="Send the packing list to"
      />
      <select
        value={cfg.mode ?? "daily"}
        onChange={(e) => set({ mode: e.target.value as "daily" | "instant" })}
        className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800"
        aria-label="When to email"
      >
        <option value="instant">Right after Farid confirms</option>
        <option value="daily">Once a day</option>
      </select>
      {(cfg.mode ?? "daily") === "daily" && (
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          at
          <input type="time" value={cfg.time} onChange={(e) => set({ time: e.target.value || "12:00" })} className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" />
        </label>
      )}
      <Button size="sm" variant="outline" onClick={sendNow} disabled={busy || !valid} title="Email the new To-ship parcels now">
        {busy ? <Loader2 className="animate-spin" /> : <Send />} Send now
      </Button>
      <button
        role="switch"
        aria-checked={cfg.enabled}
        aria-label="Daily packing email"
        onClick={() => {
          if (!cfg.enabled && !valid) return toast("error", "Enter the email address first");
          set({ enabled: !cfg.enabled });
          toast("success", cfg.enabled ? "Packing email off" : cfg.mode === "instant" ? "Packing email on — right after Farid confirms new orders" : `Packing email on — every day at ${cfg.time}`);
        }}
        className={cn("relative h-6 w-11 rounded-full transition", cfg.enabled ? "bg-sky-500" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", cfg.enabled ? "left-[22px]" : "left-0.5")} />
      </button>
      </div>
    </div>
  );
}

type StoreRun = {
  platform: string;
  status: string;
  lastSync: string | null;
  lastPush: string | null;
  lastRun: { at: string; source: string; state: string; waiting?: number; tried?: number; arranged?: number; failed?: number } | null;
  error: string | null;
};

/** One line per store: when the marketplace last pushed an update, and what Farid did on his last check. */
function FaridStatus({ stores, checking, onCheck }: { stores: StoreRun[] | null; checking: boolean; onCheck: () => void }) {
  if (!stores?.length) return null;
  const SRC: Record<string, string> = { push: "instant update", schedule: "10-min check", manual: "your check", sync: "sync" };
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 pb-2 pl-[3.1rem] text-[11px] text-slate-600">
      {stores.map((st) => {
        const run = st.lastRun;
        const what = !run
          ? "hasn't checked yet"
          : run.state === "off"
            ? "switched off"
            : run.state === "outside_hours"
              ? "outside working hours"
              : run.arranged || run.failed
                ? `confirmed ${run.arranged ?? 0}${run.failed ? `, ${run.failed} failed` : ""}`
                : run.waiting
                  ? `${run.waiting} waiting (already tried — confirm these yourself)`
                  : "no new orders";
        const noPush = !st.lastPush;
        return (
          <span key={st.platform} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.platform === "shopee" ? "#eb6834" : "#2a78d6" }} />
            <b className="font-semibold">{st.platform === "shopee" ? "Shopee" : "Lazada"}</b>
            {run ? ` · checked ${timeAgo(run.at)} (${SRC[run.source] ?? run.source}): ${what}` : ` · ${what}`}
            <span className={cn(noPush ? "font-medium text-amber-700" : "text-slate-400")} title={noPush ? "OfficeVerse has never received an instant order update from this store. New orders are still picked up by the 10-minute check." : undefined}>
              {noPush ? " · no instant updates received" : ` · last instant update ${timeAgo(st.lastPush!)}`}
            </span>
            {st.status !== "connected" && <span className="font-medium text-red-700"> · {st.status}{st.error ? `: ${st.error.slice(0, 60)}` : ""}</span>}
          </span>
        );
      })}
      <button onClick={onCheck} disabled={checking} className="ml-auto flex items-center gap-1 font-semibold text-sky-700 hover:underline disabled:opacity-50">
        {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Check now
      </button>
    </div>
  );
}

/** Farid's on/off switch and working hours for confirming new orders automatically. */
function AutoArrangeBar() {
  const auto = useOffice((s) => s.settings.autoArrange) ?? { enabled: false, start: "08:00", end: "22:00" };
  const update = useOffice((s) => s.updateSettings);
  const farid = useOffice((s) => s.employees.find((e) => e.id === "emp-orders" && e.active));
  const toast = useUI((s) => s.toast);
  const set = (patch: Partial<typeof auto>) => update({ autoArrange: { ...auto, ...patch } });
  const [stores, setStores] = useState<StoreRun[] | null>(null);
  const [checking, setChecking] = useState(false);
  const loadRuns = useCallback(async () => {
    try {
      const r = await fetch("/api/fulfil/automation", { cache: "no-store" });
      if (r.ok) setStores((await r.json()).stores);
    } catch {}
  }, []);
  useEffect(() => {
    void loadRuns();
    const t = setInterval(() => void loadRuns(), 60_000);
    return () => clearInterval(t);
  }, [loadRuns]);
  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await fetch("/api/fulfil/automation", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setStores(j.stores);
      const res = j.result as { arranged: number; failed: number; cancellations: number };
      toast(res.failed ? "error" : "success", res.arranged || res.failed ? `${res.arranged} confirmed${res.failed ? `, ${res.failed} need you` : ""}` : auto.enabled ? "Checked — no new orders to confirm" : "Checked — automatic confirmation is off");
      void useLive.getState().loadSummary();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
    setChecking(false);
  };
  return (
    <div className={cn("border-b", auto.enabled ? "border-emerald-100 bg-emerald-50/70" : "border-slate-100 bg-slate-50/70")}>
    <div className="flex flex-wrap items-center gap-3 px-5 py-2 text-xs">
      <span className="text-base" aria-hidden>
        🤖
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-800">{farid?.name ?? "Order assistant"} confirms new orders automatically</div>
        <div className="text-[11px] text-slate-500">
          {auto.enabled
            ? `On — new paid orders get drop-off arranged within seconds (checked again every 10 min), ${auto.start}–${auto.end}. Cancellation requests come to you for approval.`
            : "Off — you confirm orders yourself. Cancellation requests still come to you for approval."}
        </div>
      </div>
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        from
        <input type="time" value={auto.start} onChange={(e) => set({ start: e.target.value || "00:00" })} className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" />
        to
        <input type="time" value={auto.end} onChange={(e) => set({ end: e.target.value || "23:59" })} className="h-7 rounded-md border border-slate-200 bg-panel px-1 text-[11px] text-slate-800" />
      </label>
      <button
        role="switch"
        aria-checked={auto.enabled}
        onClick={() => {
          if (!auto.enabled && !confirm("Turn on automatic order confirmation? New paid orders will be arranged for DROP-OFF on Shopee/Lazada as soon as they arrive (including any waiting in To process now).")) return;
          set({ enabled: !auto.enabled });
          toast("success", auto.enabled ? "Automatic confirmation off" : "Automatic confirmation on — takes effect at the next order update");
        }}
        className={cn("relative h-6 w-11 rounded-full transition", auto.enabled ? "bg-emerald-500" : "bg-slate-300")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", auto.enabled ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
    <FaridStatus stores={stores} checking={checking} onCheck={checkNow} />
    </div>
  );
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
  const [packing, setPacking] = useState<Packing | null>(null);
  const [showPacking, setShowPacking] = useState(false);
  useEffect(() => setPacking(readJSON<Packing | null>(PACK_KEY, null)), []);
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
    const open = async (orders: { platform: Plat; id: string }[]) => {
      // open the tab first (popup blockers), show the loading screen, then swap in the file
      const tab = window.open("", "_blank");
      try {
        tab?.document.open();
        tab?.document.write(loadingPage(orders.length));
        tab?.document.close();
      } catch {}
      try {
        const r = await fetch("/api/fulfil/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orders, paper }) });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${r.status})`);
        let problems: string[] = [];
        try {
          problems = JSON.parse(decodeURIComponent(r.headers.get("X-OV-Problems") ?? "%5B%5D"));
        } catch {}
        if (problems.length) toast("error", `${problems.length} label${problems.length > 1 ? "s" : ""} not printed — ${problems.join(" · ")}`);
        try {
          const raw = JSON.parse(decodeURIComponent(r.headers.get("X-OV-Sequence") ?? "%5B%5D")) as [string, string, string | null][];
          printed.push(...raw.map(([p, id, tracking]) => ({ platform: (p === "s" ? "shopee" : "lazada") as Plat, id, tracking })));
        } catch {}
        const blob = await r.blob();
        if (blob.size < 100) throw new Error("the marketplace sent an empty label file — try again in a minute");
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.location.assign(url);
        useOffice.getState().recordAudit("print_labels", "order", null, `Airway bills: ${orders.map((o) => `${NAME[o.platform]} ${o.id}`).join(", ")}`);
        return r.headers.get("X-OV-Separate") as Plat | null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast("error", `Labels: ${msg}`);
        // keep the tab, but tell the CEO what happened instead of leaving it blank
        try {
          const d = tab?.document;
          const t = d?.getElementById("t");
          const sub = d?.getElementById("s");
          if (t && sub) {
            t.textContent = "Couldn't get the airway bills";
            t.className = "err";
            sub.textContent = `${msg} — you can close this tab and try again.`;
            d?.querySelectorAll(".drop,.ring").forEach((el) => ((el as HTMLElement).style.animationPlayState = "paused"));
          } else tab?.close();
        } catch {
          tab?.close();
        }
        return null;
      }
    };
    const printed: { platform: Plat; id: string; tracking: string | null }[] = [];
    // one PDF for everything; if one marketplace only sends web-page labels, open those separately
    const separate = await open(targets);
    if (separate) {
      toast("info", `${NAME[separate]} sent its labels as a web page — opening them in a second tab.`);
      await open(targets.filter((o) => o.platform === separate));
    }
    // packing list in the same order as the labels
    const seen = new Set<string>();
    const rows = printed
      .filter((x) => !seen.has(`${x.platform}:${x.id}`) && seen.add(`${x.platform}:${x.id}`))
      .map((x) => ({ ...x, items: orders?.find((o) => o.platform === x.platform && o.id === x.id)?.items ?? [] }));
    if (rows.length) {
      const p: Packing = { at: new Date().toISOString(), rows, separate: separate ?? null };
      setPacking(p);
      writeJSON(PACK_KEY, p);
      setShowPacking(true);
    }
    setBusy(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "fulfil" : null })}>
      <DialogContent
        title={stage === "process" ? "To process — arrange drop-off" : "To ship — print labels"}
        description={stage === "process" ? "Tick the orders you've packed, then arrange drop-off. You drop the parcels at the courier yourself." : "Print the shipping labels (AWB) for arranged orders."}
        className="h-[85vh] max-w-3xl"
        onBack={() => set({ dialog: "dashboard" })}
        backLabel="Dashboard"
      >
        {role !== "owner" ? (
          <p className="p-6 text-sm text-slate-600">Only the workspace owner can arrange shipments and print labels.</p>
        ) : (
          showPacking && packing ? (
          <PackingList packing={packing} onBack={() => setShowPacking(false)} />
          ) : (
          <div className="flex h-full min-h-0 flex-col">
            <AutoArrangeBar />
            <PackingEmailBar paper={paper} />
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
                {packing && (
                  <Button size="sm" variant="outline" onClick={() => setShowPacking(true)} title="What to pack, in the same order as the last airway bills you printed">
                    <ClipboardCheck /> Packing list ({packing.rows.length})
                  </Button>
                )}
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
                          <li key={i} title={it.model ? `${it.name} — ${it.model}` : it.name}>
                            <b>{it.qty}×</b> {variationOf(it.model) || shortProduct(it.name)}
                            {variationOf(it.model) ? <span className="text-slate-500"> · {shortProduct(it.name)}</span> : null}
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
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
