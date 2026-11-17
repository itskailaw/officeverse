import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole, saveIntegration } from "@/lib/integrations/store";
import { getAccessToken, requireShopeeConfig, shopGet, ShopeeError } from "@/lib/integrations/shopee/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: NextRequest, result: string, message?: string) {
  const u = new URL("/office", req.url);
  u.searchParams.set("shopee", result);
  if (message) u.searchParams.set("message", message.slice(0, 200));
  const res = NextResponse.redirect(u);
  res.cookies.delete({ name: "ov_shopee_state", path: "/api/integrations/shopee" });
  return res;
}

/** Shopee redirects here with ?code&shop_id&state after the seller approves. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const shopId = Number(q.get("shop_id"));
  const state = q.get("state") ?? "";
  const cookie = req.cookies.get("ov_shopee_state")?.value ?? "";
  const [expected, workspaceId] = cookie.split(".");
  try {
    if (!code || !shopId) {
      if (q.get("main_account_id")) throw new HttpError(400, "Please authorise with the shop account (not a main account) for now.");
      throw new HttpError(400, "Shopee didn't return an authorisation code.");
    }
    const a = Buffer.from(state);
    const b = Buffer.from(expected ?? "");
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(400, "The connection link expired or was opened in another browser. Please try again.");
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    if (m.workspaceId !== workspaceId) throw new HttpError(403, "Workspace mismatch. Please try again.");

    const cfg = requireShopeeConfig();
    const tok = await getAccessToken(cfg, code, shopId);
    let shopName: string | null = null;
    let expiresAt: string | null = null;
    try {
      const info = await shopGet<{ shop_name?: string; expire_time?: number }>(cfg, "/api/v2/shop/get_shop_info", {}, tok.access_token, shopId);
      shopName = info.shop_name ?? null;
      expiresAt = info.expire_time ? new Date(info.expire_time * 1000).toISOString() : null;
    } catch {
      // shop info is nice-to-have
    }
    await saveIntegration({
      workspace_id: m.workspaceId,
      provider: "shopee",
      shop_id: String(shopId),
      company_id: "co-wgs",
      shop_name: shopName,
      tokens: { access_token: tok.access_token, refresh_token: tok.refresh_token },
      token_expires_at: new Date(Date.now() + tok.expire_in * 1000).toISOString(),
      expires_at: expiresAt,
      status: "connected",
      last_error: null,
    });
    return back(req, "connected");
  } catch (e) {
    const msg = e instanceof HttpError || e instanceof ShopeeError ? e.message : "Something went wrong while connecting Shopee.";
    if (!(e instanceof HttpError)) console.error("[shopee callback]", e);
    return back(req, "error", msg);
  }
}
