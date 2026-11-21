import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save this device's push subscription (owner). Body: { subscription, device }. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => ({}))) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; device?: string };
    const sub = body.subscription;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpError(400, "Invalid subscription.");
    const user = (await (await getServerSupabase())?.auth.getUser())?.data.user?.id ?? null;
    const { error } = await getAdminSupabase()
      .from("push_subscriptions")
      .upsert({ endpoint: sub.endpoint.slice(0, 1000), workspace_id: m.workspaceId, user_id: user, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device: String(body.device ?? "").slice(0, 80) }, { onConflict: "endpoint" });
    if (error) throw new Error(/relation|does not exist/i.test(error.message) ? "Run the 0007_push.sql migration in Supabase first." : error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Turn notifications off for a device. Body: { endpoint }. */
export async function DELETE(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
    if (body.endpoint) await getAdminSupabase().from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("workspace_id", m.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Devices with notifications on. */
export async function GET() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner"]);
    const { data } = await getAdminSupabase().from("push_subscriptions").select("endpoint, device, created_at, last_used_at").eq("workspace_id", m.workspaceId).order("created_at");
    return NextResponse.json({ devices: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}
