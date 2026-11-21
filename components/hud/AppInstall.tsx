"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, Download, Loader2, Share, Smartphone, Trash2 } from "lucide-react";
import { useUI } from "@/lib/store/ui-store";
import { useLive } from "@/lib/integrations/client";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;

const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function b64ToBytes(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
function deviceName() {
  const ua = navigator.userAgent;
  const kind = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows PC" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${kind} · ${browser}${isStandalone() ? " (app)" : ""}`;
}

/** Registers the service worker once and remembers the browser's install prompt (Chrome / Edge / Android). */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstall = e as InstallEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
}

interface Device {
  endpoint: string;
  device: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** Settings card: install OfficeVerse as an app and turn on phone / desktop notifications. */
export function AppInstallCard() {
  const role = useLive((s) => s.status?.role);
  const toast = useUI((s) => s.toast);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [mine, setMine] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const r = await fetch("/api/push/subscribe", { cache: "no-store" });
      if (r.ok) setDevices((await r.json()).devices);
    } catch {}
  }, []);
  useEffect(() => {
    setInstalled(isStandalone());
    setCanPrompt(!!deferredInstall);
    setPerm(pushSupported() ? Notification.permission : "unsupported");
    if (pushSupported())
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((s) => setMine(s?.endpoint ?? null))
        .catch(() => {});
    void loadDevices();
  }, [loadDevices]);

  if (role !== "owner") return null;
  const ios = isIOS();

  const install = async () => {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    const r = await deferredInstall.userChoice;
    deferredInstall = null;
    setCanPrompt(false);
    if (r.outcome === "accepted") toast("success", "OfficeVerse installed — find it on your home screen / desktop");
  };

  const enable = async () => {
    setBusy("on");
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") throw new Error("Notifications were blocked — allow them for this site in your browser settings.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const k = await fetch("/api/push/key", { cache: "no-store" });
      const kj = await k.json();
      if (!k.ok) throw new Error(kj.error ?? "Couldn't get the notification key.");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(kj.publicKey) }));
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device: deviceName() }) });
      const rj = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((rj as { error?: string }).error ?? `Request failed (${r.status})`);
      setMine(sub.endpoint);
      toast("success", "Notifications on for this device");
      await loadDevices();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };
  const remove = async (endpoint: string) => {
    setBusy(endpoint);
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) }).catch(() => {});
    if (endpoint === mine) {
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
      setMine(null);
    }
    await loadDevices();
    setBusy(null);
  };
  const test = async () => {
    setBusy("test");
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      toast(j.sent ? "success" : "error", j.sent ? `Test sent to ${j.sent} device${j.sent > 1 ? "s" : ""}` : "No device received it — turn notifications on first");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
        <Smartphone className="h-4 w-4 text-slate-500" /> App & phone notifications
      </div>

      {/* install */}
      <div className="rounded-lg bg-slate-50 p-2.5 text-xs">
        {installed ? (
          <div className="flex items-center gap-1.5 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> You&apos;re using the installed OfficeVerse app.
          </div>
        ) : ios ? (
          <div className="text-slate-700">
            <b>Install on this iPad / iPhone:</b> tap <Share className="mx-0.5 inline h-3.5 w-3.5" /> <b>Share</b> in Safari → <b>Add to Home Screen</b> → <b>Add</b>. Then open
            OfficeVerse from its new icon and come back here to turn on notifications (Apple only allows them in the installed app, iOS 16.4+).
          </div>
        ) : canPrompt ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-700">Install OfficeVerse as an app — its own icon and window, no browser bars.</span>
            <Button size="sm" onClick={install} className="ml-auto">
              <Download /> Install app
            </Button>
          </div>
        ) : (
          <div className="text-slate-700">
            <b>Install:</b> in Chrome or Edge, click the install icon at the right end of the address bar (or ⋮ menu → <b>Install OfficeVerse</b>). On Android: ⋮ → <b>Add to Home
            screen</b>.
          </div>
        )}
      </div>

      {/* notifications */}
      <div className="mt-2 text-xs">
        <div className="mb-1 text-[11px] text-slate-500">
          Get a notification for urgent parcels, buyer cancellations, Farid&apos;s confirmations and anything Ethan finds broken — even when OfficeVerse is closed.
        </div>
        {perm === "unsupported" ? (
          <div className="text-[11px] text-amber-700">{ios && !installed ? "Install OfficeVerse first (above), then open it from the home screen." : "This browser doesn't support notifications."}</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {mine ? (
              <span className="flex items-center gap-1 font-medium text-emerald-700">
                <Bell className="h-3.5 w-3.5" /> On for this device
              </span>
            ) : (
              <Button size="sm" onClick={enable} disabled={busy !== null || (ios && !installed)}>
                {busy === "on" ? <Loader2 className="animate-spin" /> : <Bell />} Turn on for this device
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={test} disabled={busy !== null || !devices?.length}>
              {busy === "test" ? <Loader2 className="animate-spin" /> : null} Send a test
            </Button>
            {perm === "denied" && <span className="text-[11px] text-red-700">Blocked in browser settings for this site.</span>}
          </div>
        )}
        {!!devices?.length && (
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
            {devices.map((d) => (
              <div key={d.endpoint} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                <span className="font-medium text-slate-700">{d.device || "Device"}</span>
                {d.endpoint === mine && <span className="rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-800">this one</span>}
                <span className="text-slate-400">{d.last_used_at ? `last notified ${timeAgo(d.last_used_at)}` : `added ${timeAgo(d.created_at)}`}</span>
                <button onClick={() => void remove(d.endpoint)} disabled={busy !== null} className="ml-auto text-slate-300 hover:text-red-600" aria-label="Turn off for this device">
                  {busy === d.endpoint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : d.endpoint === mine ? <BellOff className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
