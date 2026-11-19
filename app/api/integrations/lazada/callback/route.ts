import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole, saveIntegration } from "@/lib/integrations/store";
import { createToken, lazadaGet, LazadaError, requireLazadaConfig } from "@/lib/integrations/lazada/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(req: NextRequest, result: string, message?: string) {
  const u = new URL("/office", req.url);
  u.searchParams.set("lazada", result);
  if (message) u.searchParams.set("message", message.slice(0, 200));
  const res = NextResponse.redirect(u);
  res.cookies.delete({ name: "ov_lazada_state", path: "/api/integrations/lazada" });
  return res;
}

/** Lazada redirects here with ?code (and our state) after the seller approves. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const cookie = req.cookies.get("ov_lazada_state")?.value ?? "";
  const [expected, workspaceId] = cookie.split(".");
  try {
    if (!code) throw new HttpError(400, q.get("error_description") || "Lazada didn't return an authorisation code.");
    // the connect step set this cookie in this browser within the last 10 minutes
    if (!expected) throw new HttpError(400, "The connection link expired or was opened in another browser. Please try again.");
    const state = q.get("state");
    if (state) {
      const a = Buffer.from(state);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(400, "Security check failed. Please try connecting again.");
    }
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    if (m.workspaceId !== workspaceId) throw new HttpError(403, "Workspace mismatch. Please try again.");

    const cfg = requireLazadaConfig();
    const tok = await createToken(cfg, code);
    const my = tok.country_user_info?.find((c) => c.country?.toLowerCase() === "my") ?? tok.country_user_info?.[0];
    const sellerId = my?.seller_id ?? tok.account;
    if (!sellerId) throw new HttpError(502, "Lazada didn't say which shop was authorised.");
    if (my && my.country?.toLowerCase() !== "my") throw new HttpError(400, `This Lazada account is for ${my.country.toUpperCase()}, not Malaysia.`);

    let shopName: string | null = null;
    try {
      const seller = await lazadaGet<{ name?: string; name_company?: string }>(cfg, "/seller/get", {}, tok.access_token);
      shopName = seller?.name ?? seller?.name_company ?? null;
    } catch {
      // nice-to-have
    }
    await saveIntegration({
      workspace_id: m.workspaceId,
      provider: "lazada",
      shop_id: String(sellerId),
      company_id: "co-wgs",
      shop_name: shopName,
      tokens: { access_token: tok.access_token, refresh_token: tok.refresh_token },
      token_expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      expires_at: tok.refresh_expires_in ? new Date(Date.now() + tok.refresh_expires_in * 1000).toISOString() : null,
      status: "connected",
      last_error: null,
    });
    return back(req, "connected");
  } catch (e) {
    let msg = e instanceof HttpError || e instanceof LazadaError ? e.message : "Something went wrong while connecting Lazada.";
    if (e instanceof LazadaError && /sign/i.test(e.code + e.message)) msg = "Lazada rejected the signature. Check LAZADA_APP_SECRET in Vercel matches the App Secret for your App Key, then redeploy and connect again.";
    if (!(e instanceof HttpError)) console.error("[lazada callback]", e);
    return back(req, "error", msg);
  }
}
