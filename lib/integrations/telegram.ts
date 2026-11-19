import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram Bot API (https://core.telegram.org/bots/api). The CEO creates their own bot
// with @BotFather and puts its token in TELEGRAM_BOT_TOKEN. Linking works with a signed,
// short-lived /start code, so no pending state needs to be stored.

export function telegramToken() {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return t && /^\d+:[\w-]{20,}$/.test(t) ? t : null;
}

const API = () => process.env.TELEGRAM_API_BASE || "https://api.telegram.org";

export async function tg<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = telegramToken();
  if (!token) throw new Error("Telegram isn't configured. Add TELEGRAM_BOT_TOKEN in Vercel and redeploy.");
  const res = await fetch(`${API()}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? `request failed (${res.status})`}`);
  return j.result as T;
}

/** Secret Telegram echoes back in X-Telegram-Bot-Api-Secret-Token on every webhook call. */
export function webhookSecret() {
  const token = telegramToken();
  return token ? createHmac("sha256", token).update("officeverse-webhook").digest("hex").slice(0, 48) : null;
}

const sig = (token: string, data: string) => createHmac("sha256", token).update(`link:${data}`).digest("hex").slice(0, 16);

/** /start payload: workspace id (32 hex) + issue time (8 base36) + signature (16 hex) = 56 chars. */
export function linkCode(workspaceId: string, now = Date.now()) {
  const token = telegramToken()!;
  const data = workspaceId.replace(/-/g, "").toLowerCase() + Math.floor(now / 1000).toString(36).padStart(8, "0");
  return data + sig(token, data);
}

export function verifyLinkCode(code: string, now = Date.now()): string | null {
  const token = telegramToken();
  if (!token || !/^[0-9a-f]{32}[0-9a-z]{8}[0-9a-f]{16}$/.test(code)) return null;
  const data = code.slice(0, 40);
  const a = Buffer.from(sig(token, data));
  const b = Buffer.from(code.slice(40));
  if (!timingSafeEqual(a, b)) return null;
  const issued = parseInt(code.slice(32, 40), 36) * 1000;
  if (now - issued > 30 * 60 * 1000 || issued - now > 60 * 1000) return null; // valid 30 minutes
  const h = code.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sendTelegram(chatId: string, html: string) {
  return tg<{ message_id: number }>("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
}
