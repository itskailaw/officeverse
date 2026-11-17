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
  approvals: "approvals",
  chatMessages: "chat_messages",
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
    if (error) {
      if (table === "approvals" || table === "chat_messages") {
        console.warn(`[sync] ${table}:`, error.message);
        continue;
      }
      throw new Error(`Couldn't load ${table}: ${error.message}`);
    }
    (loaded as Record<string, unknown>)[coll] = (data ?? []).map((r) => fromRow(r));
  }
  const { data: layout } = await sb.from("office_layouts").select("*").eq("workspace_id", workspaceId).maybeSingle();

  const fresh = !(loaded.companies && loaded.companies.length);
  if (fresh) {
    // first sign-in: push the current (seeded/local) office up
    const s = store.getState();
    for (const [coll, table] of Object.entries(COLLECTIONS) as [Coll, string][]) {
      const rows = (s[coll] as unknown as Record<string, unknown>[]).map((r) => toRow(r, workspaceId));
      if (!rows.length) continue;
      const { error } = await sb.from(table).upsert(rows, { onConflict: "workspace_id,id" });
      // core tables must save; newer optional tables just warn (see migration 0002)
      if (error && !["approvals", "chat_messages"].includes(table)) throw new Error(`Couldn't save ${table}: ${error.message}`);
      if (error) console.warn(`[sync] ${table}:`, error.message);
    }
    const { error: layoutError } = await sb.from("office_layouts").upsert({ workspace_id: workspaceId, furniture: s.furniture, settings: s.settings });
    if (layoutError) throw new Error(`Couldn't save the office layout: ${layoutError.message}`);
  } else {
    store.getState().hydrate({
      ...loaded,
      ...(layout ? { furniture: layout.furniture, settings: { ...store.getState().settings, ...layout.settings } } : {}),
    });
  }

  // ---- outgoing changes (debounced diff, tracked per collection)
  // `synced` remembers what each table last saved successfully; a failed table
  // keeps its old snapshot and is retried on the next change.
  const synced: Record<string, unknown> = {};
  const snap = store.getState();
  for (const coll of Object.keys(COLLECTIONS)) synced[coll] = snap[coll as Coll];
  synced.layout = [snap.furniture, snap.settings];
  const warned = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fail = (table: string, message: string) => {
    console.error(`[sync] ${table}:`, message);
    if (warned.has(table)) return;
    warned.add(table);
    const hint =
      table === "approvals" || table === "chat_messages"
        ? " Run the 0002 database update in Supabase (SQL Editor)."
        : " Changes are kept in this browser and will retry.";
    useUI.getState().toast("error", `Cloud save failed for ${table.replace("_", " ")}.${hint}`);
  };

  const flush = async () => {
    const cur = store.getState();
    for (const [coll, table] of Object.entries(COLLECTIONS) as [Coll, string][]) {
      const a = synced[coll] as { id: string }[];
      const b = cur[coll] as unknown as { id: string }[];
      if (a === b) continue;
      const before = new Map(a.map((x) => [x.id, x]));
      const changed = b.filter((x) => before.get(x.id) !== x);
      const ids = new Set(b.map((x) => x.id));
      const removed = a.filter((x) => !ids.has(x.id)).map((x) => x.id);
      let ok = true;
      if (changed.length) {
        const { error } = await sb.from(table).upsert(
          changed.map((r) => toRow(r as unknown as Record<string, unknown>, workspaceId)),
          { onConflict: "workspace_id,id" },
        );
        if (error) {
          ok = false;
          fail(table, error.message);
        }
      }
      if (ok && removed.length) {
        const { error } = await sb.from(table).delete().eq("workspace_id", workspaceId).in("id", removed);
        if (error) {
          ok = false;
          fail(table, error.message);
        }
      }
      if (ok) {
        synced[coll] = b;
        warned.delete(table);
      }
    }
    const [f, st] = synced.layout as [unknown, unknown];
    if (f !== cur.furniture || st !== cur.settings) {
      const { error } = await sb
        .from("office_layouts")
        .upsert({ workspace_id: workspaceId, furniture: cur.furniture, settings: cur.settings, updated_at: new Date().toISOString() });
      if (error) fail("office layout", error.message);
      else synced.layout = [cur.furniture, cur.settings];
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
    // remote change: mark as already synced so it isn't echoed back
    synced[coll] = store.getState()[coll];
  }

  return () => {
    unsub();
    if (timer) clearTimeout(timer);
    sb.removeChannel(channel);
  };
}
