// Lazada Instant Messaging (seller ↔ buyer chat). Paths/parameters from the Lazada
// Open Platform API reference, Instant Messaging API group:
//   GET  /im/session/list   start_time (ms, now for page 1), page_size, last_session_id
//   GET  /im/session/get    session_id
//   GET  /im/message/list   session_id, start_time, page_size, last_message_id
//   POST /im/message/send   session_id, template_id (1 = text), txt
//   POST /im/session/read   session_id, last_read_message_id
// Chats are fetched live and never stored by OfficeVerse.

export interface ChatSession {
  id: string;
  buyerId: string | null;
  title: string;
  summary: string;
  unread: number;
  lastAt: string | null;
  lastMessageId: string | null;
  avatar: string | null;
  tags: string[];
}
export interface ChatMsg {
  id: string;
  fromBuyer: boolean;
  text: string;
  kind: "text" | "image" | "item" | "order" | "voucher" | "other";
  orderId: string | null;
  itemId: string | null;
  imageUrl: string | null;
  at: string | null;
  autoReply: boolean;
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const ts = (v: unknown): string | null => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
};

export function normaliseSession(o: Record<string, unknown>): ChatSession {
  return {
    id: s(o.session_id),
    buyerId: s(o.buyer_id) || null,
    title: s(o.title) || "Buyer",
    summary: s(o.summary),
    unread: Number(o.unread_count) || 0,
    lastAt: ts(o.last_message_time),
    lastMessageId: s(o.last_message_id) || null,
    avatar: s(o.head_url) || null,
    tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
  };
}

function parseContent(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  const t = s(raw);
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t) as Record<string, unknown>;
    } catch {}
  }
  return { txt: t };
}

export function normaliseMessage(o: Record<string, unknown>, buyerId: string | null): ChatMsg {
  const c = parseContent(o.content);
  const tpl = Number(o.template_id ?? o.type);
  const fromId = s(o.from_account_id);
  const fromBuyer = buyerId && fromId ? fromId === buyerId : Number(o.from_account_type) === 1;
  const orderId = s(c.orderId ?? c.order_id ?? c.tradeOrderId) || null;
  const itemId = s(c.itemId ?? c.item_id) || null;
  const imageUrl = s(c.imgUrl ?? c.img_url ?? c.url) || null;
  const kind: ChatMsg["kind"] = tpl === 1 ? "text" : tpl === 3 ? "image" : tpl === 10006 ? "item" : tpl === 10007 ? "order" : tpl === 10008 ? "voucher" : c.txt ? "text" : "other";
  const label: Record<ChatMsg["kind"], string> = {
    text: "",
    image: "[Picture]",
    item: `[Product${itemId ? ` ${itemId}` : ""}${c.title ? `: ${s(c.title)}` : ""}]`,
    order: `[Order${orderId ? ` ${orderId}` : ""}]`,
    voucher: "[Voucher]",
    other: "[Message]",
  };
  return {
    id: s(o.message_id),
    fromBuyer: !!fromBuyer,
    text: (s(c.txt ?? c.text) || label[kind]).slice(0, 4000),
    kind,
    orderId,
    itemId,
    imageUrl: kind === "image" ? imageUrl : null,
    at: ts(o.send_time),
    autoReply: o.auto_reply === true || o.auto_reply === "true" || o.auto_reply === 1,
  };
}
