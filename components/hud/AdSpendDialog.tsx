"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useOffice } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";
import { AD_CHANNELS, monthAds, type AdChannel, type AdEntry } from "@/lib/data/ads";

const klDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const RM = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "h-9 rounded-lg border border-slate-200 bg-panel px-2 text-sm text-slate-900";

/** Key in ad spend by hand: Shopee/Lazada top-ups, Facebook, TikTok… It goes straight into the profit. */
export function AdSpendDialog({ open, onOpenChange, syncedLazada }: { open: boolean; onOpenChange: (o: boolean) => void; syncedLazada?: number | null }) {
  const entries = useOffice((s) => s.settings.adSpend);
  const update = useOffice((s) => s.updateSettings);
  const toast = useUI((s) => s.toast);
  const [month, setMonth] = useState(() => klDay().slice(0, 7));
  const [date, setDate] = useState(klDay);
  const [channel, setChannel] = useState<AdChannel>("shopee");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const list = useMemo(() => (entries ?? []).filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)), [entries, month]);
  const totals = useMemo(() => monthAds(entries, month), [entries, month]);
  const thisMonth = month === klDay().slice(0, 7);
  const lazadaSynced = thisMonth && !(totals.byChannel.lazada ?? 0) && (syncedLazada ?? 0) > 0 ? syncedLazada! : 0;
  const grand = totals.total + lazadaSynced;

  const add = () => {
    const v = Math.round(Number(amount) * 100) / 100;
    if (!(v > 0)) return toast("error", "Enter how much you spent");
    const e: AdEntry = { id: `ad-${Date.now().toString(36)}`, date, channel, amount: v, ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}) };
    update({ adSpend: [...(entries ?? []), e] });
    setAmount("");
    setNote("");
    if (!date.startsWith(month)) setMonth(date.slice(0, 7));
    toast("success", `${RM(v)} added — profit updates on the next refresh`);
  };
  const remove = (id: string) => update({ adSpend: (entries ?? []).filter((e) => e.id !== id) });
  const label = (c: AdChannel) => AD_CHANNELS.find((x) => x.id === c)?.label ?? c;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Ad spend" description="Key in what you spend on ads or top up — any channel. It's taken off your profit for that month." className="max-w-xl">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {/* add */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[auto_1fr_auto]">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || klDay())} className={inp} aria-label="Date" />
            <select value={channel} onChange={(e) => setChannel(e.target.value as AdChannel)} className={inp} aria-label="Channel">
              {AD_CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm text-slate-500">
              RM
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && add()}
                inputMode="decimal"
                placeholder="0.00"
                className={`${inp} w-24 text-right`}
                aria-label="Amount"
              />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Note (optional) — e.g. 11.11 campaign" className={`${inp} col-span-2 sm:col-span-2`} />
            <Button onClick={add} className="col-span-2 sm:col-span-1">
              Add
            </Button>
          </div>

          {/* month */}
          <div className="flex items-center justify-between gap-2">
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={inp} aria-label="Month" />
            <div className="text-right">
              <div className="text-[11px] text-slate-500">Total this month</div>
              <div className="text-lg font-bold tabular-nums text-slate-900">{RM(grand)}</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {AD_CHANNELS.map((c) => {
              const v = (totals.byChannel[c.id] ?? 0) + (c.id === "lazada" ? lazadaSynced : 0);
              if (!v) return null;
              return (
                <div key={c.id} className="grid grid-cols-[9.5rem_1fr_5.5rem] items-center gap-2 text-xs">
                  <span className="text-slate-700">
                    {c.label}
                    {c.id === "lazada" && lazadaSynced ? <span className="text-slate-400"> · synced</span> : null}
                  </span>
                  <span className="h-2 rounded-full bg-slate-100">
                    <span className="block h-2 rounded-full" style={{ width: `${Math.max(2, (v / (grand || 1)) * 100)}%`, background: c.color }} />
                  </span>
                  <b className="text-right tabular-nums text-slate-900">{RM(v)}</b>
                </div>
              );
            })}
          </div>
          {thisMonth && (
            <p className="text-[11px] text-slate-500">
              Lazada: {totals.byChannel.lazada ? "you've keyed it in, so the synced figure isn't used (never counted twice)." : syncedLazada ? "using the synced Lazada Ads spend until you key in your own." : "key it in here if you run Lazada ads."}
            </p>
          )}

          {/* entries */}
          <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
            {!list.length ? (
              <p className="p-4 text-center text-xs text-slate-500">Nothing keyed in for this month yet.</p>
            ) : (
              list.map((e) => (
                <div key={e.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-0">
                  <span className="w-20 text-slate-500 tabular-nums">{e.date.slice(8)}/{e.date.slice(5, 7)}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AD_CHANNELS.find((c) => c.id === e.channel)?.color }} />
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {label(e.channel)}
                    {e.note && <span className="text-slate-400"> · {e.note}</span>}
                  </span>
                  <b className="tabular-nums text-slate-900">{RM(e.amount)}</b>
                  <button type="button" onClick={() => remove(e.id)} className="text-slate-400 hover:text-red-600" aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
