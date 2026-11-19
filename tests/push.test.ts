import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { lazadaPushSignature, sameSignature, shopeePushSignature } from "../lib/integrations/push-sign.ts";

test("lazada push signature = hex(hmac_sha256(secret, appKey + body))", () => {
  const body = '{"seller_id":"123","message_type":0,"data":{"trade_order_id":"9"},"timestamp":1700000000}';
  const want = createHmac("sha256", "s3cret").update("144583" + body).digest("hex");
  assert.equal(lazadaPushSignature("144583", "s3cret", body), want);
  assert.ok(sameSignature(want, want.toUpperCase()));
  assert.ok(!sameSignature(want, lazadaPushSignature("144583", "s3cret", body + " ")));
  assert.ok(!sameSignature(want, null));
  assert.ok(!sameSignature(want, "abc"));
});

test("shopee push signature = hex(hmac_sha256(key, url|body))", () => {
  const url = "https://officeverse-ten.vercel.app/api/integrations/shopee/push";
  const body = '{"shop_id":1,"code":3,"data":{"ordersn":"X","status":"READY_TO_SHIP"}}';
  const want = createHmac("sha256", "k").update(url + "|" + body).digest("hex");
  assert.equal(shopeePushSignature("k", url, body), want);
  assert.ok(!sameSignature(want, shopeePushSignature("k", url + "/", body)));
});
