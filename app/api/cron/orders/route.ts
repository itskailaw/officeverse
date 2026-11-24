import { runCron } from "@/lib/integrations/cron-run";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { checkOrdersNow } from "@/lib/integrations/order-check";
import { healthWatch } from "@/lib/integrations/health";
import { stockWatch } from "@/lib/integrations/stock";
import { ensurePackingEmail } from "@/lib/integrations/packing-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Every 10 minutes (GitHub Actions): backup for instant pushes — new orders get confirmed even if a push is missed. */
export async function GET(req: Request) {
  return runCron(req, "orders", async () => {
    const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id").in("provider", ["shopee", "lazada"]).neq("status", "expired");
    if (error) throw new Error(error.message);
    const results: {
      workspace: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }[] = [];
    for (const ws of [...new Set((data ?? []).map((r) => r.workspace_id as string))]) {
      try {
        const result = await checkOrdersNow(ws, "schedule");
        // Ethan (IT) watches system health and tells the CEO when something breaks or recovers
        await healthWatch(ws).catch((e) => console.error("[health]", e instanceof Error ? e.message : e));
        // Farid's scheduled packing emails (smart mode's morning / cut-off sends, daily time) — on time to the 10 minutes
        await ensurePackingEmail(ws).catch((e) => console.error("[packing]", e instanceof Error ? e.message : e));
        // Priya (Inventory) warns when stock runs low
        await stockWatch(ws).catch((e) => console.error("[stock]", e instanceof Error ? e.message : e));
        results.push({ workspace: ws, ok: true, result });
      } catch (e) {
        results.push({
          workspace: ws,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    return { results };
  });
}
