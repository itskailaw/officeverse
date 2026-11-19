// Checks the Telegram link code and briefing against a local mock of the Bot API.
// Run: npx tsx --conditions=react-server scripts/telegram-mock-check.ts
import http from "node:http";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = "123456789:AAEexampleexampleexampleexample_x";
process.env.TELEGRAM_API_BASE = "http://127.0.0.1:4040";
const sent: { method: string; body: Record<string, unknown> }[] = [];
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? "");
    assert.equal(m?.[1], process.env.TELEGRAM_BOT_TOKEN);
    sent.push({ method: m![2], body: JSON.parse(b || "{}") });
    if (m![2] === "getMe") return res.end(JSON.stringify({ ok: true, result: { username: "wgs_office_bot" } }));
    if (m![2] === "sendMessage") return res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    res.end(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }));
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(4040, r));
  const t = await import("../lib/integrations/telegram");
  const { briefingText } = await import("../lib/integrations/briefing");
  const ws = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const now = Date.now();
  const code = t.linkCode(ws, now);
  assert.equal(code.length, 56);
  assert.match(code, /^[0-9a-z]+$/);
  assert.equal(t.verifyLinkCode(code, now + 60_000), ws);
  assert.equal(t.verifyLinkCode(code, now + 31 * 60_000), null, "expires after 30 min");
  assert.equal(t.verifyLinkCode(code.slice(0, -1) + (code.at(-1) === "0" ? "1" : "0"), now), null, "tampered");
  assert.equal(t.verifyLinkCode("0".repeat(32) + code.slice(32), now), null, "other workspace");
  assert.equal(t.webhookSecret()?.length, 48);

  assert.equal((await t.tg<{ username: string }>("getMe", {})).username, "wgs_office_bot");
  await assert.rejects(() => t.tg("nope", {}), /chat not found/);

  const fig = (r: number) => ({ today: { revenue: r, orders: 2 }, yesterday: { revenue: r * 2, orders: 4 }, monthToDate: { revenue: r * 20, orders: 40 }, toPack: { total: 3, readyToShip: 2, processed: 1, urgent: 1, urgentToProcess: 1, urgentToShip: 0 }, cancelledToday: 0, bestSellers30d: [] });
  const text = briefingText(
    {
      live: true, currency: "MYR", definition: "",
      platforms: { shopee: { connected: true, shopName: "WGS", lastSync: null, status: "connected", lastError: null, expiresAt: null }, lazada: { connected: true, shopName: "WGS", lastSync: null, status: "connected", lastError: null, expiresAt: null } },
      today: { revenue: 410, orders: 4 }, yesterday: { revenue: 852, orders: 8 }, monthToDate: { revenue: 12148, orders: 80 },
      days: [], toPack: { total: 6, readyToShip: 4, processed: 2, urgent: 2, urgentToProcess: 2, urgentToShip: 0 }, cancelledToday: 1,
      byPlatform: { shopee: fig(300), lazada: fig(126) },
      bestSellers30d: [{ name: "MDBC <Filter> & Tap", units: 40, revenue: 5160 }],
      profit: null,
      returns: { open: 2, last30: 3, refund30: 129, byPlatform: { lazada: { open: 2, last30: 3 } }, recent: [], available: true },
      ads: { shopee: { balance: 117.47, at: "" }, lazada: { at: "", today: null, yesterday: { spend: 25, revenue: 80, roi: 3.2, clicks: 0, impressions: 0, unitsSold: 0, orders: 0 }, monthToDate: null, solutions: { discovery: null, smax: null }, autoTopUp: null, errors: [] } },
    },
    { appUrl: "https://officeverse-ten.vercel.app/office", from: "Sophia", notes: ["Lazada <up> 12%", "Ship 2 parcels before noon."] },
  );
  const { briefingFacts } = await import("../lib/integrations/briefing");
  const days = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, revenue: i < 22 ? 100 : 200, orders: 1, shopee: i < 22 ? 60 : 120, lazada: 40 }));
  const facts = briefingFacts({ days, platforms: { shopee: { connected: true }, lazada: { connected: true } }, toPack: {}, ads: { shopee: null, lazada: null }, bestSellers30d: [], monthToDate: {}, cancelledToday: 0 } as never);
  // complete days = index 0..28; last7 = 22..28 (all 200), previous7 = 15..21 (all 100)
  assert.equal(facts.last7Days.total, 1400);
  assert.equal(facts.last7Days.previous7, 700);
  assert.equal(facts.last7Days.changePct, 100);
  assert.equal(facts.yesterday.revenue, 200);
  const withNotes = briefingText(null, {});
  assert.match(withNotes, /No marketplace is connected/);
  assert.match(text, /Sophia here/);
  assert.match(text, /Sophia's notes<\/b>\n• Lazada &lt;up&gt; 12%/);
  assert.match(text, /Yesterday: RM 852/);
  assert.match(text, /Shopee: RM 600/);
  assert.match(text, /2 parcels must ship within 24 hours/);
  assert.match(text, /MDBC &lt;Filter&gt; &amp; Tap/, "HTML-escaped product names");
  assert.match(text, /Lazada spent RM 25\.00 yesterday \(ROI 3\.2x\)/);
  await t.sendTelegram("42", text);
  const last = sent.at(-1)!;
  assert.equal(last.method, "sendMessage");
  assert.equal(last.body.parse_mode, "HTML");
  console.log(text);
  console.log("ALL TELEGRAM CHECKS PASSED");
  server.close();
}
main().catch((e) => {
  console.error("FAILED", e);
  server.close();
  process.exit(1);
});
