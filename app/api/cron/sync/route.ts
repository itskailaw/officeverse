import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { IntegrationRow } from "@/lib/integrations/store";
import { listIntegrations } from "@/lib/integrations/store";
import { syncShopee } from "@/lib/integrations/shopee/sync";
import { syncLazada } from "@/lib/integrations/lazada/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron): syncs every connected Shopee shop. This also keeps
 * tokens fresh — Shopee refresh tokens expire after 30 days without use.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await getAdminSupabase().from("integrations").select("workspace_id").in("provider", ["shopee", "lazada"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const workspaces = [...new Set((data ?? []).map((r) => r.workspace_id as string))];
  const results: { workspace: string; shop: string | null; ok: boolean; error?: string }[] = [];
  for (const ws of workspaces) {
    const rows: IntegrationRow[] = await listIntegrations(ws);
    for (const row of rows) {
      try {
        if (row.provider === "shopee") await syncShopee(row);
        else if (row.provider === "lazada") await syncLazada(row);
        else continue;
        results.push({ workspace: ws, shop: row.shop_id, ok: true });
      } catch (e) {
        results.push({ workspace: ws, shop: row.shop_id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
