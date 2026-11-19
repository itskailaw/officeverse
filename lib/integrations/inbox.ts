"use client";

// Customer chat inbox (Lazada) — fetched live from the server, never persisted.
import { create } from "zustand";

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

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

interface InboxState {
  chats: ChatSession[];
  unread: number;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  loadChats(): Promise<void>;
}

export const useInbox = create<InboxState>()((set, get) => ({
  chats: [],
  unread: 0,
  loaded: false,
  loading: false,
  error: null,
  async loadChats() {
    if (get().loading) return;
    set({ loading: true });
    try {
      const r = await json<{ chats: ChatSession[]; unread: number }>("/api/cs/lazada/chats");
      set({ chats: r.chats, unread: r.unread, loaded: true, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true });
    } finally {
      set({ loading: false });
    }
  },
}));

export const loadMessages = (sessionId: string) => json<{ session: ChatSession; messages: ChatMsg[] }>(`/api/cs/lazada/messages?session=${encodeURIComponent(sessionId)}`);

export const draftReply = (body: { sessionId: string; employee: unknown; context: unknown }) =>
  json<{ reply: string; note: string | null; category: string; orders: Record<string, unknown>[] }>("/api/cs/lazada/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const sendReply = (sessionId: string, text: string) =>
  json<{ ok: true }>("/api/cs/lazada/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, text, approved: true }) });
