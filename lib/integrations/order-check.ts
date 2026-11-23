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

/**
 * "Refresh" in Packing: fetch the latest order statuses from Shopee and Lazada (orders only, no
 * automation), so parcels scanned at drop-off leave "To ship". Skips a store synced in the last 20 s.
 */
export async function refreshOrders(ws: string) {
  const rows = (await listIntegrations(ws)).filter((r) => (r.provider === "shopee" || r.provider === "lazada") && r.status !== "expired" && r.status !== "disconnected");
  const errors: string[] = [];
  const syncs = rows
    .filter((r) => !r.last_success_at || Date.now() - Date.parse(r.last_success_at) > 20_000)
    .map((r) =>
      (r.provider === "shopee" ? syncShopee(r, { light: true }) : syncLazada(r, { light: true })).catch((e) => {
        errors.push(`${r.provider === "shopee" ? "Shopee" : "Lazada"}: ${e instanceof Error ? e.message : String(e)}`);
      }),
    );
  const finished = await Promise.race([Promise.allSettled(syncs).then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 50_000))]);
  return { stores: rows.length, synced: syncs.length, finished, errors };
}
