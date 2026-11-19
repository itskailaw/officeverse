import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { lazadaAuthLink, lazadaSign, lazadaTime, parseLazadaDate } from "../lib/integrations/lazada/sign.ts";

test("sign = UPPER(HMAC-SHA256(secret, path + sorted key+value)), excluding sign", () => {
  const params = { timestamp: "1700000000000", app_key: "123456", sign_method: "sha256", access_token: "AT", limit: "100", sign: "ignored" };
  const base = "/orders/get" + "access_tokenAT" + "app_key123456" + "limit100" + "sign_methodsha256" + "timestamp1700000000000";
  const expected = createHmac("sha256", "secret").update(base).digest("hex").toUpperCase();
  assert.equal(lazadaSign("secret", "/orders/get", params), expected);
  assert.match(expected, /^[0-9A-F]{64}$/);
});

test("auth link targets Lazada's consent page with client_id and redirect", () => {
  const u = new URL(lazadaAuthLink("123456", "https://x.vercel.app/api/integrations/lazada/callback", "st"));
  assert.equal(u.origin + u.pathname, "https://auth.lazada.com/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "123456");
  assert.equal(u.searchParams.get("response_type"), "code");
});

test("dates: Lazada format parses, query format is Malaysia time", () => {
  assert.equal(parseLazadaDate("2026-11-19 10:12:33 +0800"), "2026-11-19T02:12:33.000Z");
  assert.equal(parseLazadaDate("garbage"), null);
  assert.equal(lazadaTime(new Date("2026-11-19T02:12:33.000Z")), "2026-11-19T10:12:33+08:00");
});
