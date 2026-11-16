"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase now calls this the "publishable" key; the older "anon" name also works.
const anon = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

/** Browser Supabase client (anon key + user session; RLS enforces access). */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) client = createBrowserClient(url!, anon!);
  return client;
}
