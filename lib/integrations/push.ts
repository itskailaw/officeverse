import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationRow } from "./store";
import { syncShopee } from "./shopee/sync";
import { syncLazada } from "./lazada/sync";

const COLUMNS =
  "id, workspace_id, company_id, provider, status, shop_id, shop_name, credentials_enc, token_expires_at, expires_at, last_success_at, last_error, last_sync_summary";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A marketplace told us something changed for this shop: run an incremental sync soon.
 * Pushes arrive in bursts (one per order status change), so they are coalesced:
 * wait briefly, skip if another sync started after this push arrived (it covers this change),
 * and if a sync is mid-way, wait for it to finish and then run one more.
 */
export async function syncFromPush(provider: "shopee" | "lazada", shopId: string, receivedAt = Date.now()) {
  const sb = getAdminSupabase();
  const { data, error } = await sb.from("integrations").select(COLUMNS).eq("provider", provider).eq("shop_id", shopId);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as IntegrationRow[]).filter((r) => r.status !== "expired");
  if (!rows.length) return { synced: 0, reason: "no connected integration for this shop" };

  await sleep(3000);
  let synced = 0;
  for (const row of rows) {
    for (let i = 0; i < 15; i++) {
      const { data: runs } = await sb
        .from("sync_runs")
        .select("status, started_at")
        .eq("integration_id", row.id)
        .order("started_at", { ascending: false })
        .limit(1);
      const last = runs?.[0] as { status: string; started_at: string } | undefined;
      const startedAfterPush = last && Date.parse(last.started_at) > receivedAt;
      if (startedAfterPush) break; // a newer sync already picks this change up
      const stillRunning = last?.status === "running" && Date.now() - Date.parse(last.started_at) < 4 * 60 * 1000;
      if (stillRunning) {
        await sleep(3000);
        continue;
      }
      if (provider === "shopee") await syncShopee(row);
      else await syncLazada(row);
      synced++;
      break;
    }
  }
  return { synced };
}
