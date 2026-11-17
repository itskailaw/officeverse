import "server-only";
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function aiConfigured() {
  return Boolean(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Only signed-in users may spend AI credit. Without Supabase (local mode) the
 * AI routes work in development only, so a public deployment can't be abused.
 */
export async function requireUser(): Promise<string> {
  const sb = await getServerSupabase();
  if (!sb) {
    if (process.env.NODE_ENV === "development" || process.env.AI_ALLOW_LOCAL === "true") return "local";
    throw new HttpError(403, "Sign-in is required to use AI employees. Connect Supabase first.");
  }
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  return data.user.id;
}

// Best-effort per-user rate limit (per server instance). Keeps a runaway
// client from burning through credit; the provider's own limits still apply.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 40;
const hits = new Map<string, number[]>();

export function rateLimit(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= LIMIT) throw new HttpError(429, "Too many AI requests in a short time. Please wait a few minutes.");
  list.push(now);
  hits.set(userId, list);
}

export function str(v: unknown, field: string, max: number, required = true): string {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `Missing ${field}.`);
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, `Invalid ${field}.`);
  if (v.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return v;
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[ai]", e);
  return NextResponse.json({ error: "The AI engine hit an unexpected error. Please try again." }, { status: 500 });
}
