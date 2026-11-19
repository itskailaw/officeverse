import "server-only";
import { publicSign, shopSign, SHOPEE_HOSTS, type ShopeeEnv } from "./sign";

export interface ShopeeConfig {
  partnerId: number;
  partnerKey: string;
  env: ShopeeEnv;
}

export class ShopeeError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export function shopeeConfig(): ShopeeConfig | null {
  const id = Number(process.env.SHOPEE_PARTNER_ID);
  const key = process.env.SHOPEE_PARTNER_KEY;
  if (!id || !key) return null;
  return { partnerId: id, partnerKey: key.trim(), env: process.env.SHOPEE_ENV === "sandbox" ? "sandbox" : "live" };
}

export function requireShopeeConfig(): ShopeeConfig {
  const c = shopeeConfig();
  if (!c) throw new ShopeeError("not_configured", "Shopee isn't configured on the server. Add SHOPEE_PARTNER_ID and SHOPEE_PARTNER_KEY in Vercel.");
  return c;
}

const now = () => Math.floor(Date.now() / 1000);

/** API host; SHOPEE_API_BASE overrides it for local testing against a mock server. */
function apiBase(cfg: ShopeeConfig) {
  return process.env.SHOPEE_API_BASE || SHOPEE_HOSTS[cfg.env].api;
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; request_id?: string };
  if (!res.ok || json.error) {
    throw new ShopeeError(json.error || `http_${res.status}`, json.message || `Shopee request failed (${res.status})`, json.request_id);
  }
  return json as T;
}

/** Public (partner-level) POST — used for auth/token endpoints. */
export async function publicPost<T>(cfg: ShopeeConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const ts = now();
  const url = new URL(apiBase(cfg) + path);
  url.searchParams.set("partner_id", String(cfg.partnerId));
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("sign", publicSign(cfg.partnerKey, cfg.partnerId, path, ts));
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return parse<T>(res);
}

/** Shop-level GET with signed common parameters. */
export async function shopGet<T>(
  cfg: ShopeeConfig,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  accessToken: string,
  shopId: number,
): Promise<T> {
  const ts = now();
  const url = new URL(apiBase(cfg) + path);
  url.searchParams.set("partner_id", String(cfg.partnerId));
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", String(shopId));
  url.searchParams.set("sign", shopSign(cfg.partnerKey, cfg.partnerId, path, ts, accessToken, shopId));
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  return parse<T>(res);
}

function signedShopUrl(cfg: ShopeeConfig, path: string, accessToken: string, shopId: number) {
  const ts = now();
  const url = new URL(apiBase(cfg) + path);
  url.searchParams.set("partner_id", String(cfg.partnerId));
  url.searchParams.set("timestamp", String(ts));
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", String(shopId));
  url.searchParams.set("sign", shopSign(cfg.partnerKey, cfg.partnerId, path, ts, accessToken, shopId));
  return url;
}

/** Shop-level POST (JSON body) — used for actions such as ship_order. */
export async function shopPost<T>(cfg: ShopeeConfig, path: string, body: Record<string, unknown>, accessToken: string, shopId: number): Promise<T> {
  const res = await fetch(signedShopUrl(cfg, path, accessToken, shopId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  return parse<T>(res);
}

/** Shop-level POST that returns a file (shipping labels). Throws with Shopee's error if JSON comes back instead. */
export async function shopPostFile(cfg: ShopeeConfig, path: string, body: Record<string, unknown>, accessToken: string, shopId: number): Promise<ArrayBuffer> {
  const res = await fetch(signedShopUrl(cfg, path, accessToken, shopId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("json")) {
    await parse(res);
    throw new ShopeeError("no_file", "Shopee didn't return a label file.");
  }
  return res.arrayBuffer();
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
}

export function getAccessToken(cfg: ShopeeConfig, code: string, shopId: number) {
  return publicPost<TokenResponse>(cfg, "/api/v2/auth/token/get", { code, shop_id: shopId, partner_id: cfg.partnerId });
}

export function refreshAccessToken(cfg: ShopeeConfig, refreshToken: string, shopId: number) {
  return publicPost<TokenResponse>(cfg, "/api/v2/auth/access_token/get", { refresh_token: refreshToken, shop_id: shopId, partner_id: cfg.partnerId });
}
