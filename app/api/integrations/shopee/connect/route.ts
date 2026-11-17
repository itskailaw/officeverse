import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { requireShopeeConfig } from "@/lib/integrations/shopee/api";
import { authLink } from "@/lib/integrations/shopee/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start Shopee authorization: redirect the seller to Shopee's consent page. */
export async function GET(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    const cfg = requireShopeeConfig();
    const origin = new URL(req.url).origin;
    const state = randomBytes(24).toString("hex");
    const res = NextResponse.redirect(authLink(cfg.env, cfg.partnerId, `${origin}/api/integrations/shopee/callback`, state));
    res.cookies.set("ov_shopee_state", `${state}.${m.workspaceId}`, {
      httpOnly: true,
      secure: origin.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/integrations/shopee",
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
