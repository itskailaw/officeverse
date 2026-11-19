import { test } from "node:test";
import assert from "node:assert/strict";
import { mdToTelegram, pickRecipient } from "../lib/integrations/telegram-format.ts";

const staff = [
  { id: "emp-ea", name: "Sophia Chen" },
  { id: "emp-ads", name: "Daniel Tan" },
  { id: "emp-inv", name: "Priya Nair" },
];

test("routes messages to the named employee, else Sophia", () => {
  assert.deepEqual(pickRecipient("ask Daniel how are our ads?", staff, "emp-ea"), { id: "emp-ads", message: "how are our ads?" });
  assert.deepEqual(pickRecipient("Priya, what's low on stock", staff, "emp-ea"), { id: "emp-inv", message: "what's low on stock" });
  assert.deepEqual(pickRecipient("@daniel ROAS today", staff, "emp-ea"), { id: "emp-ads", message: "ROAS today" });
  assert.deepEqual(pickRecipient("/ask priya stock?", staff, "emp-ea"), { id: "emp-inv", message: "stock?" });
  assert.deepEqual(pickRecipient("How much did we sell yesterday?", staff, "emp-ea"), { id: "emp-ea", message: "How much did we sell yesterday?" });
  assert.deepEqual(pickRecipient("tanya Daniel pasal iklan", staff, "emp-ea"), { id: "emp-ads", message: "pasal iklan" });
});

test("markdown → Telegram HTML, escaping first", () => {
  const out = mdToTelegram("## Summary\n**Sales** up 5% <b>\n- one\n- `two`");
  assert.equal(out, "<b>Summary</b>\n<b>Sales</b> up 5% &lt;b&gt;\n• one\n• <code>two</code>");
});
