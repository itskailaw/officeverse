import { runCron } from "@/lib/integrations/cron-run";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationRow } from "@/lib/integrations/store";
import { listIntegrations } from "@/lib/integrations/store";
import { syncShopee } from "@/lib/integrations/shopee/sync";
import { syncLazada } from "@/lib/integrations/lazada/sync";
import { checkAlerts } from "@/lib/integrations/alerts";
import { runOrderAutomation } from "@/lib/integrations/order-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron): syncs every connected Shopee shop. This also keeps
 * tokens fresh — Shopee refresh tokens expire after 30 days without use.
 */
export async function GET(req: Request) {
  return runCron(req, "sync", async () => {
    const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id").in("provider", ["shopee", "lazada"]);
    if (error) throw new Error(error.message);
    const workspaces = [...new Set((data ?? []).map((r) => r.workspace_id as string))];
    const results: {
      workspace: string;
      shop: string | null;
      ok: boolean;
      error?: string;
    }[] = [];
    for (const ws of workspaces) {
      const rows: IntegrationRow[] = await listIntegrations(ws);
      for (const row of rows) {
        try {
          if (row.provider === "shopee") await syncShopee(row);
          else if (row.provider === "lazada") await syncLazada(row);
          else continue;
          results.push({ workspace: ws, shop: row.shop_id, ok: true });
        } catch (e) {
          results.push({
            workspace: ws,
            shop: row.shop_id,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      try {
        await runOrderAutomation(ws);
      } catch {}
      try {
        await checkAlerts(ws);
      } catch {}
    }
    return { synced: results.length, results };
  });
}
