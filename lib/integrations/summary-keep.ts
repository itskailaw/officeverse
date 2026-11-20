import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Fields of an integration's last_sync_summary that belong to automation, not to the sync itself — carried over by every sync. */
const KEEP = ["autoTried", "lastPushAt", "autoRun"] as const;

export function keptSummary(prev: Record<string, unknown> | null | undefined) {
  const out: Record<string, unknown> = {};
  for (const k of KEEP) if (prev && prev[k] !== undefined) out[k] = prev[k];
  return out;
}

/** The automation fields as they are now in the database (not as they were when a slow sync started). */
export async function freshKept(row: { id: string; last_sync_summary?: Record<string, unknown> | null }) {
  const { data } = await getAdminSupabase().from("integrations").select("last_sync_summary").eq("id", row.id).maybeSingle();
  return keptSummary((data?.last_sync_summary as Record<string, unknown> | null) ?? row.last_sync_summary);
}
