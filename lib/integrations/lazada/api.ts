import "server-only";
import { LAZADA_HOSTS, lazadaSign } from "./sign";

export interface LazadaConfig {
  appKey: string;
  appSecret: string;
}

export class LazadaError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

export function lazadaConfig(): LazadaConfig | null {
  const appKey = process.env.LAZADA_APP_KEY?.trim();
  const appSecret = process.env.LAZADA_APP_SECRET?.trim();
  return appKey && appSecret ? { appKey, appSecret } : null;
}

export function requireLazadaConfig(): LazadaConfig {
  const c = lazadaConfig();
  if (!c) throw new LazadaError("not_configured", "Lazada isn't configured on the server. Add LAZADA_APP_KEY and LAZADA_APP_SECRET in Vercel.");
  return c;
}

/** LAZADA_API_BASE / LAZADA_AUTH_BASE override the hosts for local testing against a mock. */
const apiBase = () => process.env.LAZADA_API_BASE || LAZADA_HOSTS.api;
const authBase = () => process.env.LAZADA_AUTH_BASE || LAZADA_HOSTS.auth;

interface Envelope<T> {
  code: string;
  type?: string;
  message?: string;
  request_id?: string;
  data?: T;
}

async function call<T>(
  cfg: LazadaConfig,
  host: string,
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string | null,
  method: "GET" | "POST",
): Promise<Envelope<T> & Record<string, unknown>> {
  const p: Record<string, string> = { app_key: cfg.appKey, sign_method: "sha256", timestamp: String(Date.now()) };
  if (accessToken) p.access_token = accessToken;
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p[k] = String(v);
  p.sign = lazadaSign(cfg.appSecret, path, p);
  const url = new URL(host + path);
  const init: RequestInit = { method, cache: "no-store", signal: AbortSignal.timeout(20_000) };
  if (method === "GET") for (const [k, v] of Object.entries(p)) url.searchParams.set(k, v);
  else {
    init.body = new URLSearchParams(p);
    init.headers = { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };
  }
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({ code: `http_${res.status}`, message: `Lazada request failed (${res.status})` }))) as Envelope<T> & Record<string, unknown>;
  if (!res.ok || (json.code !== undefined && String(json.code) !== "0")) {
    throw new LazadaError(String(json.code ?? `http_${res.status}`), json.message || `Lazada request failed (${res.status})`, json.request_id);
  }
  return json;
}

/**
 * Sponsored Solutions call: these APIs answer with { result, success, errorMsg, code }
 * instead of { data }. Returns `result`; throws on success === false.
 */
export async function lazadaAdsGet<T>(cfg: LazadaConfig, path: string, params: Record<string, string | number | undefined>, accessToken: string) {
  const j = await call<unknown>(cfg, apiBase(), path, params, accessToken, "GET");
  if (j.success === false || j.success === "false") {
    throw new LazadaError(String(j.errorCode ?? j.errorKey ?? "ads_error"), String(j.errorMsg || "Sponsored Solutions request failed"), j.request_id as string | undefined);
  }
  return j.result as T;
}

/** Instant Messaging call: { code, data, success, err_code, err_message }. GET for reads, POST for writes. */
export async function lazadaIm<T>(cfg: LazadaConfig, path: string, params: Record<string, string | number | undefined>, accessToken: string, method: "GET" | "POST" = "GET") {
  const j = await call<T>(cfg, apiBase(), path, params, accessToken, method);
  if (j.success === false || j.success === "false" || (j.err_code !== undefined && String(j.err_code) !== "0" && String(j.err_code) !== "")) {
    throw new LazadaError(String(j.err_code ?? "im_error"), String(j.err_message || "Lazada chat request failed"), j.request_id as string | undefined);
  }
  return j.data as T;
}

/** Shop-level API call on the Malaysia gateway. */
export async function lazadaGet<T>(cfg: LazadaConfig, path: string, params: Record<string, string | number | undefined>, accessToken: string) {
  return (await call<T>(cfg, apiBase(), path, params, accessToken, "GET")).data as T;
}

export interface LazadaToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in?: number;
  account?: string;
  country?: string;
  country_user_info?: { country: string; seller_id: string; user_id?: string; short_code?: string }[];
}

export async function createToken(cfg: LazadaConfig, code: string) {
  return (await call<never>(cfg, authBase(), "/auth/token/create", { code }, null, "POST")) as unknown as LazadaToken;
}

export async function refreshToken(cfg: LazadaConfig, refresh: string) {
  return (await call<never>(cfg, authBase(), "/auth/token/refresh", { refresh_token: refresh }, null, "POST")) as unknown as LazadaToken;
}
