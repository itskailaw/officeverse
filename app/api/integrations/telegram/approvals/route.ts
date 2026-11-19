import { after, NextResponse } from "next/server";
import { errorResponse } from "@/lib/ai/server/guard";
import { getMembership } from "@/lib/integrations/store";
import { notifyNewApprovals } from "@/lib/integrations/telegram-office";
import { ensureWebhook, telegramToken } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The app just created approval requests: post them to the CEO's Telegram with ✅ / ❌ buttons. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    if (!telegramToken()) return NextResponse.json({ ok: false, reason: "telegram not configured" });
    const origin = new URL(req.url).origin;
    after(async () => {
      await ensureWebhook(origin);
      await notifyNewApprovals(m.workspaceId).catch((e) => console.error("[telegram approvals]", e));
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
