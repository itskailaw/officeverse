import { isStaffAction } from "@/lib/ai/actions";
import { runStaffAction } from "@/lib/integrations/staff-actions";
import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { saveIntegration } from "@/lib/integrations/store";
import { escapeHtml, sendTelegram, tg, verifyLinkCode, webhookSecret } from "@/lib/integrations/telegram";
import { answerFromTelegram, decideFromTelegram, sendApprovalCards, workspaceForChat } from "@/lib/integrations/telegram-office";
import { sendBriefing } from "@/lib/integrations/briefing-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Update {
  message?: { text?: string; chat: { id: number; type: string; first_name?: string; username?: string } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
}

const HELP = `<b>OfficeVerse bot</b>
Just type a message and Sophia (your Executive Assistant) answers with live data.
Talk to someone specific: <i>"ask Daniel how are our ads"</i> or <i>"Priya, what's low on stock?"</i>

/approvals — requests waiting for your OK (with ✅ / ❌ buttons)
/briefing — today's briefing now
/team — who's in the office
/help — this message`;

/** Telegram → OfficeVerse: linking (/start code), commands, chatting with staff and approval buttons. */
export async function POST(req: Request) {
  const secret = webhookSecret();
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const u = (await req.json().catch(() => ({}))) as Update;

  // ✅ / ❌ buttons on approval cards — only from the linked chat
  const cb = u.callback_query;
  if (cb?.data && cb.message) {
    const chat = String(cb.message.chat.id);
    try {
      const ws = await workspaceForChat(chat);
      const act = /^act:(\w{1,40})$/.exec(cb.data);
      if (ws && act) {
        // a staff action card: ✅ runs it, ✖ dismisses it
        await tg("editMessageReplyMarkup", { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        if (act[1] === "x" || !isStaffAction(act[1])) {
          await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "OK, not now." });
        } else {
          await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "On it…" });
          const r = await runStaffAction(ws, act[1]);
          await sendTelegram(chat, escapeHtml(r.text));
        }
        return NextResponse.json({ ok: true });
      }
      const m = /^ap:([\w-]{1,60}):([ar])$/.exec(cb.data);
      if (!ws || !m) {
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Not allowed." });
      } else {
        const r = await decideFromTelegram(ws, m[1], m[2] === "a");
        await tg("answerCallbackQuery", { callback_query_id: cb.id, text: r.text });
        await tg("editMessageReplyMarkup", { chat_id: chat, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
        if (r.ok) await sendTelegram(chat, `${r.text}: ${(r.summary ?? "").replace(/[<>&]/g, "")}`);
      }
    } catch (e) {
      console.error("[telegram callback]", e instanceof Error ? e.message : e);
    }
    return NextResponse.json({ ok: true });
  }

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
        await sendTelegram(chatId, "✅ <b>Connected to OfficeVerse.</b>\nYou'll get your morning briefing here every day around 8:30am (Malaysia time), plus alerts when something needs you.\n\nYou can also message me to talk to your team — type /help.");
      }
    } else if (text) {
      const ws = await workspaceForChat(chatId);
      if (!ws) {
        if (text.startsWith("/")) await sendTelegram(chatId, "This chat isn't linked yet. Open OfficeVerse → Settings → Integrations → Telegram → Connect.");
      } else if (/^\/(help|start)\b/.test(text)) {
        await sendTelegram(chatId, HELP);
      } else if (/^\/briefing\b/.test(text)) {
        after(() => sendBriefing(ws, { refresh: true }).catch((e) => sendTelegram(chatId, `⚠️ ${String(e instanceof Error ? e.message : e).replace(/[<>&]/g, "")}`)));
      } else if (/^\/approvals\b/.test(text)) {
        const { data } = await getAdminSupabase().from("approvals").select("id, kind, summary, draft, employee_id").eq("workspace_id", ws).eq("status", "pending").order("created_at", { ascending: true }).limit(5);
        if (!data?.length) await sendTelegram(chatId, "Nothing is waiting for your approval. 👍");
        else await sendApprovalCards(chatId, ws, data as { id: string; kind: string; summary: string; draft: string; employee_id: string }[]);
      } else if (/^\/team\b/.test(text)) {
        const { data } = await getAdminSupabase().from("employees").select("name, title, status, active").eq("workspace_id", ws).order("name");
        const list = (data ?? []).filter((e) => e.active).map((e) => `• <b>${String(e.name).replace(/[<>&]/g, "")}</b> — ${String(e.title).replace(/[<>&]/g, "")} (${String(e.status).replace(/_/g, " ")})`);
        await sendTelegram(chatId, list.length ? list.join("\n") : "No team saved yet — open OfficeVerse once.");
      } else {
        // a message for the team — answered in the background (AI replies take a few seconds)
        after(() => answerFromTelegram(ws, chatId, text.slice(0, 2000)).catch((e) => console.error("[telegram chat]", e)));
      }
    }
  } catch (e) {
    console.error("[telegram webhook]", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
