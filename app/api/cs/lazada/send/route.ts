import { NextResponse } from "next/server";
import { HttpError, str } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getChat, getMessages, lazadaChatContext, markRead, sendText } from "@/lib/integrations/lazada/chat";
import { chatError } from "@/lib/integrations/lazada/chat-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send an approved reply. Only the owner/admin can send — this is the approval step. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new HttpError(400, "Invalid request.");
    const id = str(body.sessionId, "sessionId", 120);
    const text = str(body.text, "text", 2000).trim();
    if (!text) throw new HttpError(400, "The reply is empty.");
    if (body.approved !== true) throw new HttpError(400, "Replies must be approved before sending.");
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    const c = await lazadaChatContext(m.workspaceId);
    const sent = await sendText(c, id, text);
    // mark the chat read up to the latest message (best effort)
    try {
      const session = await getChat(c, id);
      const msgs = await getMessages(c, session, 5);
      const last = sent.messageId ?? msgs.at(-1)?.id;
      if (last) await markRead(c, id, last);
    } catch {}
    return NextResponse.json({ ok: true, ...sent });
  } catch (e) {
    return chatError(e);
  }
}
