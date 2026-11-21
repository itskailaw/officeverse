import "server-only";
import webpush from "web-push";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "./crypto";

/**
 * The push signing keys (VAPID). Taken from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set; otherwise generated
 * once by the server and kept encrypted in the database — no setup needed.
 */
let cached: { publicKey: string; privateKey: string } | null = null;
export async function vapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const sb = getAdminSupabase();
  const read = async () => {
    const { data, error } = await sb.from("app_secrets").select("value_enc").eq("name", "vapid").maybeSingle();
    if (error) throw new Error(/relation|does not exist/i.test(error.message) ? "Run the 0007_push.sql migration in Supabase first." : error.message);
    return data ? (JSON.parse(decrypt(data.value_enc as string)) as { publicKey: string; privateKey: string }) : null;
  };
  let keys = await read();
  if (!keys) {
    const k = webpush.generateVAPIDKeys();
    // insert-if-absent, then read back (two servers starting together end up with the same keys)
    await sb.from("app_secrets").upsert({ name: "vapid", value_enc: encrypt(JSON.stringify(k)) }, { onConflict: "name", ignoreDuplicates: true });
    keys = await read();
  }
  return (cached = keys!);
}

export interface PushMessage {
  title: string;
  body: string;
  /** where tapping the notification goes, e.g. "/office?open=fulfil" */
  url?: string;
  /** same tag replaces the previous notification instead of stacking */
  tag?: string;
}

/** Send to every device that turned on notifications for this workspace. Never throws. */
export async function sendPush(ws: string, msg: PushMessage) {
  try {
    const sb = getAdminSupabase();
    const { data: subs, error } = await sb.from("push_subscriptions").select("endpoint, keys").eq("workspace_id", ws);
    if (error || !subs?.length) return 0;
    const k = await vapidKeys();
    webpush.setVapidDetails("mailto:notifications@officeverse.app", k.publicKey, k.privateKey);
    const payload = JSON.stringify({ ...msg, body: msg.body.slice(0, 300) });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint as string, keys: s.keys as { p256dh: string; auth: string } }, payload, { TTL: 6 * 3600, urgency: "high" });
          sent++;
          await sb.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // the device unsubscribed or the browser dropped it
          if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          else console.error("[push]", code, e instanceof Error ? e.message : e);
        }
      }),
    );
    return sent;
  } catch (e) {
    console.error("[push] failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Plain text from a Telegram-style HTML message (for the notification body). */
export const pushText = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
