import { runCron } from "@/lib/integrations/cron-run";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { sendBriefing } from "@/lib/integrations/briefing-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily morning briefing (Vercel Cron, ~8:30am Malaysia time) to every linked Telegram chat. */
export async function GET(req: Request) {
  return runCron(req, "briefing", async () => {
    const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id, last_success_at").eq("provider", "telegram").eq("status", "connected");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const sentToday = (iso: unknown) =>
      typeof iso === "string" &&
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso)) === today;
    if (error) throw new Error(error.message);
    const results: { workspace: string; ok: boolean; error?: string }[] = [];
    // skip workspaces that already got today's briefing (e.g. from the backup trigger)
    for (const r of (data ?? []).filter((r) => !sentToday(r.last_success_at))) {
      const ws = r.workspace_id as string;
      // claim today's slot first: Vercel Cron and the GitHub backup may both call this at 08:30
      const claim = getAdminSupabase().from("integrations").update({ last_success_at: new Date().toISOString() }).eq("workspace_id", ws).eq("provider", "telegram");
      const { data: claimed } = await (r.last_success_at ? claim.eq("last_success_at", r.last_success_at) : claim.is("last_success_at", null)).select("id");
      if (!claimed?.length) continue;
      try {
        await sendBriefing(ws, { refresh: true });
        results.push({ workspace: ws, ok: true });
      } catch (e) {
        await getAdminSupabase()
          .from("integrations")
          .update({ last_success_at: r.last_success_at ?? null })
          .eq("workspace_id", ws)
          .eq("provider", "telegram");
        results.push({
          workspace: ws,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { sent: results.filter((r) => r.ok).length, results };
  });
}
