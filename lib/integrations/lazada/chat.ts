import "server-only";
import { lazadaIm, requireLazadaConfig } from "./api";
import { validToken } from "./sync";
import { normaliseMessage, normaliseSession, type ChatMsg, type ChatSession } from "./im";
import { listIntegrations } from "../store";
import { HttpError } from "@/lib/ai/server/guard";

export async function lazadaChatContext(workspaceId: string) {
  const cfg = requireLazadaConfig();
  const [row] = await listIntegrations(workspaceId, "lazada");
  if (!row || row.status === "expired") throw new HttpError(409, "Lazada isn't connected (or needs re-connecting) — Settings → Integrations.");
  return { cfg, token: await validToken(cfg, row) };
}

type Ctx = Awaited<ReturnType<typeof lazadaChatContext>>;

export async function listChats(c: Ctx, pageSize = 30): Promise<ChatSession[]> {
  const d = await lazadaIm<{ session_list?: Record<string, unknown>[] }>(c.cfg, "/im/session/list", { start_time: Date.now(), page_size: pageSize }, c.token);
  return (d?.session_list ?? []).map(normaliseSession).filter((x) => x.id);
}

export async function getChat(c: Ctx, sessionId: string): Promise<ChatSession> {
  const d = await lazadaIm<Record<string, unknown>>(c.cfg, "/im/session/get", { session_id: sessionId }, c.token);
  return normaliseSession({ session_id: sessionId, ...(d ?? {}) });
}

/** Latest messages, oldest first. */
export async function getMessages(c: Ctx, session: ChatSession, pageSize = 40): Promise<ChatMsg[]> {
  const d = await lazadaIm<{ message_list?: Record<string, unknown>[] }>(c.cfg, "/im/message/list", { session_id: session.id, start_time: Date.now(), page_size: pageSize }, c.token);
  return (d?.message_list ?? [])
    .map((m) => normaliseMessage(m, session.buyerId))
    .filter((m) => m.id)
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

export async function sendText(c: Ctx, sessionId: string, text: string) {
  const d = await lazadaIm<{ message_id?: string }>(c.cfg, "/im/message/send", { session_id: sessionId, template_id: "1", txt: text }, c.token, "POST");
  return { messageId: d?.message_id ? String(d.message_id) : null };
}

export async function markRead(c: Ctx, sessionId: string, lastMessageId: string) {
  await lazadaIm(c.cfg, "/im/session/read", { session_id: sessionId, last_read_message_id: lastMessageId }, c.token, "POST");
}
