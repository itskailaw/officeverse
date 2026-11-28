import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { STATUS } from "@/lib/integrations/summary";
import { lazadaListings, listingError, shopeeListings, updateLazadaPrices, updateShopeePrices, type Listing } from "@/lib/integrations/listings";
import { skuPrices, unitCost, type CostRecipes } from "@/lib/data/costs";
import { itemKey } from "@/lib/data/stock";
import type { Inventory } from "@/lib/data/inventory";
import { monthAds, platformAdSpend, type AdEntry } from "@/lib/data/ads";
import { feeRate } from "@/lib/data/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Plat = "shopee" | "lazada";
const DAY = 86400000;
const klDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);

/**
 * Prices screen data: every live listing variation with its price, your product cost, units sold (30 days),
 * the real fee rate per platform (settled orders, 45 days) and this month's ad spend. Owner only.
 */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const ws = m.workspaceId;
    const sb = getAdminSupabase();
    const warnings: string[] = [];

    const [shopee, lazada, lay, orders, lz] = await Promise.all([
      shopeeListings(ws).catch((e) => (warnings.push(e instanceof Error ? e.message : listingError(e)), [] as Listing[])),
      lazadaListings(ws).catch((e) => (warnings.push(e instanceof Error ? e.message : listingError(e)), [] as Listing[])),
      sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle(),
      (async () => {
        const rows: Record<string, unknown>[] = [];
        const since = new Date(Date.now() - 45 * DAY).toISOString();
        for (let from = 0; from < 20000; from += 1000) {
          const { data, error } = await sb
            .from("marketplace_orders")
            .select("platform, status, ordered_at, gross_amount, net_amount, items")
            .eq("workspace_id", ws)
            .in("platform", ["shopee", "lazada"])
            .gte("ordered_at", since)
            .range(from, from + 999);
          if (error) throw new Error(error.message);
          rows.push(...(data ?? []));
          if ((data ?? []).length < 1000) break;
        }
        return rows;
      })(),
      sb.from("integrations").select("last_sync_summary").eq("workspace_id", ws).eq("provider", "lazada").limit(1),
    ]);

    const st = (lay.data?.settings ?? null) as { productCosts?: Record<string, number>; costRecipes?: CostRecipes; inventory?: Inventory; adSpend?: AdEntry[] } | null;
    const ctx = { prices: skuPrices(st?.inventory), skus: (st?.inventory?.skus ?? []).map((x) => x.sku), recipes: st?.costRecipes ?? null, byName: st?.productCosts ?? null };

    // real fee rate per platform, units sold per variation (30 days) and this month
    const month = klDay().slice(0, 7);
    const sales = orders.filter((o) => !STATUS[o.platform as Plat].notSales.has(String(o.status).toUpperCase()));
    const fee: Record<Plat, { rate: number | null; orders: number }> = {
      shopee: feeRate(sales.filter((o) => o.platform === "shopee").map((o) => ({ gross: Number(o.gross_amount) || 0, net: o.net_amount == null ? null : Number(o.net_amount) }))),
      lazada: feeRate(sales.filter((o) => o.platform === "lazada").map((o) => ({ gross: Number(o.gross_amount) || 0, net: o.net_amount == null ? null : Number(o.net_amount) }))),
    };
    const units30 = new Map<string, number>();
    let unitsMonth = 0;
    const cutoff = Date.now() - 30 * DAY;
    for (const o of sales) {
      const t = Date.parse(String(o.ordered_at));
      for (const i of (o.items as { name: string; model?: string | null; sku?: string | null; qty: number }[] | null) ?? []) {
        const q = Number(i.qty) || 1;
        if (t >= cutoff) {
          const k = `${o.platform}|${itemKey(i)}`;
          units30.set(k, (units30.get(k) ?? 0) + q);
        }
        if (klDay(new Date(t)).startsWith(month)) unitsMonth += q;
      }
    }

    // this month's ad spend (keyed in + Lazada synced)
    const ads = monthAds(st?.adSpend, month);
    const syncedLz = (lz.data?.[0]?.last_sync_summary as { ads?: { monthToDate?: { spend?: number } } } | null)?.ads?.monthToDate?.spend ?? null;
    const ap = platformAdSpend(ads, syncedLz);
    const adsMonth = ap.shopee + ap.lazada + ads.outside;

    const rows = [...shopee, ...lazada].map((l) => {
      const key = itemKey({ name: l.name, model: l.variation, sku: l.sku });
      const c = unitCost({ name: l.name, model: l.variation, sku: l.sku }, ctx, key);
      return { ...l, key, cost: c.cost, costMissing: c.missing, units30: units30.get(`${l.platform}|${key}`) ?? 0 };
    });
    rows.sort((a, b) => b.units30 - a.units30 || a.name.localeCompare(b.name));
    return NextResponse.json({ rows, fee, adsMonth, unitsMonth, warnings }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

interface ChangeIn {
  platform: Plat;
  itemId: string;
  variantId: string;
  sku?: string | null;
  price: number;
  old?: number;
}

/** Update normal prices on Shopee / Lazada. Body: { changes: [{ platform, itemId, variantId, sku, price, old }] }. Owner only. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => null)) as { changes?: ChangeIn[] } | null;
    const changes = (body?.changes ?? []).filter((c) => (c.platform === "shopee" || c.platform === "lazada") && c.itemId && c.variantId != null && Number(c.price) >= 1);
    if (!changes.length) throw new HttpError(400, "No price changes to save.");
    if (changes.length > 200) throw new HttpError(400, "Up to 200 prices at a time.");
    const results: { platform: Plat; itemId: string; variantId: string; ok: boolean; message?: string }[] = [];

    // Shopee: one call per listing
    const byItem = new Map<string, ChangeIn[]>();
    for (const c of changes.filter((x) => x.platform === "shopee")) byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), c]);
    for (const [itemId, list] of byItem) {
      try {
        const failed = await updateShopeePrices(m.workspaceId, itemId, list.map((c) => ({ variantId: String(c.variantId), price: Math.round(Number(c.price) * 100) / 100 })));
        for (const c of list) {
          const f = failed.find((x) => x.variantId === String(c.variantId));
          results.push({ platform: "shopee", itemId, variantId: String(c.variantId), ok: !f, message: f?.reason });
        }
      } catch (e) {
        for (const c of list) results.push({ platform: "shopee", itemId, variantId: String(c.variantId), ok: false, message: listingError(e) });
      }
    }
    // Lazada: batches of 20 SKUs
    const lz = changes.filter((x) => x.platform === "lazada");
    for (let i = 0; i < lz.length; i += 20) {
      const part = lz.slice(i, i + 20);
      try {
        await updateLazadaPrices(m.workspaceId, part.map((c) => ({ itemId: String(c.itemId), variantId: String(c.variantId), sku: c.sku ?? null, price: Math.round(Number(c.price) * 100) / 100 })));
        for (const c of part) results.push({ platform: "lazada", itemId: String(c.itemId), variantId: String(c.variantId), ok: true });
      } catch (e) {
        for (const c of part) results.push({ platform: "lazada", itemId: String(c.itemId), variantId: String(c.variantId), ok: false, message: listingError(e) });
      }
    }
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
