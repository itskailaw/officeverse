import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { checkOrdersNow } from "@/lib/integrations/order-check";
import { healthWatch } from "@/lib/integrations/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 10 minutes (GitHub Actions): backup for instant pushes — new orders get confirmed even if a push is missed. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id").in("provider", ["shopee", "lazada"]).neq("status", "expired");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: { workspace: string; ok: boolean; result?: unknown; error?: string }[] = [];
  for (const ws of [...new Set((data ?? []).map((r) => r.workspace_id as string))]) {
    try {
      const result = await checkOrdersNow(ws, "schedule");
      // Ethan (IT) watches system health and tells the CEO when something breaks or recovers
      await healthWatch(ws).catch((e) => console.error("[health]", e instanceof Error ? e.message : e));
      results.push({ workspace: ws, ok: true, result });
    } catch (e) {
      results.push({ workspace: ws, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
