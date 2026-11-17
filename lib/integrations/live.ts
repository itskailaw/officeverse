import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMembership } from "./store";
import { liveSummary } from "./summary";

/** Live summary for the signed-in user's workspace, or null (no Supabase, not connected, or not yet migrated). */
export async function liveForUser(): Promise<Record<string, unknown> | null> {
  try {
    const sb = await getServerSupabase();
    if (!sb) return null;
    const m = await getMembership();
    return (await liveSummary(sb, m.workspaceId)) as unknown as Record<string, unknown> | null;
  } catch {
    return null;
  }
}
