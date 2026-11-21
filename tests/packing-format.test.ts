import { test } from "node:test";
import assert from "node:assert/strict";
import { packingDue, packingHtml, packingSubject } from "../lib/integrations/packing-format.ts";

// 2026-11-20 12:30 in Kuala Lumpur (UTC+8)
const noon30 = new Date("2026-11-20T04:30:00Z");
const s = { enabled: true, time: "12:00", to: "owner@example.com" };

test("packing email is due after the chosen time, once a day", () => {
  assert.equal(packingDue(new Date("2026-11-20T03:30:00Z"), s, []), false); // 11:30
  assert.equal(packingDue(noon30, s, []), true);
  assert.equal(packingDue(noon30, s, [{ status: "sent", sent_at: "2026-11-20T04:05:00Z" }]), false);
  assert.equal(packingDue(noon30, s, [{ status: "empty", sent_at: "2026-11-20T04:05:00Z" }]), false);
  // yesterday's email doesn't count (12:05 KL on the 19th)
  assert.equal(packingDue(noon30, s, [{ status: "sent", sent_at: "2026-11-19T04:05:00Z" }]), true);
  // in progress elsewhere → wait; stuck for > 15 min → retry
  assert.equal(packingDue(noon30, s, [{ status: "sending", sent_at: "2026-11-20T04:25:00Z" }]), false);
  assert.equal(packingDue(noon30, s, [{ status: "sending", sent_at: "2026-11-20T04:00:00Z" }]), true);
  // three failures → stop for today
  const f = { status: "failed", sent_at: "2026-11-20T04:10:00Z" };
  assert.equal(packingDue(noon30, s, [f, f]), true);
  assert.equal(packingDue(noon30, s, [f, f, f]), false);
  assert.equal(packingDue(noon30, { ...s, enabled: false }, []), false);
  assert.equal(packingDue(noon30, { ...s, to: "" }, []), false);
  // instant mode: no daily email (Farid emails right after confirming instead)
  assert.equal(packingDue(noon30, { ...s, mode: "instant" }, []), false);
});

test("packing email lists parcels in label order with a pick list", () => {
  const lines = [
    { platform: "shopee" as const, id: "A1", tracking: "SPX1", items: [{ name: "Filter <Pro>", model: "Std", qty: 2 }] },
    { platform: "lazada" as const, id: "B2", tracking: null, items: [{ name: "Filter <Pro>", model: "Std", qty: 1 }, { name: "Cartridge", model: null, qty: 3 }] },
  ];
  const html = packingHtml(lines, { separate: "lazada" });
  assert.ok(html.indexOf("#A1") < html.indexOf("#B2"));
  assert.ok(/Filter &lt;Pro&gt;<\/span><div[^>]*><b>3×<\/b> Std<\/div>/.test(html), "pick list: product, then merged variation total");
  assert.ok(!html.includes("<Pro>"), "escaped");
  assert.ok(html.includes("separate attachment"));
  assert.match(packingSubject(lines, noon30), /20 Nov — 2 parcels \(6 items\)/);
});

test("parcels not shipped yet come first, marked, and are counted in the subject", () => {
  const lines = [
    { platform: "shopee" as const, id: "OLD1", tracking: "SPX9", items: [{ name: "Filter", model: null, qty: 1 }], overdue: { since: "2026-11-19T04:00:00Z", shipBy: "2026-11-21T10:00:00Z" } },
    { platform: "lazada" as const, id: "NEW1", tracking: null, items: [{ name: "Cartridge", model: null, qty: 2 }] },
  ];
  const html = packingHtml(lines);
  assert.ok(html.indexOf("Not shipped yet — pack these first") < html.indexOf("#OLD1"));
  assert.ok(html.indexOf("#OLD1") < html.indexOf("New orders") && html.indexOf("New orders") < html.indexOf("#NEW1"));
  assert.match(html, /Not shipped · since 19 Nov · ship by 21 Nov/);
  assert.match(packingSubject(lines, noon30), /1 new \+ 1 not shipped yet \(3 items\)/);
});

test("pick list: short product names, variation prefixes removed, duplicates merged", async () => {
  const { pickList, shortProduct, variationOf } = await import("../lib/data/product-names.ts");
  const shower = "MDBC Hand Showerhead Filter Shower Water Filter High Pressure Power 3 Mode (Water Purifier) 花洒过滤器";
  assert.equal(variationOf("Variation3:Refill x 10 pcs"), "Refill x 10 pcs");
  assert.equal(variationOf("Color Family:Red, Size:XL"), "Red · XL");
  assert.equal(shortProduct("MDBC Washing Machine Water Filter | Anti Dirt Rust Filter 洗衣机过滤器"), "Washing Machine Water Filter");
  assert.ok(shortProduct(shower).length <= 31);
  const g = pickList([
    { name: shower, model: "SH:Refill x 10 pcs", qty: 1 },
    { name: shower, model: "Variation3:Refill x 10 pcs", qty: 1 },
    { name: shower, model: "SH:1x Shower Head", qty: 1 },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].lines, [{ variation: "Refill x 10 pcs", qty: 2 }, { variation: "1x Shower Head", qty: 1 }]);
});
