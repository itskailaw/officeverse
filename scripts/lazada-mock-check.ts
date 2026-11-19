// Integration check for the Lazada client against a local mock that re-implements
// Lazada's official signing (lazop SDK) independently and rejects bad signatures.
// Run: npx tsx --conditions=react-server scripts/lazada-mock-check.ts
import http from "node:http";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const KEY = "123456";
const SECRET = "lazada-test-secret";
process.env.LAZADA_APP_KEY = KEY;
process.env.LAZADA_APP_SECRET = SECRET;
process.env.LAZADA_API_BASE = "http://127.0.0.1:4030/rest";
process.env.LAZADA_AUTH_BASE = "http://127.0.0.1:4030/rest";

function officialSign(path: string, params: Record<string, string>) {
  // straight port of lazop-sdk-python base.sign()
  const keys = Object.keys(params).sort();
  const s = path + keys.map((k) => `${k}${params[k]}`).join("");
  return createHmac("sha256", SECRET).update(s, "utf8").digest("hex").toUpperCase();
}

const calls: string[] = [];
const orders = Array.from({ length: 130 }, (_, i) => ({
  order_id: 1000 + i,
  created_at: "2026-11-19 10:12:33 +0800",
  updated_at: "2026-11-19 11:00:00 +0800",
  price: "129.00",
  statuses: [i % 3 === 0 ? "pending" : i % 3 === 1 ? "packed" : "delivered"],
}));

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const u = new URL(req.url!, "http://x");
    const path = u.pathname.replace(/^\/rest/, "");
    const params: Record<string, string> = Object.fromEntries(req.method === "GET" ? u.searchParams : new URLSearchParams(body));
    const sign = params.sign;
    delete params.sign;
    const ok = officialSign(path, params) === sign && params.app_key === KEY && params.sign_method === "sha256" && /^\d{13}$/.test(params.timestamp);
    calls.push(`${req.method} ${path} sign=${ok ? "ok" : "BAD"}`);
    const send = (o: unknown) => res.end(JSON.stringify(o));
    if (!ok) return send({ code: "IncompleteSignature", type: "ISV", message: "The request signature does not conform to platform standards" });
    if (path === "/auth/token/create") return send({ code: "0", access_token: "LAT", refresh_token: "LRT", expires_in: 604800, refresh_expires_in: 2592000, country_user_info: [{ country: "my", seller_id: "MY12345" }] });
    if (path === "/orders/get") {
      assert.ok(params.update_after.endsWith("+08:00"));
      const off = Number(params.offset);
      const lim = Number(params.limit);
      return send({ code: "0", data: { count: Math.min(lim, orders.length - off), orders: orders.slice(off, off + lim) } });
    }
    if (path === "/orders/items/get") {
      const ids: number[] = JSON.parse(params.order_ids);
      assert.ok(ids.length <= 50);
      return send({ code: "0", data: ids.map((id) => ({ order_id: id, order_items: [{ order_id: id, name: "MDBC Water Filter", sku: "F1", paid_price: "129.00", promised_shipping_time: "2026-11-20 23:59:59 +0800" }] })) });
    }
    const ov = (spend: string, revenue: string) => ({ spend, revenue, roi: (Number(revenue) / Number(spend)).toFixed(2), clicks: "120", impressions: "5000", unitsSold: "9", storeOrder: "8", ctr: "0.024", cpc: "0.30" });
    if (path === "/sponsor/solutions/report/getReportOverview") {
      assert.equal(params.bizCode, "sponsoredSearch");
      assert.match(params.startDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(params.lastStartDate && params.lastEndDate && params.useRtTable === "true");
      const month = params.startDate.endsWith("-01") && params.startDate !== params.endDate;
      return send({ code: "0", success: "true", result: { reportOverview: month ? ov("300.00", "1500.00") : ov("20.00", "90.00"), lastReportOverview: ov("25.00", "100.00") }, request_id: "r" });
    }
    if (path === "/sponsor/solution/smax/report/getReportOverview") {
      return send({ code: "0", success: "true", result: { reportOverview: ov("10.00", "60.00"), lastReportOverview: ov("5.00", "20.00") } });
    }
    if (path === "/sponsor/solutions/wallet/getAutoTopUpOptionOneConfig") {
      return send({ code: "0", success: "false", errorMsg: "seller not signed", result: null });
    }
    if (path === "/im/session/list") {
      assert.ok(/^\d{13}$/.test(params.start_time) && params.page_size);
      return send({ code: "0", success: true, err_code: "0", data: { session_list: [{ session_id: "S1", buyer_id: "77", title: "Ahmad", summary: "Bila sampai?", unread_count: 1, last_message_time: Date.now() }], has_more: false } });
    }
    if (path === "/im/session/get") return send({ code: "0", success: true, err_code: "0", data: { session_id: params.session_id, buyer_id: "77", title: "Ahmad" } });
    if (path === "/im/message/list") {
      return send({ code: "0", success: true, err_code: "0", data: { message_list: [
        { message_id: "m2", from_account_id: "900", template_id: 1, content: '{"txt":"Hi boss"}', send_time: Date.now() - 1000 },
        { message_id: "m1", from_account_id: "77", template_id: 1, content: '{"txt":"Bila sampai?"}', send_time: Date.now() - 5000 },
      ], has_more: false } });
    }
    if (path === "/im/message/send") {
      assert.equal(req.method, "POST");
      assert.equal(params.template_id, "1");
      assert.equal(params.txt, "Parcel dah dihantar hari ini 😊");
      return send({ code: "0", success: true, err_code: "0", data: { message_id: "m9", template_id: 1 } });
    }
    if (path === "/im/session/read") {
      assert.equal(req.method, "POST");
      return send({ code: "0", success: false, err_code: "IM_ERR", err_message: "denied" });
    }
    send({ code: "InvalidApi", message: path });
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(4030, r));
  const { createToken, lazadaGet, requireLazadaConfig, LazadaError } = await import("../lib/integrations/lazada/api");
  const { lazadaTime, parseLazadaDate } = await import("../lib/integrations/lazada/sign");
  const cfg = requireLazadaConfig();

  const t = await createToken(cfg, "CODE");
  assert.equal(t.access_token, "LAT");
  assert.equal(t.country_user_info?.[0].seller_id, "MY12345");

  const got: { order_id: number }[] = [];
  for (let offset = 0; ; offset += 100) {
    const d = await lazadaGet<{ orders: { order_id: number }[] }>(cfg, "/orders/get", { update_after: lazadaTime(new Date()), sort_by: "updated_at", sort_direction: "ASC", offset, limit: 100 }, "LAT");
    got.push(...d.orders);
    if (d.orders.length < 100) break;
  }
  assert.equal(got.length, 130);

  const items = await lazadaGet<{ order_id: number; order_items: { promised_shipping_time: string }[] }[]>(cfg, "/orders/items/get", { order_ids: JSON.stringify(got.slice(0, 50).map((o) => o.order_id)) }, "LAT");
  assert.equal(items.length, 50);
  assert.equal(parseLazadaDate(items[0].order_items[0].promised_shipping_time), "2026-11-20T15:59:59.000Z");

  const { fetchLazadaAds } = await import("../lib/integrations/lazada/ads");
  const ads = await fetchLazadaAds(cfg, "LAT");
  // today = discovery 20 + smax 10 (spend); 90 + 60 (revenue)
  assert.equal(ads.today?.spend, 30);
  assert.equal(ads.today?.revenue, 150);
  assert.equal(ads.today?.roi, 5);
  assert.equal(ads.yesterday?.spend, 30);
  assert.equal(ads.solutions.discovery?.spend, 20);
  assert.equal(ads.autoTopUp, null);
  assert.equal(ads.errors.length, 1);
  assert.match(ads.errors[0], /Auto top-up/);
  console.log("ads:", JSON.stringify({ today: ads.today, mtd: ads.monthToDate, errors: ads.errors }));

  const { lazadaIm } = await import("../lib/integrations/lazada/api");
  const { normaliseMessage, normaliseSession } = await import("../lib/integrations/lazada/im");
  const sl = await lazadaIm<{ session_list: Record<string, unknown>[] }>(cfg, "/im/session/list", { start_time: Date.now(), page_size: 30 }, "LAT");
  const sess = normaliseSession(sl.session_list[0]);
  assert.equal(sess.title, "Ahmad");
  const ml = await lazadaIm<{ message_list: Record<string, unknown>[] }>(cfg, "/im/message/list", { session_id: "S1", start_time: Date.now(), page_size: 40 }, "LAT");
  const msgs = ml.message_list.map((m) => normaliseMessage(m, sess.buyerId)).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  assert.deepEqual(msgs.map((m) => [m.fromBuyer, m.text]), [[true, "Bila sampai?"], [false, "Hi boss"]]);
  const sent = await lazadaIm<{ message_id: string }>(cfg, "/im/message/send", { session_id: "S1", template_id: "1", txt: "Parcel dah dihantar hari ini 😊" }, "LAT", "POST");
  assert.equal(sent.message_id, "m9");
  await assert.rejects(() => lazadaIm(cfg, "/im/session/read", { session_id: "S1", last_read_message_id: "m9" }, "LAT", "POST"), (e) => e instanceof LazadaError && e.code === "IM_ERR");

  await assert.rejects(() => lazadaGet(cfg, "/nope", {}, "LAT"), (e) => e instanceof LazadaError && e.code === "InvalidApi");

  console.log(calls.join("\n"));
  console.log("ALL LAZADA CLIENT CHECKS PASSED");
  server.close();
}
main().catch((e) => {
  console.error("FAILED", e);
  server.close();
  process.exit(1);
});
