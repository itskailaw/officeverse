import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { authLink, publicSign, shopSign, windows } from "../lib/integrations/shopee/sign.ts";

test("public sign = HMAC-SHA256(partner_key, partner_id + path + timestamp), lowercase hex", () => {
  const expected = createHmac("sha256", "secret").update("1000016/api/v2/auth/token/get1700000000").digest("hex");
  assert.equal(publicSign("secret", 1000016, "/api/v2/auth/token/get", 1700000000), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
});

test("shop sign appends access_token and shop_id", () => {
  const expected = createHmac("sha256", "k").update("7/api/v2/order/get_order_list1700000000TOKEN42").digest("hex");
  assert.equal(shopSign("k", 7, "/api/v2/order/get_order_list", 1700000000, "TOKEN", 42), expected);
});

test("auth link uses the documented new format", () => {
  const u = new URL(authLink("live", 10090, "https://example.vercel.app/api/integrations/shopee/callback", "abc"));
  assert.equal(u.origin + u.pathname, "https://open.shopee.com/auth");
  assert.equal(u.searchParams.get("auth_type"), "seller");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("state"), "abc");
});

test("order windows never exceed 15 days and cover the range", () => {
  const from = 1_700_000_000;
  const to = from + 40 * 86400;
  const w = windows(from, to);
  assert.equal(w[0][0], from);
  assert.equal(w[w.length - 1][1], to);
  for (const [a, b] of w) assert.ok(b - a < 15 * 86400);
  for (let i = 1; i < w.length; i++) assert.equal(w[i][0], w[i - 1][1] + 1);
});

test("fees: Shopee escrow and Lazada ledger lines", async () => {
  const { shopeeFees, lazadaFeesByOrder } = await import("../lib/integrations/fees.ts");
  const s = shopeeFees({ escrow_amount: "101.50", commission_fee: 9.5, service_fee: "6.00", seller_transaction_fee: 3 }, 129);
  assert.equal(s.net, 101.5);
  assert.equal(s.fees.Commission, -9.5);
  assert.equal(s.fees["Service fee"], -6);
  assert.equal(s.fees["Transaction fee"], -3);
  assert.equal(s.fees["Other adjustments"], -9); // 101.5 - 129 - (-18.5)
  const l = lazadaFeesByOrder([
    { order_no: "1", amount: "129.00", fee_name: "Item Price Credit" },
    { order_no: "1", amount: "-7.74", fee_name: "Commission" },
    { order_no: "1", amount: "-2.58", fee_name: "Payment Fee" },
    { order_no: "2", amount: "1,200.00", fee_name: "Item Price Credit" },
  ]);
  assert.equal(l.get("1")!.net, 118.68);
  assert.deepEqual(l.get("1")!.fees, { Commission: -7.74, "Payment Fee": -2.58 });
  assert.equal(l.get("2")!.net, 1200);
});
