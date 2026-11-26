import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/ai/server/guard";
import { getMembership, requireRole } from "@/lib/integrations/store";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "avatars";
const MAX = 50 * 1024 * 1024;

/** Creates the public "avatars" storage bucket the first time it's needed. */
async function ensureBucket() {
  const sb = getAdminSupabase();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (data) return sb;
  const { error } = await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: MAX });
  if (error && !/exist/i.test(error.message)) throw new HttpError(500, `Couldn't set up avatar storage: ${error.message}`);
  return sb;
}

/**
 * Anime (VRM) avatar upload. The file is too big to pass through here, so this hands back a one-time
 * signed upload slot and the browser uploads straight to storage. Body: { key, size }. Owner/admin only.
 */
export async function POST(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    const { key, size } = (await req.json()) as { key?: string; size?: number };
    if (!key || !/^[\w-]{1,64}$/.test(key)) throw new HttpError(400, "Unknown employee.");
    if (!size || size > MAX) throw new HttpError(400, "Avatar files must be under 50 MB.");
    const sb = await ensureBucket();
    const path = `${m.workspaceId}/${key}-${Date.now()}.vrm`;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError(500, `Couldn't prepare the upload: ${error?.message ?? "unknown error"}`);
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ path, token: data.token, url });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Deletes an uploaded avatar file (only this workspace's own files). Body: { url }. */
export async function DELETE(req: Request) {
  try {
    const m = await getMembership();
    requireRole(m, ["owner", "admin"]);
    const { url } = (await req.json()) as { url?: string };
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const i = url?.indexOf(marker) ?? -1;
    if (!url || i < 0) return NextResponse.json({ ok: true });
    const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
    if (!path.startsWith(`${m.workspaceId}/`)) throw new HttpError(403, "That file belongs to another workspace.");
    await getAdminSupabase().storage.from(BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
