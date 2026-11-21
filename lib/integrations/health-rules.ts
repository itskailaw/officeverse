/** Pure rules for the System health page (unit-tested). */
export type Level = "ok" | "warn" | "bad" | "off";
export interface Check {
  key: string;
  area: "Marketplaces" | "Automation" | "Messaging" | "Setup";
  label: string;
  level: Level;
  detail: string;
  fix?: string;
}

const mins = (iso: string | null | undefined, now: number) => (iso ? (now - Date.parse(iso)) / 60000 : Infinity);
export const ago = (m: number) => (!Number.isFinite(m) ? "never" : m < 1 ? "just now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`);

export interface StoreFacts {
  platform: "shopee" | "lazada";
  status: string;
  lastSync: string | null;
  lastError: string | null;
  refreshExpires: string | null;
  lastPush: string | null;
  autoRun: { at: string; source: string; state: string } | null;
  lastScheduledRun: string | null;
}

export function storeChecks(f: StoreFacts, now = Date.now()): Check[] {
  const name = f.platform === "shopee" ? "Shopee" : "Lazada";
  const out: Check[] = [];
  const syncM = mins(f.lastSync, now);
  const expDays = f.refreshExpires ? (Date.parse(f.refreshExpires) - now) / 86400000 : Infinity;
  if (f.status === "expired")
    out.push({ key: `${f.platform}-conn`, area: "Marketplaces", label: `${name} connection`, level: "bad", detail: "Login expired — no orders are syncing.", fix: `Settings → Integrations → ${name} → Re-connect` });
  else if (f.status === "error")
    out.push({ key: `${f.platform}-conn`, area: "Marketplaces", label: `${name} connection`, level: "bad", detail: `Last sync failed: ${(f.lastError ?? "unknown error").slice(0, 140)}`, fix: `Settings → Integrations → ${name} → Sync now; if it keeps failing, Re-connect` });
  else if (expDays < 5)
    out.push({ key: `${f.platform}-conn`, area: "Marketplaces", label: `${name} connection`, level: "warn", detail: `Login expires in ${Math.max(0, Math.round(expDays))} day(s).`, fix: `Settings → Integrations → ${name} → Re-connect` });
  else out.push({ key: `${f.platform}-conn`, area: "Marketplaces", label: `${name} connection`, level: "ok", detail: "Connected." });

  out.push({
    key: `${f.platform}-sync`,
    area: "Marketplaces",
    label: `${name} order sync`,
    level: syncM > 360 ? "bad" : syncM > 60 ? "warn" : "ok",
    detail: `Last synced ${ago(syncM)}.`,
    fix: syncM > 60 ? `Settings → Integrations → ${name} → Sync now` : undefined,
  });
  const pushM = mins(f.lastPush, now);
  out.push({
    key: `${f.platform}-push`,
    area: "Marketplaces",
    label: `${name} instant updates`,
    level: !f.lastPush ? "warn" : pushM > 2 * 1440 ? "warn" : "ok",
    detail: f.lastPush ? `Last instant update ${ago(pushM)}.` : "No instant update received yet — new orders rely on the 10-minute check.",
    fix: !f.lastPush || pushM > 2 * 1440 ? (f.platform === "shopee" ? "Shopee Open Platform → Push Mechanism: Live Call Back URL + Order Status Push" : "Lazada Open Platform → App → Push: callback URL + order push") : undefined,
  });
  return out;
}

export function schedulerCheck(lastScheduled: string | null, now = Date.now()): Check {
  const m = mins(lastScheduled, now);
  return {
    key: "scheduler",
    area: "Automation",
    label: "10-minute order check",
    level: m > 60 ? "bad" : m > 25 ? "warn" : "ok",
    detail: lastScheduled ? `Last ran ${ago(m)}.` : "Hasn't run yet.",
    fix: m > 25 ? "GitHub → repo → Actions → Daily jobs: check it's enabled and the CRON_SECRET secret matches Vercel" : undefined,
  };
}

/** Which checks just turned bad (to alert), or recovered (to say so) — compared with the last alert state. */
export function transitions(prev: Record<string, Level>, checks: Check[]) {
  const broke = checks.filter((c) => c.level === "bad" && prev[c.key] !== "bad");
  const fixed = checks.filter((c) => c.level !== "bad" && prev[c.key] === "bad");
  const next: Record<string, Level> = Object.fromEntries(checks.map((c) => [c.key, c.level]));
  return { broke, fixed, next };
}
