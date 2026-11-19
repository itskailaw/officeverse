"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, MessageSquareText, RefreshCw, Send, Sparkles, XCircle } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useOffice } from "@/lib/store/office-store";
import { useLive } from "@/lib/integrations/client";
import { draftReply, loadMessages, sendReply, useInbox, type ChatMsg, type ChatSession } from "@/lib/integrations/inbox";
import { buildContext, employeeBrief } from "@/lib/ai/runner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { cn, timeAgo } from "@/lib/utils";

const CS_ID = "emp-cs";

const klTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

export function CustomerInbox() {
  const open = useUI((s) => s.dialog === "inbox");
  const set = useUI((s) => s.set);
  const { chats, loading, error, loaded, loadChats } = useInbox();
  const lazada = useLive((s) => s.status?.integrations.some((i) => i.provider === "lazada" && i.status !== "expired"));
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void loadChats();
    const t = window.setInterval(() => void loadChats(), 30_000);
    return () => window.clearInterval(t);
  }, [open, loadChats]);

  const current = chats.find((c) => c.id === active) ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => set({ dialog: o ? "inbox" : null })}>
      <DialogContent title="Customer inbox" description="Lazada buyer chats · Mei Ling drafts, you approve before anything is sent." className="h-[88vh] max-w-5xl">
        {!lazada ? (
          <div className="p-6 text-sm text-slate-600">Connect Lazada first (Settings → Integrations). Shopee chat isn&apos;t available for this app yet.</div>
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[300px_1fr]">
            <div className={cn("flex min-h-0 flex-col border-r border-slate-100", active && "hidden md:flex")}>
              <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#2a78d6]" /> Lazada · {chats.length} chats
                </span>
                <Button size="icon" variant="ghost" title="Refresh" onClick={() => void loadChats()} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                </Button>
              </div>
              {error && (
                <div className="mx-3 mb-2 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
                  <XCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                {!loaded && <Loader2 className="m-4 h-5 w-5 animate-spin text-slate-400" />}
                {loaded && !chats.length && !error && <p className="p-4 text-xs text-slate-500">No buyer chats yet.</p>}
                {chats.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c.id)}
                    className={cn("flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", active === c.id && "bg-sky-50")}
                  >
                    <Avatar s={c} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", c.unread ? "font-semibold text-slate-900" : "text-slate-700")}>{c.title}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{c.lastAt ? timeAgo(c.lastAt) : ""}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-slate-500">{c.summary || "…"}</span>
                        {c.unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className={cn("min-h-0", !active && "hidden md:block")}>
              {current ? (
                <Thread key={current.id} session={current} onBack={() => setActive(null)} />
              ) : (
                <div className="grid h-full place-items-center text-sm text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <MessageSquareText className="h-8 w-8" /> Pick a chat
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ s }: { s: ChatSession }) {
  return s.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full bg-slate-100 object-cover" referrerPolicy="no-referrer" />
  ) : (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{s.title.slice(0, 1).toUpperCase()}</div>
  );
}

function Thread({ session, onBack }: { session: ChatSession; onBack: () => void }) {
  const toast = useUI((s) => s.toast);
  const mei = useOffice((s) => s.employees.find((e) => e.id === CS_ID && e.active));
  const role = useLive((s) => s.status?.role);
  const canSend = role === "owner" || role === "admin";
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; note: string | null; category: string } | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadMessages(session.id);
      setMsgs(r.messages);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [session.id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    void end.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const askDraft = async () => {
    const employee = employeeBrief(CS_ID);
    if (!employee) return toast("error", "Mei Ling isn't on the team — re-hire a customer service employee first.");
    setBusy("draft");
    try {
      const d = await draftReply({ sessionId: session.id, employee, context: buildContext() });
      if (!d.reply) toast("error", d.note ?? "No draft returned.");
      else setDraft({ text: d.reply, note: d.note, category: d.category });
      useOffice.getState().logActivity(CS_ID, `drafted a Lazada reply for ${session.title}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const approveAndSend = async () => {
    if (!draft?.text.trim()) return;
    setBusy("send");
    try {
      await sendReply(session.id, draft.text.trim());
      useOffice.getState().logActivity(CS_ID, `CEO approved and sent a Lazada reply to ${session.title}`);
      toast("success", "Reply sent on Lazada");
      setDraft(null);
      await load();
      void useInbox.getState().loadChats();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5">
        <button className="text-xs text-sky-700 md:hidden" onClick={onBack}>
          ← Back
        </button>
        <Avatar s={session} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{session.title}</div>
          <div className="text-[11px] text-slate-500">Lazada chat{session.lastAt ? ` · last message ${timeAgo(session.lastAt)}` : ""}</div>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-3">
        {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">{err}</div>}
        {!msgs && !err && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {msgs?.map((m) => (
          <div key={m.id} className={cn("flex", m.fromBuyer ? "justify-start" : "justify-end")}>
            <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm", m.fromBuyer ? "rounded-bl-sm bg-panel text-slate-800 ring-1 ring-slate-200" : "rounded-br-sm bg-[#2a78d6] text-white")}>
              {m.kind === "image" && m.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="Picture from chat" className="max-h-48 rounded-lg" referrerPolicy="no-referrer" />
              ) : (
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
              )}
              <div className={cn("mt-0.5 text-[10px]", m.fromBuyer ? "text-slate-400" : "text-sky-100")}>
                {klTime(m.at)}
                {m.autoReply ? " · auto-reply" : ""}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="border-t border-slate-100 p-3">
        {draft ? (
          <div className="space-y-2 rounded-xl border border-purple-200 bg-purple-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-purple-900">
              <Bot className="h-4 w-4" /> <span className="font-semibold">Mei Ling&apos;s draft</span>
              <Badge variant="secondary">{draft.category}</Badge>
              <span className="text-purple-700">Edit if needed — nothing is sent until you approve.</span>
            </div>
            {draft.note && <div className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 ring-1 ring-amber-200">Note for you: {draft.note}</div>}
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={4} maxLength={2000} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={approveAndSend} disabled={!canSend || busy !== null || !draft.text.trim()}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve &amp; send
              </Button>
              <Button size="sm" variant="outline" onClick={askDraft} disabled={busy !== null}>
                {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} Redraft
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy !== null}>
                Discard
              </Button>
            </div>
            {!canSend && <p className="text-[11px] text-slate-500">Only the workspace owner or an admin can approve and send.</p>}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={askDraft} disabled={busy !== null || !mei}>
              {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask Mei Ling to draft a reply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft({ text: "", note: null, category: "manual" })}
              disabled={busy !== null}
            >
              <Send /> Write my own
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
