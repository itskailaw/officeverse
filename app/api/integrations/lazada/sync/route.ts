import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, listIntegrations, requireRole } from "@/lib/integrations/store";
import { syncLazada } from "@/lib/integrations/lazada/sync";
import { LazadaError } from "@/lib/integrations/lazada/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin", "manager"]);
    const rows = await listIntegrations(m.workspaceId, "lazada");
    if (!rows.length) throw new HttpError(404, "Lazada isn't connected yet.");
    const results = [];
    for (const row of rows) {
      try {
        results.push({ shop: row.shop_name ?? row.shop_id, ok: true, ...(await syncLazada(row)) });
      } catch (e) {
        results.push({ shop: row.shop_name ?? row.shop_id, ok: false, error: e instanceof LazadaError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
