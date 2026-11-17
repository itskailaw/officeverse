// Integration check for the Shopee client against a local mock that verifies
// signatures exactly as documented (partner_id + path + timestamp [+ access_token + shop_id]).
// Run: npx tsx --conditions=react-server scripts/shopee-mock-check.ts
import http from "node:http";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const PARTNER_ID = 2001234;
const KEY = "test-partner-key";
process.env.SHOPEE_PARTNER_ID = String(PARTNER_ID);
process.env.SHOPEE_PARTNER_KEY = KEY;
process.env.SHOPEE_API_BASE = "http://127.0.0.1:4020";
process.env.INTEGRATION_ENCRYPTION_KEY = "x".repeat(40);

const calls: string[] = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url!, "http://x");
  const p = u.pathname;
  const ts = u.searchParams.get("timestamp")!;
  const token = u.searchParams.get("access_token");
  const shop = u.searchParams.get("shop_id");
  const base = token ? `${PARTNER_ID}${p}${ts}${token}${shop}` : `${PARTNER_ID}${p}${ts}`;
  const ok = createHmac("sha256", KEY).update(base).digest("hex") === u.searchParams.get("sign");
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push(`${req.method} ${p} sign=${ok ? "ok" : "BAD"}`);
    const send = (o: unknown) => res.end(JSON.stringify(o));
    if (!ok) return send({ error: "error_sign", message: "Wrong sign." });
    if (p === "/api/v2/auth/token/get") {
      const b = JSON.parse(body);
      assert.equal(b.partner_id, PARTNER_ID);
      return send({ error: "", access_token: "AT1", refresh_token: "RT1", expire_in: 14400 });
    }
    if (p === "/api/v2/order/get_order_list") {
      const cursor = u.searchParams.get("cursor");
      assert.ok(Number(u.searchParams.get("time_to")) - Number(u.searchParams.get("time_from")) < 15 * 86400);
      return send({ error: "", response: cursor ? { more: false, next_cursor: "", order_list: [{ order_sn: "B" }] } : { more: true, next_cursor: "c2", order_list: [{ order_sn: "A" }] } });
    }
    send({ error: "error_not_found", message: p });
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(4020, r));
  const { getAccessToken, shopGet, requireShopeeConfig, ShopeeError } = await import("../lib/integrations/shopee/api");
  const { windows } = await import("../lib/integrations/shopee/sign");
  const { encrypt, decrypt } = await import("../lib/integrations/crypto");
  const { toBytea } = await import("../lib/integrations/store");
  const cfg = requireShopeeConfig();

  const tok = await getAccessToken(cfg, "CODE", 777);
  assert.equal(tok.access_token, "AT1");

  const sns: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (const [a, b] of windows(now - 30 * 86400, now)) {
    let cursor = "";
    for (;;) {
      const r = await shopGet<{ response: { more: boolean; next_cursor: string; order_list: { order_sn: string }[] } }>(
        cfg, "/api/v2/order/get_order_list",
        { time_range_field: "update_time", time_from: a, time_to: b, page_size: 100, cursor: cursor || undefined },
        tok.access_token, 777,
      );
      sns.push(...r.response.order_list.map((o) => o.order_sn));
      if (!r.response.more) break;
      cursor = r.response.next_cursor;
    }
  }
  assert.deepEqual(sns, ["A", "B", "A", "B"]); // 30 days = 2 windows of 15 days × 2 pages each

  await assert.rejects(() => shopGet(cfg, "/api/v2/does/not_exist", {}, "AT1", 777), (e) => e instanceof ShopeeError && e.code === "error_not_found");

  const secret = JSON.stringify({ access_token: "AT1", refresh_token: "RT1" });
  const enc = encrypt(secret);
  assert.equal(decrypt(enc), secret);
  const hex = toBytea(enc);
  assert.equal(Buffer.from(hex.slice(2), "hex").toString("utf8"), enc);

  console.log(calls.join("\n"));
  console.log("ALL SHOPEE CLIENT CHECKS PASSED");
  server.close();
}
main().catch((e) => {
  console.error("FAILED", e);
  server.close();
  process.exit(1);
});
