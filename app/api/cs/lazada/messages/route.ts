import { NextResponse } from "next/server";
import { HttpError } from "@/lib/ai/server/guard";
import { getMembership } from "@/lib/integrations/store";
import { getChat, getMessages, lazadaChatContext } from "@/lib/integrations/lazada/chat";
import { chatError } from "@/lib/integrations/lazada/chat-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("session") ?? "";
    if (!/^[\w.:-]{1,120}$/.test(id)) throw new HttpError(400, "Invalid chat id.");
    const m = await getMembership();
    const c = await lazadaChatContext(m.workspaceId);
    const session = await getChat(c, id);
    const messages = await getMessages(c, session);
    return NextResponse.json({ session, messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return chatError(e);
  }
}
