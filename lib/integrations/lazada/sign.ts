// Lazada Open Platform request signing (pure, unit-tested).
// Matches Lazada's official SDK (lazop): sign = UPPER(HEX(HMAC-SHA256(app_secret,
//   api_path + concat(sorted(key + value) for every parameter except "sign")))).

import { createHmac } from "node:crypto";

export function lazadaSign(appSecret: string, apiPath: string, params: Record<string, string>) {
  const base = apiPath + Object.keys(params).filter((k) => k !== "sign").sort().map((k) => k + params[k]).join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

export const LAZADA_HOSTS = {
  /** Malaysia API gateway */
  api: "https://api.lazada.com.my/rest",
  /** token create / refresh */
  auth: "https://auth.lazada.com/rest",
  /** seller consent page */
  authorize: "https://auth.lazada.com/oauth/authorize",
};

/** Seller authorisation link. */
export function lazadaAuthLink(appKey: string, redirectUri: string, state: string) {
  const u = new URL(LAZADA_HOSTS.authorize);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("force_auth", "true");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("client_id", appKey);
  u.searchParams.set("state", state);
  return u.toString();
}

/** "2026-11-19 10:12:33 +0800" (Lazada) → ISO string; returns null if unparseable. */
export function parseLazadaDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?$/.exec(s.trim());
  const d = m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO 8601 in Malaysia time, the format Lazada's created_after / update_after expect. */
export function lazadaTime(d: Date) {
  const kl = new Date(d.getTime() + 8 * 3600 * 1000);
  return kl.toISOString().replace(/\.\d{3}Z$/, "+08:00");
}

/** Lazada order statuses → OfficeVerse buckets (unknown statuses are reported, not guessed). */
export const LAZADA_STATUS = {
  toProcess: new Set(["pending", "topack", "repacked"]),
  awaitingPickup: new Set(["packed", "ready_to_ship", "ready_to_ship_pending", "toship"]),
  notSales: new Set(["unpaid", "canceled", "cancelled", "returned", "failed", "failed_delivery", "lost_by_3pl", "damaged_by_3pl", "shipped_back", "shipped_back_success"]),
};
