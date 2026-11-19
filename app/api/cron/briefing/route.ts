import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendBriefing } from "@/lib/integrations/briefing-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily morning briefing (Vercel Cron, ~8:30am Malaysia time) to every linked Telegram chat. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id").eq("provider", "telegram").eq("status", "connected");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: { workspace: string; ok: boolean; error?: string }[] = [];
  for (const ws of [...new Set((data ?? []).map((r) => r.workspace_id as string))]) {
    try {
      await sendBriefing(ws, { refresh: true });
      results.push({ workspace: ws, ok: true });
    } catch (e) {
      results.push({ workspace: ws, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
}
