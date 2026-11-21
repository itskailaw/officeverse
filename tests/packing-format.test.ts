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
  assert.ok(html.includes("<b>3×</b> Filter &lt;Pro&gt; — Std"), "pick list totals per product");
  assert.ok(!html.includes("<Pro>"), "escaped");
  assert.ok(html.includes("separate attachment"));
  assert.match(packingSubject(lines, noon30), /20 Nov — 2 parcels \(6 items\)/);
});
