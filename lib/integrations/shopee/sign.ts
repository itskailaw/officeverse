// Shopee Open Platform v2 request signing (pure, unit-tested).
// Source: open.shopee.com → Developer Guide → Authorization and Authentication.
//   Shop APIs:   partner_id + api_path + timestamp + access_token + shop_id
//   Public APIs: partner_id + api_path + timestamp
// HMAC-SHA256 keyed with the partner key; lowercase hex.

import { createHmac } from "node:crypto";

export function shopeeSign(partnerKey: string, parts: (string | number)[]) {
  return createHmac("sha256", partnerKey).update(parts.map(String).join("")).digest("hex");
}

export function publicSign(partnerKey: string, partnerId: number, path: string, timestamp: number) {
  return shopeeSign(partnerKey, [partnerId, path, timestamp]);
}

export function shopSign(partnerKey: string, partnerId: number, path: string, timestamp: number, accessToken: string, shopId: number) {
  return shopeeSign(partnerKey, [partnerId, path, timestamp, accessToken, shopId]);
}

export type ShopeeEnv = "live" | "sandbox";

export const SHOPEE_HOSTS: Record<ShopeeEnv, { api: string; auth: string }> = {
  live: { api: "https://partner.shopeemobile.com", auth: "https://open.shopee.com/auth" },
  sandbox: { api: "https://openplatform.sandbox.test-stable.shopee.sg", auth: "https://open.sandbox.test-stable.shopee.com/auth" },
};

/** Authorization link (new format, no signature required). */
export function authLink(env: ShopeeEnv, partnerId: number, redirectUri: string, state: string) {
  const u = new URL(SHOPEE_HOSTS[env].auth);
  u.searchParams.set("partner_id", String(partnerId));
  u.searchParams.set("auth_type", "seller");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

/** Split [from, to] (unix seconds) into windows of at most 15 days, as get_order_list requires. */
export function windows(from: number, to: number, maxDays = 15) {
  const out: [number, number][] = [];
  const step = maxDays * 86400 - 1;
  for (let a = from; a < to; a += step + 1) out.push([a, Math.min(to, a + step)]);
  return out;
}
