"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProposedAction } from "@/lib/ai/actions";

export interface ActionCard extends ProposedAction {
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  result?: string;
}

/** Approve / Cancel cards under staff chat messages (kept in this browser; chat text itself syncs as usual). */
export const useActionCards = create<{
  byMessage: Record<string, ActionCard[]>;
  add(messageId: string, actions: ProposedAction[]): void;
  update(messageId: string, action: string, patch: Partial<ActionCard>): void;
}>()(
  persist(
    (set) => ({
      byMessage: {},
      add: (messageId, actions) =>
        set((s) => {
          const next = { ...s.byMessage, [messageId]: actions.map((a) => ({ ...a, status: "pending" as const })) };
          // keep the last 200 messages' cards
          const keys = Object.keys(next);
          for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete next[k];
          return { byMessage: next };
        }),
      update: (messageId, action, patch) =>
        set((s) => ({ byMessage: { ...s.byMessage, [messageId]: (s.byMessage[messageId] ?? []).map((c) => (c.action === action ? { ...c, ...patch } : c)) } })),
    }),
    { name: "ov:action-cards" },
  ),
);
