import "server-only";

export interface EmailAttachment {
  filename: string;
  content: ArrayBuffer | Uint8Array;
  contentType?: string;
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

/**
 * Send one email through Resend (https://resend.com). Without a verified domain Resend only delivers
 * to the address the Resend account was created with — fine for emails to the owner.
 */
export async function sendEmail(msg: { to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[]; fromName?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Email isn't set up yet — add RESEND_API_KEY in Vercel (Settings → Environment Variables), then redeploy.");
  const fromAddr = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const from = /</.test(fromAddr) ? fromAddr : `${msg.fromName ?? "OfficeVerse"} <${fromAddr}>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content instanceof Uint8Array ? a.content : new Uint8Array(a.content)).toString("base64"),
        content_type: a.contentType,
      })),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok) throw new Error(`Email not sent — Resend: ${body.message ?? body.name ?? `HTTP ${res.status}`}`);
  return body.id ?? null;
}
