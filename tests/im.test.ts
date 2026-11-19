import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseMessage, normaliseSession } from "../lib/integrations/lazada/im.ts";

test("session list item → ChatSession", () => {
  const s = normaliseSession({ session_id: "S1", buyer_id: 77, title: "Ahmad", summary: "Bila sampai?", unread_count: "2", last_message_time: 1763540000000, head_url: "https://x/a.png", tags: ["official"] });
  assert.equal(s.id, "S1");
  assert.equal(s.buyerId, "77");
  assert.equal(s.unread, 2);
  assert.equal(s.lastAt, new Date(1763540000000).toISOString());
});

test("messages: text JSON content, buyer detection, order card", () => {
  const buyer = normaliseMessage({ message_id: "m1", from_account_id: "77", template_id: 1, content: '{"txt":"Hi, where is my parcel?"}', send_time: 1763540000000 }, "77");
  assert.equal(buyer.fromBuyer, true);
  assert.equal(buyer.text, "Hi, where is my parcel?");
  const shop = normaliseMessage({ message_id: "m2", from_account_id: "900", template_id: 1, content: "Hello!" }, "77");
  assert.equal(shop.fromBuyer, false);
  assert.equal(shop.text, "Hello!");
  const order = normaliseMessage({ message_id: "m3", from_account_id: "77", template_id: 10007, content: '{"orderId":"123456"}' }, "77");
  assert.equal(order.kind, "order");
  assert.equal(order.orderId, "123456");
  assert.equal(order.text, "[Order 123456]");
  const pic = normaliseMessage({ message_id: "m4", from_account_type: 1, template_id: 3, content: { imgUrl: "https://x/p.jpg" } }, null);
  assert.equal(pic.fromBuyer, true);
  assert.equal(pic.imageUrl, "https://x/p.jpg");
});
