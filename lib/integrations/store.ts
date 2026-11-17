import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/ai/server/guard";
import { decrypt, encrypt } from "./crypto";

export type Role = "owner" | "admin" | "manager" | "viewer";

/** Signed-in user's workspace and role (checked against RLS-protected membership). */
export async function getMembership(): Promise<{ userId: string; workspaceId: string; role: Role }> {
  const sb = await getServerSupabase();
  if (!sb) throw new HttpError(400, "Integrations need accounts: connect Supabase first.");
  const { data: u, error } = await sb.auth.getUser();
  if (error || !u.user) throw new HttpError(401, "Please sign in again.");
  const { data, error: e2 } = await sb.from("workspace_members").select("workspace_id, role").eq("user_id", u.user.id).limit(1);
  if (e2) throw new HttpError(500, `Couldn't read your workspace: ${e2.message}`);
  if (!data?.length) throw new HttpError(403, "No workspace found for this account. Open the office once to create it.");
  return { userId: u.user.id, workspaceId: data[0].workspace_id as string, role: data[0].role as Role };
}

export function requireRole(m: { role: Role }, roles: Role[]) {
  if (!roles.includes(m.role)) throw new HttpError(403, "Only the workspace owner or an admin can manage integrations.");
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface IntegrationRow {
  id: string;
  workspace_id: string;
  company_id: string | null;
  provider: string;
  status: string;
  shop_id: string | null;
  shop_name: string | null;
  credentials_enc: string | null;
  token_expires_at: string | null;
  expires_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_sync_summary: Record<string, unknown> | null;
}

const COLUMNS = "id, workspace_id, company_id, provider, status, shop_id, shop_name, credentials_enc, token_expires_at, expires_at, last_success_at, last_error, last_sync_summary";

/** Postgres bytea comes back hex-encoded ("\\x..."); we store the base64 ciphertext as UTF-8 text inside it. */
function fromBytea(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.startsWith("\\x") ? Buffer.from(v.slice(2), "hex").toString("utf8") : v;
}
function toBytea(s: string) {
  return "\\x" + Buffer.from(s, "utf8").toString("hex");
}

export async function listIntegrations(workspaceId: string, provider?: string): Promise<IntegrationRow[]> {
  let q = getAdminSupabase().from("integrations").select(COLUMNS).eq("workspace_id", workspaceId);
  if (provider) q = q.eq("provider", provider);
  const { data, error } = await q;
  if (error) throw new HttpError(500, `Couldn't read integrations: ${error.message}. Did you run the 0003 database update?`);
  return (data ?? []).map((r) => ({ ...(r as IntegrationRow), credentials_enc: fromBytea((r as IntegrationRow).credentials_enc) }));
}

export function readTokens(row: IntegrationRow): Tokens {
  if (!row.credentials_enc) throw new HttpError(409, "This shop has no stored credentials. Please connect it again.");
  return JSON.parse(decrypt(row.credentials_enc)) as Tokens;
}

export async function saveIntegration(row: {
  workspace_id: string;
  provider: string;
  shop_id: string;
  company_id?: string | null;
  shop_name?: string | null;
  tokens?: Tokens;
  token_expires_at?: string;
  expires_at?: string | null;
  status?: string;
  last_error?: string | null;
}) {
  const { tokens, ...rest } = row;
  const payload: Record<string, unknown> = { ...rest };
  if (tokens) payload.credentials_enc = toBytea(encrypt(JSON.stringify(tokens)));
  const { error } = await getAdminSupabase().from("integrations").upsert(payload, { onConflict: "workspace_id,provider,shop_id" });
  if (error) throw new HttpError(500, `Couldn't save the connection: ${error.message}. Did you run the 0003 database update?`);
}

export async function updateIntegration(id: string, patch: Record<string, unknown>) {
  const { error } = await getAdminSupabase().from("integrations").update(patch).eq("id", id);
  if (error) console.error("[integrations] update failed", error.message);
}

export async function deleteIntegration(workspaceId: string, id: string) {
  const { error } = await getAdminSupabase().from("integrations").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

export { toBytea };
