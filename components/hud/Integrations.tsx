"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Link2, Loader2, PlugZap, RefreshCw, Send, Unplug, XCircle } from "lucide-react";
import { useLive, type IntegrationStatus } from "@/lib/integrations/client";
import { useUI } from "@/lib/store/ui-store";
import { supabaseConfigured } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div>
        <div className={cn("font-medium", ok ? "text-slate-800" : "text-slate-600")}>{label}</div>
        {!ok && <div className="text-[11px] text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

const MARKETS = {
  shopee: {
    name: "Shopee Malaysia",
    letter: "S",
    color: "#ee4d2d",
    blurb: "Orders, parcels to pack, revenue and ads balance — Water Guardian Solution",
    keysLabel: "Shopee app keys",
    keysHint: "Add SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY in Vercel (Secret) and redeploy.",
    account: "shop",
  },
  lazada: {
    name: "Lazada Malaysia",
    letter: "L",
    color: "#0f146d",
    blurb: "Orders, parcels to pack and revenue — Water Guardian Solution",
    keysLabel: "Lazada app keys",
    keysHint: "Add LAZADA_APP_KEY and LAZADA_APP_SECRET in Vercel (Secret) and redeploy.",
    account: "store",
  },
} as const;

function MarketplaceCard({ provider, status }: { provider: keyof typeof MARKETS; status: IntegrationStatus }) {
  const { loadStatus, syncShopee, syncLazada, syncing } = useLive();
  const toast = useUI((s) => s.toast);
  const m = MARKETS[provider];
  const s = status.setup;
  const keysOk = provider === "shopee" ? s.shopeeApp : !!s.lazadaApp;
  const ready = s.serviceRole && s.encryptionKey && keysOk;
  const shop = status.integrations.find((i) => i.provider === provider);
  const canManage = status.role === "owner" || status.role === "admin";
  const sync = provider === "shopee" ? syncShopee : syncLazada;
  const connectUrl = `/api/integrations/${provider}/connect`;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: m.color }}>
            {m.letter}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{m.name}</div>
            <div className="text-[11px] text-slate-500">{m.blurb}</div>
          </div>
        </div>
        {shop ? (
          <Badge variant={shop.status === "connected" ? "success" : "danger"}>{shop.status === "connected" ? "Connected" : shop.status === "expired" ? "Re-connect needed" : "Error"}</Badge>
        ) : (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </div>

      {shop ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{m.account === "shop" ? "Shop" : "Store"}</div>
              <div className="font-medium text-slate-800">{shop.shopName ?? `${m.account === "shop" ? "Shop" : "Seller"} ${shop.shopId}`}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Last successful sync</div>
              <div className="font-medium text-slate-800">{shop.lastSync ? timeAgo(shop.lastSync) : "Never"}</div>
            </div>
            {shop.expiresAt && (
              <div className="col-span-2 rounded-lg bg-slate-50 p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Authorisation valid until</div>
                <div className="font-medium text-slate-800">{new Date(shop.expiresAt).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium" })}</div>
              </div>
            )}
          </div>
          {shop.lastError && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
              <XCircle className="h-4 w-4 shrink-0" /> {shop.lastError}
            </div>
          )}
          {shop.lastSummary?.warnings?.map((w, i) => (
            <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              {w}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              disabled={syncing}
              onClick={async () => {
                const r = await sync();
                toast(r.ok ? "success" : "error", r.message);
              }}
            >
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
            </Button>
            {canManage && (
              <Button size="sm" variant="outline" asChild>
                <a href={connectUrl}>
                  <Link2 /> Re-connect
                </a>
              </Button>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  if (!confirm(`Disconnect ${m.name}? Stored tokens are deleted; synced orders stay for history.`)) return;
                  const r = await fetch(`/api/integrations/${provider}/disconnect`, { method: "POST" });
                  toast(r.ok ? "success" : "error", r.ok ? `${m.name} disconnected` : "Couldn't disconnect");
                  void loadStatus();
                  void useLive.getState().loadSummary();
                }}
              >
                <Unplug /> Disconnect
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <Check ok={keysOk} label={m.keysLabel} hint={m.keysHint} />
            <Check ok={s.serviceRole} label="Secure server storage" hint="Add SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API Keys → secret key) in Vercel (Secret)." />
            <Check ok={s.encryptionKey} label="Token encryption key" hint="Add INTEGRATION_ENCRYPTION_KEY (a long random string) in Vercel (Secret)." />
          </div>
          {provider === "shopee" && s.shopeeEnv === "sandbox" && (
            <p className="text-[11px] text-amber-700">Sandbox mode (SHOPEE_ENV=sandbox): connects a Shopee test shop, not your real store.</p>
          )}
          <Button disabled={!ready || !canManage} asChild={ready && canManage}>
            {ready && canManage ? (
              <a href={connectUrl}>
                <PlugZap /> Connect {m.name.split(" ")[0]} {m.account}
              </a>
            ) : (
              <span>
                <PlugZap /> Connect {m.name.split(" ")[0]} {m.account}
              </span>
            )}
          </Button>
          {!canManage && <p className="text-[11px] text-slate-500">Only the workspace owner can connect stores.</p>}
        </div>
      )}
    </div>
  );
}

export function IntegrationsPanel() {
  const { status, loadStatus, error } = useLive();

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!supabaseConfigured)
    return <p className="text-xs text-slate-500">Integrations need accounts and cloud storage. Connect Supabase first (see the README).</p>;
  if (!status && error)
    return (
      <div className="space-y-2">
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <XCircle className="h-4 w-4 shrink-0" /> Couldn&apos;t load integration status: {error}
        </div>
        <Button size="sm" variant="outline" onClick={() => void loadStatus()}>
          <RefreshCw /> Try again
        </Button>
      </div>
    );
  if (!status) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;

  return (
    <div className="space-y-4">
      <MarketplaceCard provider="shopee" status={status} />
      <MarketplaceCard provider="lazada" status={status} />
      <TelegramCard status={status} />
      <p className="text-[11px] text-slate-500">
        OfficeVerse syncs automatically when you open the office (if the last sync is older than 15 minutes) and once a day overnight.
      </p>
    </div>
  );
}

function TelegramCard({ status }: { status: IntegrationStatus }) {
  const { loadStatus } = useLive();
  const toast = useUI((s) => s.toast);
  const [busy, setBusy] = useState<"connect" | "test" | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const s = status.setup;
  const tg = status.integrations.find((i) => i.provider === "telegram");
  const canManage = status.role === "owner" || status.role === "admin";
  const ready = !!s.telegramBot && s.serviceRole;

  // while waiting for the CEO to press Start in Telegram, check every 3 s
  useEffect(() => {
    if (!link || tg) return;
    const t = window.setInterval(() => void loadStatus(), 3000);
    const stop = window.setTimeout(() => window.clearInterval(t), 10 * 60 * 1000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, [link, tg, loadStatus]);
  useEffect(() => {
    if (tg && link) {
      setLink(null);
      toast("success", "Telegram connected — check your Telegram for a welcome message.");
    }
  }, [tg, link, toast]);

  const post = async (url: string) => {
    const r = await fetch(url, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
    return j as { url?: string };
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#229ED9] text-white">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Telegram</div>
            <div className="text-[11px] text-slate-500">Morning briefing, instant alerts, and chat with your team</div>
          </div>
        </div>
        {tg ? <Badge variant={tg.status === "connected" ? "success" : "danger"}>{tg.status === "connected" ? "Connected" : "Error"}</Badge> : <Badge variant="secondary">Not connected</Badge>}
      </div>

      {tg ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Chat</div>
              <div className="font-medium text-slate-800">{tg.shopName ?? "Telegram"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Last briefing sent</div>
              <div className="font-medium text-slate-800">{tg.lastSync ? timeAgo(tg.lastSync) : "Not yet"}</div>
            </div>
          </div>
          {tg.lastError && (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
              <XCircle className="h-4 w-4 shrink-0" /> {tg.lastError}
            </div>
          )}
          {!s.cronSecret && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              Add CRON_SECRET (any long random text, Secret) in Vercel and redeploy, otherwise the daily briefing can&apos;t run.
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("test");
                try {
                  await post("/api/integrations/telegram/test");
                  toast("success", "Briefing sent — check Telegram.");
                } catch (e) {
                  toast("error", e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(null);
                  void loadStatus();
                }
              }}
            >
              {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />} Send briefing now
            </Button>
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  if (!confirm("Disconnect Telegram? Briefings will stop.")) return;
                  await fetch("/api/integrations/telegram/disconnect", { method: "POST" });
                  toast("success", "Telegram disconnected");
                  void loadStatus();
                }}
              >
                <Unplug /> Disconnect
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <Check ok={!!s.telegramBot} label="Telegram bot token" hint="Create a bot with @BotFather in Telegram, then add TELEGRAM_BOT_TOKEN in Vercel (Secret) and redeploy." />
            <Check ok={s.serviceRole} label="Secure server storage" hint="Add SUPABASE_SERVICE_ROLE_KEY in Vercel (Secret)." />
            <Check ok={!!s.cronSecret} label="Daily schedule key" hint="Add CRON_SECRET (any long random text) in Vercel (Secret) so the 8:30am briefing can run." />
          </div>
          {link ? (
            <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              <div className="font-semibold">Last step: open Telegram and press Start</div>
              <Button size="sm" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <Send /> Open Telegram
                </a>
              </Button>
              <div className="flex items-center gap-2 text-[11px] text-sky-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for you to press Start… (link valid 30 minutes)
              </div>
            </div>
          ) : (
            <Button
              disabled={!ready || !canManage || busy !== null}
              onClick={async () => {
                setBusy("connect");
                try {
                  const r = await post("/api/integrations/telegram/connect");
                  if (r.url) {
                    setLink(r.url);
                    window.open(r.url, "_blank", "noopener");
                  }
                } catch (e) {
                  toast("error", e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "connect" ? <Loader2 className="animate-spin" /> : <PlugZap />} Connect Telegram
            </Button>
          )}
          {!canManage && <p className="text-[11px] text-slate-500">Only the workspace owner can connect Telegram.</p>}
        </div>
      )}
    </div>
  );
}
