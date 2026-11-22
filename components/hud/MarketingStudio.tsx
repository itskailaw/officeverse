"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Copy, Loader2, MessageSquareText, PenLine, Sparkles } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { upcomingEvents, type ShopEvent } from "@/lib/marketing/calendar";
import { cn } from "@/lib/utils";

type Tab = "listing" | "reply" | "campaign";
type Usage = { input: number; output: number };
interface CatalogRow {
  product: string;
  variation: string;
  units30: number;
}
interface Level {
  name: string;
  left: number;
  perDay: number;
}
interface Listing {
  lang: "en" | "ms";
  title: string;
  description: string;
  keywords: string[];
}

/** Open the Marketing Studio on a tab (from the quick menu, dashboard or a reminder). */
export const openMarketing = (tab: Tab = "listing") => {
  try {
    sessionStorage.setItem("ov:marketing-tab", tab);
  } catch {}
  useUI.getState().set({ dialog: "marketing" });
};

const KIND_STYLE: Record<ShopEvent["kind"], string> = {
  mega: "bg-red-50 text-red-700",
  festival: "bg-amber-50 text-amber-800",
  double: "bg-sky-50 text-sky-800",
  holiday: "bg-emerald-50 text-emerald-800",
  payday: "bg-slate-100 text-slate-700",
};
const KIND_LABEL: Record<ShopEvent["kind"], string> = { mega: "Mega sale", festival: "Festival", double: "Double day", holiday: "Holiday", payday: "Payday" };

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

/** Record the AI work as a finished task, so it shows on scorecards and in AI usage. */
function recordTask(employeeId: string, title: string, result: string, usage?: Usage, model?: string) {
  const s = useOffice.getState();
  const t = s.assignTask({ employeeId, title, instructions: title, priority: "normal", source: "ceo" });
  if (t.ok && t.id) s.updateTask(t.id, { status: "completed", result, usage, model });
}

