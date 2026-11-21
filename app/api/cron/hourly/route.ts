import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { ensurePackingEmail } from "@/lib/integrations/packing-email";
import { ensureWeeklyReview } from "@/lib/integrations/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly job (GitHub Actions): Farid's daily packing-list email, and Sophia's Monday weekly review. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getAdminSupabase().from("office_layouts").select("workspace_id, settings");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: { workspace: string; ok: boolean; result?: unknown; error?: string }[] = [];
  for (const r of data ?? []) {
    // Sophia's Monday weekly review (from 9am Malaysia time, once a week)
    try {
      const w = await ensureWeeklyReview(r.workspace_id as string);
      if (w) results.push({ workspace: r.workspace_id as string, ok: true, result: { weekly: w.sent } });
    } catch (e) {
      results.push({ workspace: r.workspace_id as string, ok: false, error: `weekly: ${e instanceof Error ? e.message : String(e)}` });
    }
    if (!(r.settings as { packingEmail?: { enabled?: boolean } } | null)?.packingEmail?.enabled) continue;
    try {
      const res = await ensurePackingEmail(r.workspace_id as string);
      results.push({ workspace: r.workspace_id as string, ok: true, result: res ?? "not due" });
    } catch (e) {
      results.push({ workspace: r.workspace_id as string, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
