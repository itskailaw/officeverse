import { runCron } from "@/lib/integrations/cron-run";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { ensurePackingEmail } from "@/lib/integrations/packing-email";
import { ensureWeeklyReview } from "@/lib/integrations/weekly";
import { reviewWatch } from "@/lib/integrations/reviews";
import { campaignWatch } from "@/lib/integrations/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Hourly job (GitHub Actions): Farid's daily packing-list email, and Sophia's Monday weekly review. */
export async function GET(req: Request) {
  return runCron(req, "hourly", async () => {
    const { data, error } = await getAdminSupabase().from("office_layouts").select("workspace_id, settings");
    if (error) throw new Error(error.message);
    const results: {
      workspace: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }[] = [];
    for (const r of data ?? []) {
      // Sophia's Monday weekly review (from 9am Malaysia time, once a week)
      try {
        const w = await ensureWeeklyReview(r.workspace_id as string);
        if (w)
          results.push({
            workspace: r.workspace_id as string,
            ok: true,
            result: { weekly: w.sent },
          });
      } catch (e) {
        results.push({
          workspace: r.workspace_id as string,
          ok: false,
          error: `weekly: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      // Mei Ling's review watch (Shopee ratings; low ones get a draft reply for approval)
      try {
        const rv = await reviewWatch(r.workspace_id as string);
        if (rv.flagged)
          results.push({
            workspace: r.workspace_id as string,
            ok: true,
            result: { reviews: rv.flagged },
          });
      } catch (e) {
        results.push({
          workspace: r.workspace_id as string,
          ok: false,
          error: `reviews: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      // Hafiz's sale-event reminders (11.11, Raya, …)
      try {
        const c = await campaignWatch(r.workspace_id as string);
        if (c.reminded) results.push({ workspace: r.workspace_id as string, ok: true, result: { campaigns: c.reminded } });
      } catch (e) {
        results.push({ workspace: r.workspace_id as string, ok: false, error: `campaigns: ${e instanceof Error ? e.message : String(e)}` });
      }
      if (!(r.settings as { packingEmail?: { enabled?: boolean } } | null)?.packingEmail?.enabled) continue;
      try {
        const res = await ensurePackingEmail(r.workspace_id as string);
        results.push({
          workspace: r.workspace_id as string,
          ok: true,
          result: res ?? "not due",
        });
      } catch (e) {
        results.push({
          workspace: r.workspace_id as string,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { results };
  });
}
