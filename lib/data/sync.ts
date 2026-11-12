"use client";

// Mirrors the local store to Supabase (when configured and signed in).
// Local state stays the source of truth for the UI; writes are diffed per
// entity and upserted in the background. RLS scopes everything to the
// signed-in user's workspace.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useOffice, type OfficeData } from "@/lib/store/office-store";
import { useUI } from "@/lib/store/ui-store";

const COLLECTIONS = {
  companies: "companies",
  departments: "departments",
  employees: "employees",
  tasks: "tasks",
  meetings: "meetings",
  notifications: "notifications",
  audit: "audit_logs",
  activity: "activity_log",
} as const;
type Coll = keyof typeof COLLECTIONS;

const snake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(obj: Record<string, unknown>, workspaceId: string) {
  const row: Record<string, unknown> = { workspace_id: workspaceId };
  for (const [k, v] of Object.entries(obj)) row[snake(k)] = v ?? null;
  return row;
}
function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (k !== "workspace_id") out[camel(k)] = v;
  return out as T;
}

/** Find (or create) the signed-in user's workspace. */
export async function ensureWorkspace(sb: SupabaseClient): Promise<string> {
  const { data: user } = await sb.auth.getUser();
  if (!user.user) throw new Error("Not signed in");
  const { data: m, error } = await sb.from("workspace_members").select("workspace_id").eq("user_id", user.user.id).limit(1);
  if (error) throw error;
  if (m && m.length) return m[0].workspace_id as string;
  const { data: ws, error: e2 } = await sb.from("workspaces").insert({ name: "My OfficeVerse", owner_id: user.user.id }).select("id").single();
  if (e2) throw e2;
  return ws.id as string;
}

export async function startSync(sb: SupabaseClient, workspaceId: string) {
  const store = useOffice;

  // ---- initial load
  const loaded: Partial<OfficeData> = {};
  for (const [coll, table] of Object.entries(COLLECTIONS) as [Coll, string][]) {
    const { data, error } = await sb.from(table).select("*").eq("workspace_id", workspaceId);
    if (error) throw error;
    (loaded as Record<string, unknown>)[coll] = (data ?? []).map((r) => fromRow(r));
  }
  const { data: layout } = await sb.from("office_layouts").select("*").eq("workspace_id", workspaceId).maybeSingle();

  const fresh = !(loaded.companies && loaded.companies.length);
  if (fresh) {
    // first sign-in: push the current (seeded/local) office up
    const s = store.getState();
    for (const [coll, table] of Object.entries(COLLECTIONS) as [Coll, string][]) {
      const rows = (s[coll] as unknown as Record<string, unknown>[]).map((r) => toRow(r, workspaceId));
      if (rows.length) await sb.from(table).upsert(rows, { onConflict: "workspace_id,id" });
    }
    await sb.from("office_layouts").upsert({ workspace_id: workspaceId, furniture: s.furniture, settings: s.settings });
  } else {
    store.getState().hydrate({
      ...loaded,
      ...(layout ? { furniture: layout.furniture, settings: { ...store.getState().settings, ...layout.settings } } : {}),
    });
  }

  // ---- outgoing changes (debounced diff)
  let prevSnap = store.getState();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    const cur = store.getState();
    const prev = prevSnap;
    prevSnap = cur;
    try {
      for (const [coll, table] of Object.entries(COLLECTIONS) as [Coll, string][]) {
        const a = prev[coll] as unknown as { id: string }[];
        const b = cur[coll] as unknown as { id: string }[];
        if (a === b) continue;
        const before = new Map(a.map((x) => [x.id, x]));
        const changed = b.filter((x) => before.get(x.id) !== x);
        const ids = new Set(b.map((x) => x.id));
        const removed = a.filter((x) => !ids.has(x.id)).map((x) => x.id);
        if (changed.length)
          await sb.from(table).upsert(
            changed.map((r) => toRow(r as unknown as Record<string, unknown>, workspaceId)),
            { onConflict: "workspace_id,id" },
          );
        if (removed.length) await sb.from(table).delete().eq("workspace_id", workspaceId).in("id", removed);
      }
      if (prev.furniture !== cur.furniture || prev.settings !== cur.settings) {
        await sb.from("office_layouts").upsert({ workspace_id: workspaceId, furniture: cur.furniture, settings: cur.settings, updated_at: new Date().toISOString() });
      }
    } catch (e) {
      console.error("[sync]", e);
      useUI.getState().toast("error", "Cloud sync failed — changes are kept locally and will retry.");
      prevSnap = prev; // retry the same diff next time
    }
  };
  const unsub = store.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 700);
  });

  // ---- realtime: notifications & tasks written by server jobs (Phase 2+)
  const channel = sb
    .channel(`ws-${workspaceId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `workspace_id=eq.${workspaceId}` }, (p) => mergeRemote("notifications", p))
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` }, (p) => mergeRemote("tasks", p))
    .subscribe();

  function mergeRemote(coll: "notifications" | "tasks", p: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) {
    const s = store.getState();
    const list = s[coll] as unknown as { id: string }[];
    if (p.eventType === "DELETE") {
      const id = p.old.id as string;
      if (list.some((x) => x.id === id)) store.getState().hydrate({ [coll]: list.filter((x) => x.id !== id) } as Partial<OfficeData>);
      return;
    }
    const rec = fromRow<{ id: string }>(p.new);
    const existing = list.find((x) => x.id === rec.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(rec)) return;
    const next = existing ? list.map((x) => (x.id === rec.id ? rec : x)) : [rec, ...list];
    store.getState().hydrate({ [coll]: next } as Partial<OfficeData>);
    prevSnap = store.getState(); // remote change: don't echo back
  }

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    sb.removeChannel(channel);
  };
}