async function post<T>(body: unknown): Promise<T> {
  const r = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

/** Marketing Studio: Hafiz writes listings and plans campaigns, Mei Ling drafts buyer replies. */
export function MarketingStudio() {
  const open = useUI((s) => s.dialog === "marketing");
  const set = useUI((s) => s.set);
  const [tab, setTab] = useState<Tab>("listing");
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  useEffect(() => {
    if (!open) return;
    try {
      const t = sessionStorage.getItem("ov:marketing-tab") as Tab | null;
      if (t) setTab(t);
      sessionStorage.removeItem("ov:marketing-tab");
    } catch {}
    fetch("/api/stock", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setCatalog(j.catalog ?? []);
        setLevels(j.levels ?? []);
      })
      .catch(() => {});
  }, [open]);

  const tabs: [Tab, string, React.ReactNode][] = [
    ["listing", "Listing writer", <PenLine key="l" className="h-3.5 w-3.5" />],
    ["reply", "Buyer replies", <MessageSquareText key="r" className="h-3.5 w-3.5" />],
    ["campaign", "Campaigns", <CalendarDays key="c" className="h-3.5 w-3.5" />],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "marketing" : null })}>
      <DialogContent title="Marketing Studio" description="Listings, buyer replies and sale-event plans — your team drafts, you decide." className="h-[88vh] max-w-3xl" onBack={() => set({ dialog: "dashboard" })} backLabel="Dashboard">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex gap-1 border-b border-slate-100 px-5 py-2">
            {tabs.map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium", tab === id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {tab === "listing" && <ListingTab catalog={catalog} />}
            {tab === "reply" && <ReplyTab />}
            {tab === "campaign" && <CampaignTab catalog={catalog} levels={levels} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useStaff(id: string, fallback: string) {
  const e = useOffice((s) => s.employees.find((x) => x.id === id));
  return { id, name: e?.name ?? fallback, first: (e?.name ?? fallback).split(" ")[0], title: e?.title ?? "", model: e?.ai?.model, active: e?.active ?? true };
}

function ShopNotes() {
  const notes = useOffice((s) => s.settings.shopNotes ?? "");
  const update = useOffice((s) => s.updateSettings);
  const [v, setV] = useState(notes);
  useEffect(() => setV(notes), [notes]);
  return (
    <details className="rounded-xl border border-slate-200 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-slate-700">Shop facts the team may use {notes ? "✓" : "(add once)"}</summary>
      <p className="mt-1 text-[11px] text-slate-500">Warranty, delivery times, cartridge life, install help, return policy… Used by both the listing writer and buyer replies. Saved for everyone in your workspace.</p>
      <Textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== notes && update({ shopNotes: v.slice(0, 2000) })}
        rows={4}
        className="mt-2 text-xs"
        placeholder="e.g. 1-year warranty on the housing. Cartridge lasts 6–12 months. Ships from Selangor in 1–2 days. Free installation video in the box."
      />
    </details>
  );
}

// ------------------------------------------------------------------ listing writer
function ListingTab({ catalog }: { catalog: CatalogRow[] }) {
  const hafiz = useStaff("emp-mkt-spec", "Hafiz Ismail");
  const notes = useOffice((s) => s.settings.shopNotes ?? "");
  const products = useMemo(() => [...new Set(catalog.map((c) => c.product))].slice(0, 30), [catalog]);
  const [product, setProduct] = useState("");
  const [variations, setVariations] = useState("");
  const [facts, setFacts] = useState("");
  const [platform, setPlatform] = useState<"shopee" | "lazada">("shopee");
  const [langs, setLangs] = useState<("en" | "ms")[]>(["en", "ms"]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ listings: Listing[]; ask: string[] } | null>(null);

  const pick = (p: string) => {
    setProduct(p);
    setVariations([...new Set(catalog.filter((c) => c.product === p && c.variation).map((c) => c.variation))].join(", "));
  };
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await post<{ listings: Listing[]; ask: string[]; usage?: Usage; model?: string }>({
        kind: "listing",
        product,
        variations,
        facts: [facts, notes].filter(Boolean).join("\n"),
        platform,
        languages: langs,
        employee: { name: hafiz.name, title: hafiz.title, model: hafiz.model },
      });
      setOut(j);
      recordTask(hafiz.id, `Write ${platform === "shopee" ? "Shopee" : "Lazada"} listing: ${product.slice(0, 60)}`, `Listing written in ${j.listings.map((l) => (l.lang === "ms" ? "Malay" : "English")).join(" & ")}.`, j.usage, j.model);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        <b className="text-slate-800">{hafiz.first}</b> writes a search-friendly title, description and keywords. Paste them into Seller Centre — nothing is changed on your shop.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-slate-600">
          Product
          <Input list="ov-products" value={product} onChange={(e) => pick(e.target.value)} placeholder="e.g. MDBC shower filter" className="mt-1" />
          <datalist id="ov-products">
            {products.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="text-[11px] font-medium text-slate-600">
          Variations
          <Input value={variations} onChange={(e) => setVariations(e.target.value)} placeholder="e.g. 1 set, 2 sets, refill cartridge" className="mt-1" />
        </label>
      </div>
      <label className="block text-[11px] font-medium text-slate-600">
        What&apos;s special about it (facts only)
        <Textarea value={facts} onChange={(e) => setFacts(e.target.value)} rows={3} className="mt-1" placeholder="e.g. 15-stage filter, removes chlorine and rust, fits most shower heads, lasts 6 months" />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["shopee", "lazada"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={cn("rounded-md px-3 py-1 font-medium", platform === p ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
              {p === "shopee" ? "Shopee" : "Lazada"}
            </button>
          ))}
        </div>
        {(["en", "ms"] as const).map((l) => (
          <label key={l} className="inline-flex items-center gap-1 text-slate-700">
            <input type="checkbox" checked={langs.includes(l)} onChange={(e) => setLangs((x) => (e.target.checked ? [...x, l] : x.filter((y) => y !== l)))} />
            {l === "en" ? "English" : "Bahasa Melayu"}
          </label>
        ))}
        <Button onClick={() => void run()} disabled={busy || !product.trim() || !langs.length} className="ml-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? `${hafiz.first} is writing…` : `Ask ${hafiz.first}`}
        </Button>
      </div>
      <ShopNotes />
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {out && (
        <div className="space-y-3">
          {out.listings.map((l) => (
            <div key={l.lang} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {l.lang === "ms" ? "Bahasa Melayu" : "English"}
                <span className="ml-auto normal-case tracking-normal">
                  <CopyBtn text={`${l.title}\n\n${l.description}`} label="Copy all" />
                </span>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex-1 text-sm font-semibold text-slate-900">{l.title}</div>
                <span className={cn("shrink-0 text-[10px] tabular-nums", l.title.length > (platform === "shopee" ? 120 : 255) ? "text-red-600" : "text-slate-400")}>{l.title.length} chars</span>
                <CopyBtn text={l.title} label="Title" />
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 font-sans text-xs leading-relaxed text-slate-700">{l.description}</pre>
              <div className="mt-2 flex justify-end">
                <CopyBtn text={l.description} label="Description" />
              </div>
              {!!l.keywords.length && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {l.keywords.map((k) => (
                    <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">
                      {k}
                    </span>
                  ))}
                  <CopyBtn text={l.keywords.join(", ")} label="Keywords" />
                </div>
              )}
            </div>
          ))}
          {!!out.ask.length && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-1 font-semibold">{hafiz.first} would like to know (to make it stronger):</div>
              <ul className="ml-4 list-disc space-y-0.5">
                {out.ask.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ buyer replies
function ReplyTab() {
  const mei = useStaff("emp-cs", "Mei Ling Wong");
  const notes = useOffice((s) => s.settings.shopNotes ?? "");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"friendly" | "formal">("friendly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [out, setOut] = useState<{ lang: string; replies: { label: string; text: string }[]; note: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await post<{ lang: string; replies: { label: string; text: string }[]; note: string; usage?: Usage; model?: string }>({
        kind: "reply",
        message,
        context: notes,
        tone,
        employee: { name: mei.name, title: mei.title, model: mei.model },
      });
      setOut(j);
      recordTask(mei.id, `Draft buyer reply: ${message.slice(0, 50)}`, `${j.replies.length} reply options drafted${j.lang ? ` in ${j.lang}` : ""}.`, j.usage, j.model);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Paste a buyer&apos;s chat message. <b className="text-slate-800">{mei.first}</b> drafts replies in the buyer&apos;s language — copy the one you like into Shopee or Lazada chat.
      </p>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="e.g. Hi boss, filter ni boleh pasang dekat shower kat rumah sewa tak? Berapa lama tahan?" />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(["friendly", "formal"] as const).map((t) => (
            <button key={t} onClick={() => setTone(t)} className={cn("rounded-md px-3 py-1 font-medium", tone === t ? "bg-panel text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500")}>
              {t === "friendly" ? "Friendly" : "Formal"}
            </button>
          ))}
        </div>
        <Button onClick={() => void run()} disabled={busy || !message.trim()} className="ml-auto">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? `${mei.first} is drafting…` : `Ask ${mei.first}`}
        </Button>
      </div>
      <ShopNotes />
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {out && (
        <div className="space-y-2">
          {out.replies.map((r) => (
            <div key={r.label} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1 flex items-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {r.label}
                <span className="ml-auto normal-case tracking-normal">
                  <CopyBtn text={r.text} />
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800">{r.text}</p>
            </div>
          ))}
          {out.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠️ {out.note}</p>}
          <p className="text-[11px] text-slate-500">Words in [brackets] are for you to fill in before sending.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ campaigns
function CampaignTab({ catalog, levels }: { catalog: CatalogRow[]; levels: Level[] }) {
  const hafiz = useStaff("emp-mkt-spec", "Hafiz Ismail");
  const savedPlans = useOffice((s) => s.settings.campaignPlans);
  const plans = useMemo(() => savedPlans ?? {}, [savedPlans]);
  const update = useOffice((s) => s.updateSettings);
  const events = useMemo(() => upcomingEvents(new Date(), 120), []);
  const [sel, setSel] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ev = events.find((e) => e.id === sel) ?? null;
  const saved = ev ? plans[ev.id] : undefined;

  const run = async () => {
    if (!ev) return;
    setBusy(true);
    setErr(null);
    try {
      const products = levels.length
        ? levels.map((l) => ({ name: l.name, units30: Math.round(l.perDay * 30), left: l.left, perDay: Math.round(l.perDay * 10) / 10 }))
        : catalog.slice(0, 12).map((c) => ({ name: c.variation ? `${c.product} — ${c.variation}` : c.product, units30: c.units30 }));
      const j = await post<{ plan: string; usage?: Usage; model?: string }>({
        kind: "campaign",
        event: { name: ev.name, date: ev.date, daysLeft: ev.daysLeft, tip: ev.tip },
        products,
        budget,
        notes,
        employee: { name: hafiz.name, title: hafiz.title, model: hafiz.model },
      });
      const keep = Object.fromEntries(
        Object.entries(plans)
          .sort((a, b) => b[1].at.localeCompare(a[1].at))
          .slice(0, 11),
      );
      update({ campaignPlans: { ...keep, [ev.id]: { plan: j.plan, at: new Date().toISOString() } } });
      recordTask(hafiz.id, `Campaign plan: ${ev.name}`, `Plan ready for ${ev.name} (${ev.date}).`, j.usage, j.model);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        The next four months of Malaysian sale days and festivals. <b className="text-slate-800">{hafiz.first}</b> reminds you on Telegram and your phone 14 and 3 days before each big one, and plans the campaign from your real sales and stock.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => setSel(e.id === sel ? null : e.id)}
            className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-left", e.id === sel ? "border-sky-400 bg-sky-50" : "border-slate-200 hover:bg-slate-50")}
          >
            <div className="w-12 shrink-0 text-center">
              <div className="text-lg font-bold leading-none text-slate-900 tabular-nums">{e.daysLeft}</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{e.daysLeft === 1 ? "day" : "days"}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
              <div className="text-[11px] text-slate-500">{new Date(`${e.date}T12:00:00+08:00`).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}</div>
            </div>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", KIND_STYLE[e.kind])}>{KIND_LABEL[e.kind]}</span>
            {plans[e.id] && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Plan ready" />}
          </button>
        ))}
      </div>
      {ev && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="text-sm font-semibold text-slate-900">{ev.name}</div>
          <p className="text-xs text-slate-600">{ev.tip}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Ad budget (optional), e.g. RM500" />
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to focus on? (optional)" />
          </div>
          <div className="flex items-center gap-2">
            {!levels.length && <span className="text-[11px] text-slate-500">Tip: set up Stock for better stock advice.</span>}
            <Button onClick={() => void run()} disabled={busy} className="ml-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? `${hafiz.first} is planning…` : saved ? "Plan again" : `Plan with ${hafiz.first}`}
            </Button>
          </div>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
          {saved && (
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="mb-1 flex items-center text-[11px] text-slate-500">
                Planned {new Date(saved.at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                <span className="ml-auto">
                  <CopyBtn text={saved.plan} />
                </span>
              </div>
              <Markdown>{saved.plan}</Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
