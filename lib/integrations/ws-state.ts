import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Small per-workspace memory for automations (what was already alerted, last weekly review…).
 * Falls back to the old place (the Telegram connection) when migration 0008 hasn't been run yet.
 */
export async function getWsState<T>(ws: string, key: string, fallback: T): Promise<T> {
  const { data, error } = await getAdminSupabase().from("workspace_state").select("value").eq("workspace_id", ws).eq("key", key).maybeSingle();
  if (error || !data) return fallback;
  return data.value as T;
}
export async function setWsState(ws: string, key: string, value: unknown) {
  const { error } = await getAdminSupabase()
    .from("workspace_state")
    .upsert({ workspace_id: ws, key, value, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,key" });
  return !error;
}
