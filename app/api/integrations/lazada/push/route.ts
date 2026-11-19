import { after, NextResponse } from "next/server";
import { lazadaConfig } from "@/lib/integrations/lazada/api";
import { lazadaPushSignature, sameSignature } from "@/lib/integrations/push-sign";
import { syncFromPush } from "@/lib/integrations/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Lazada Push Mechanism receiver (set as the Push URL in the Lazada App Console).
 * Every message is signed; a valid order message triggers an incremental sync for
 * that seller. We only use the push as a "something changed" signal — the data
 * itself always comes from the official API, so a forged push can't inject orders.
 */
export async function POST(req: Request) {
  const cfg = lazadaConfig();
  if (!cfg) return NextResponse.json({ error: "Lazada isn't configured" }, { status: 503 });
  const raw = await req.text();
  const expected = lazadaPushSignature(cfg.appKey, cfg.appSecret, raw);
  if (!sameSignature(expected, req.headers.get("authorization"))) {
    console.warn("[lazada push] rejected: bad signature");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let msg: { seller_id?: string | number; message_type?: number } = {};
  try {
    msg = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 200 }); // signed but not JSON (e.g. a console test) — acknowledge
  }
  const seller = msg.seller_id != null ? String(msg.seller_id) : "";
  // Any message for a connected seller (trade order status, returns, …) triggers a coalesced sync.
  if (seller) {
    const receivedAt = Date.now();
    after(async () => {
      try {
        const r = await syncFromPush("lazada", seller, receivedAt);
        console.log("[lazada push] seller", seller, "type", msg.message_type, r);
      } catch (e) {
        console.error("[lazada push] sync failed", e instanceof Error ? e.message : e);
      }
    });
  }
  return new NextResponse(null, { status: 200 });
}

/** Lets you open the URL in a browser to check it's deployed. */
export function GET() {
  return NextResponse.json({ ok: true, endpoint: "Lazada push receiver", configured: !!lazadaConfig() });
}
