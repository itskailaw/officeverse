import { after, NextResponse } from "next/server";
import { shopeeConfig } from "@/lib/integrations/shopee/api";
import { sameSignature, shopeePushSignature } from "@/lib/integrations/push-sign";
import { syncFromPush } from "@/lib/integrations/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** URLs Shopee may have signed: SHOPEE_PUSH_URL if set, else this request's public URL. */
function candidateUrls(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? u.host;
  const base = `https://${host}${u.pathname}`;
  const list = [process.env.SHOPEE_PUSH_URL?.trim(), base, base + u.search, req.url];
  return [...new Set(list.filter((x): x is string => !!x))];
}

/**
 * Shopee Live Push receiver (set as the Live Call Back URL in Shopee Open Platform → Push).
 * Any push for a connected shop (order status, tracking number, …) triggers a coalesced incremental sync.
 * The push is only a "something changed" signal — data always comes from the official API.
 */
export async function POST(req: Request) {
  const cfg = shopeeConfig();
  if (!cfg) return NextResponse.json({ error: "Shopee isn't configured" }, { status: 503 });
  const raw = await req.text();
  const given = req.headers.get("authorization");
  if (!candidateUrls(req).some((url) => sameSignature(shopeePushSignature(cfg.partnerKey, url, raw), given))) {
    console.warn("[shopee push] rejected: bad signature");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let msg: { shop_id?: number | string; code?: number } = {};
  try {
    msg = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const shop = msg.shop_id != null ? String(msg.shop_id) : "";
  if (shop) {
    const receivedAt = Date.now();
    after(async () => {
      try {
        const r = await syncFromPush("shopee", shop, receivedAt);
        console.log("[shopee push] shop", shop, "code", msg.code, r);
      } catch (e) {
        console.error("[shopee push] sync failed", e instanceof Error ? e.message : e);
      }
    });
  }
  return new NextResponse(null, { status: 204 });
}

export function GET() {
  return NextResponse.json({ ok: true, endpoint: "Shopee push receiver", configured: !!shopeeConfig() });
}
