import "server-only";
import { listIntegrations } from "./store";
import { syncShopee } from "./shopee/sync";
import { syncLazada } from "./lazada/sync";
import { runOrderAutomation } from "./order-automation";

/**
 * Quick order check (the backup for instant pushes, and "Check now"): orders-only sync of each store
 * that hasn't synced in the last few minutes, then Farid's run. Time-boxed so it always finishes.
 */
export async function checkOrdersNow(ws: string, source: "schedule" | "manual", staleMs = 4 * 60_000) {
  const rows = await listIntegrations(ws);
  const syncs = rows
    .filter((r) => (r.provider === "shopee" || r.provider === "lazada") && r.status !== "expired" && r.status !== "disconnected")
    .filter((r) => !r.last_success_at || Date.now() - Date.parse(r.last_success_at) > staleMs)
    .map((r) => (r.provider === "shopee" ? syncShopee(r, { light: true }) : syncLazada(r, { light: true })).catch((e) => console.error(`[orders] ${r.provider} sync failed`, e instanceof Error ? e.message : e)));
  await Promise.race([Promise.allSettled(syncs), new Promise((r) => setTimeout(r, 60_000))]);
  return runOrderAutomation(ws, source);
}
