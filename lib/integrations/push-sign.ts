// Webhook ("push") signature checks — pure, unit-tested.
//
// Lazada (Open Platform → App Console → Push Mechanism docs):
//   Authorization = HEX(HMAC-SHA256(key = App Secret, base = AppKey + raw body))
// Shopee (Open Platform → Push Mechanism docs):
//   Authorization = HEX(HMAC-SHA256(key = Partner Key, base = push URL + "|" + raw body))
// The raw body must be used exactly as received (never re-serialised JSON).

import { createHmac, timingSafeEqual } from "node:crypto";

export function lazadaPushSignature(appKey: string, appSecret: string, rawBody: string) {
  return createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
}

export function shopeePushSignature(partnerKey: string, url: string, rawBody: string) {
  return createHmac("sha256", partnerKey).update(`${url}|${rawBody}`).digest("hex");
}

/** Constant-time compare of two hex signatures (case-insensitive). */
export function sameSignature(expected: string, given: string | null | undefined) {
  if (!given) return false;
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(given.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
