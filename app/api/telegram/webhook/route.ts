import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { saveIntegration } from "@/lib/integrations/store";
import { sendTelegram, verifyLinkCode, webhookSecret } from "@/lib/integrations/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Update {
  message?: { text?: string; chat: { id: number; type: string; first_name?: string; username?: string } };
}

/** Telegram → OfficeVerse. Only used to link a chat via "/start <code>". */
export async function POST(req: Request) {
  const secret = webhookSecret();
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const u = (await req.json().catch(() => ({}))) as Update;
  const msg = u.message;
  if (!msg?.chat) return NextResponse.json({ ok: true });
  const chatId = String(msg.chat.id);
  const text = (msg.text ?? "").trim();
  try {
    const m = /^\/start(?:@\w+)?\s+(\S+)/.exec(text);
    if (m) {
      const ws = verifyLinkCode(m[1]);
      if (!ws) {
        await sendTelegram(chatId, "This link has expired. Open OfficeVerse → Settings → Integrations → Telegram and click <b>Connect</b> again.");
      } else if (msg.chat.type !== "private") {
        await sendTelegram(chatId, "Please open the link in a private chat with this bot, not in a group.");
      } else {
        try {
          const sb = getAdminSupabase();
          await sb.from("integrations").delete().eq("workspace_id", ws).eq("provider", "telegram");
          await saveIntegration({
            workspace_id: ws,
            provider: "telegram",
            shop_id: chatId,
            shop_name: msg.chat.username ? `@${msg.chat.username}` : (msg.chat.first_name ?? "Telegram"),
            status: "connected",
            last_error: null,
          });
        } catch (e) {
          console.error("[telegram link]", e instanceof Error ? e.message : e);
          await sendTelegram(chatId, "⚠️ Couldn't link this chat. Make sure the <b>0004 database update</b> has been run in Supabase (SQL Editor), then click Connect again.");
          return NextResponse.json({ ok: true });
        }
        await sendTelegram(chatId, "✅ <b>Connected to OfficeVerse.</b>\nYou'll get your morning briefing here every day around 8:30am (Malaysia time).");
      }
    } else if (text.startsWith("/")) {
      await sendTelegram(chatId, "I'm your OfficeVerse bot: I send the morning briefing and important alerts. Manage me in OfficeVerse → Settings → Integrations.");
    }
  } catch (e) {
    console.error("[telegram webhook]", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
