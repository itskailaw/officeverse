import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { linkCode, telegramToken, tg, webhookSecret } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Point the bot's webhook here and return a one-time t.me link that links this workspace. */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    if (!telegramToken()) throw new HttpError(400, "Add TELEGRAM_BOT_TOKEN in Vercel (Secret) and redeploy first.");
    const origin = new URL(req.url).origin;
    if (!origin.startsWith("https://")) throw new HttpError(400, "Telegram needs the live https site — connect from your Vercel address.");
    const me = await tg<{ username: string }>("getMe", {});
    await tg("setWebhook", { url: `${origin}/api/telegram/webhook`, secret_token: webhookSecret(), allowed_updates: ["message"], drop_pending_updates: true });
    return NextResponse.json({ url: `https://t.me/${me.username}?start=${linkCode(m.workspaceId)}`, bot: me.username });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Telegram:")) return errorResponse(new HttpError(502, e.message));
    return errorResponse(e);
  }
}
