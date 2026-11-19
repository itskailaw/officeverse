import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { requireLazadaConfig } from "@/lib/integrations/lazada/api";
import { lazadaAuthLink } from "@/lib/integrations/lazada/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start Lazada authorisation: send the seller to Lazada's consent page. */
export async function GET(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    const cfg = requireLazadaConfig();
    const origin = new URL(req.url).origin;
    const state = randomBytes(24).toString("hex");
    const res = NextResponse.redirect(lazadaAuthLink(cfg.appKey, `${origin}/api/integrations/lazada/callback`, state));
    res.cookies.set("ov_lazada_state", `${state}.${m.workspaceId}`, {
      httpOnly: true,
      secure: origin.startsWith("https"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/integrations/lazada",
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
