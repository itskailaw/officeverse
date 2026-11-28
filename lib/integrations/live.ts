import "server-only";
import type { Amare, Artides } from "@/lib/data/business";
import type { OfficeContext } from "@/lib/ai/protocol";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMembership } from "./store";
import { liveSummary } from "./summary";
import { listIntegrations } from "./store";
import type { AutomationInfo } from "@/lib/ai/protocol";

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

/** How the workspace's automations are set, from saved settings (so AI staff can describe them accurately). */
export function automationFrom(settings: Record<string, unknown> | null | undefined, telegramLinked: boolean): AutomationInfo {
  const a = (settings?.autoArrange ?? {}) as { enabled?: boolean; start?: string; end?: string };
  const p = (settings?.packingEmail ?? {}) as { enabled?: boolean; mode?: string; time?: string; to?: string };
  return {
    autoConfirm: { enabled: !!a.enabled, start: a.start ?? "08:00", end: a.end ?? "22:00" },
    packingEmail: { enabled: !!p.enabled, mode: p.mode === "instant" ? "instant" : p.mode === "smart" ? "smart" : "daily", time: p.time ?? "12:00", hasAddress: !!p.to },
    telegramLinked,
    language: settings?.language === "ms" || settings?.language === "zh" ? (settings.language as "ms" | "zh") : "en",
  };
}

export async function automationForUser(): Promise<AutomationInfo | null> {
  try {
    const sb = await getServerSupabase();
    if (!sb) return null;
    const m = await getMembership();
    const { data } = await sb.from("office_layouts").select("settings").eq("workspace_id", m.workspaceId).maybeSingle();
    const tg = (await listIntegrations(m.workspaceId, "telegram")).some((r) => r.status === "connected");
    return automationFrom(data?.settings as Record<string, unknown> | null, tg);
  } catch {
    return null;
  }
}

/** Artides projects/quotations and Amare jobs for the signed-in workspace (server-side, for the AI staff). */
export async function businessForUser(): Promise<OfficeContext["business"]> {
  try {
    const sb = await getServerSupabase();
    if (!sb) return null;
    const m = await getMembership();
    const { data } = await sb.from("office_layouts").select("settings").eq("workspace_id", m.workspaceId).maybeSingle();
    const st = (data?.settings ?? null) as { artides?: Artides; amare?: Amare } | null;
    return { artides: st?.artides ?? null, amare: st?.amare ?? null };
  } catch {
    return null;
  }
}
