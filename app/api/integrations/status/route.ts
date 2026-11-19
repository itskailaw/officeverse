import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership, listIntegrations } from "@/lib/integrations/store";
import { shopeeConfig } from "@/lib/integrations/shopee/api";
import { lazadaConfig } from "@/lib/integrations/lazada/api";
import { telegramToken } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Connection status for the settings page — never returns credentials. */
export async function GET() {
  const setup = {
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
    encryptionKey: Boolean(process.env.INTEGRATION_ENCRYPTION_KEY && process.env.INTEGRATION_ENCRYPTION_KEY.length >= 24),
    shopeeApp: Boolean(shopeeConfig()),
    shopeeEnv: shopeeConfig()?.env ?? null,
    lazadaApp: Boolean(lazadaConfig()),
    telegramBot: Boolean(telegramToken()),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  if (!setup.supabase || !setup.serviceRole) return NextResponse.json({ setup, integrations: [] });
  try {
    const m = await getMembership();
    const rows = await listIntegrations(m.workspaceId);
    return NextResponse.json(
      {
        setup,
        role: m.role,
        integrations: rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          shopId: r.shop_id,
          shopName: r.shop_name,
          status: r.status,
          lastSync: r.last_success_at,
          lastError: r.last_error,
          expiresAt: r.expires_at,
          lastSummary: r.last_sync_summary,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
