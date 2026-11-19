import { NextResponse } from "next/server";
import { getMembership } from "@/lib/integrations/store";
import { lazadaChatContext, listChats } from "@/lib/integrations/lazada/chat";
import { chatError } from "@/lib/integrations/lazada/chat-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lazada buyer chats (fetched live, not stored). */
export async function GET() {
  try {
    const m = await getMembership();
    const c = await lazadaChatContext(m.workspaceId);
    const chats = await listChats(c);
    return NextResponse.json({ chats, unread: chats.reduce((s, x) => s + (x.unread > 0 ? 1 : 0), 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return chatError(e);
  }
}
