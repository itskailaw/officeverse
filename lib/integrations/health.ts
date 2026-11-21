import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai/server/guard";
import { emailConfigured } from "./email";
import { listIntegrations, updateIntegration } from "./store";
import { escapeHtml, sendTelegram, telegramToken } from "./telegram";
import { pushText, sendPush } from "./webpush";
import { ago, schedulerCheck, storeChecks, transitions, type Check } from "./health-rules";

const klDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);

/** Everything OfficeVerse depends on, checked from saved state (no marketplace calls — cheap enough to run every 10 min). */
export async function systemHealth(ws: string): Promise<Check[]> {
  const sb = getAdminSupabase();
  const now = Date.now();
  const rows = await listIntegrations(ws);
  const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  const settings = (lay?.settings ?? {}) as { autoArrange?: { enabled?: boolean }; packingEmail?: { enabled?: boolean; to?: string } };
  const checks: Check[] = [];

  const stores = rows.filter((r) => r.provider === "shopee" || r.provider === "lazada");
  let lastScheduled: string | null = null;
  for (const r of stores) {
    const s = (r.last_sync_summary ?? {}) as { lastPushAt?: string; lastScheduledAt?: string; autoRun?: { at: string; source: string; state: string } };
    if (s.lastScheduledAt && (!lastScheduled || s.lastScheduledAt > lastScheduled)) lastScheduled = s.lastScheduledAt;
    checks.push(
      ...storeChecks({
        platform: r.provider as "shopee" | "lazada",
        status: r.status,
        lastSync: r.last_success_at,
        lastError: r.last_error,
        refreshExpires: r.expires_at,
        lastPush: s.lastPushAt ?? null,
        autoRun: s.autoRun ?? null,
        lastScheduledRun: null,
      }, now),
    );
  }
  if (!stores.length) checks.push({ key: "stores", area: "Marketplaces", label: "Marketplaces", level: "off", detail: "No Shopee or Lazada shop connected.", fix: "Settings → Integrations" });

  // automation
  if (stores.length) {
    // the 10-minute check also stamps autoRun; find the latest scheduled stamp across stores
    checks.push(schedulerCheck(lastScheduled, now));
    const runs = stores.map((r) => (r.last_sync_summary as { autoRun?: { at: string; state: string } } | null)?.autoRun).filter(Boolean) as { at: string; state: string }[];
    const last = runs.sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    checks.push({
      key: "farid",
      area: "Automation",
      label: "Farid — automatic confirmation",
      level: !settings.autoArrange?.enabled ? "off" : last && (now - Date.parse(last.at)) / 60000 < 30 ? "ok" : "warn",
      detail: !settings.autoArrange?.enabled ? "Switched off." : last ? `Last check ${ago((now - Date.parse(last.at)) / 60000)} (${last.state === "outside_hours" ? "outside working hours" : "on duty"}).` : "Hasn't checked yet.",
      fix: settings.autoArrange?.enabled ? undefined : "Dashboard → To process → Farid's switch",
    });
  }
  // packing email
  const pe = settings.packingEmail;
  type EmailRow = { status: string; sent_at: string; error: string | null };
  let lastEmail: EmailRow | null = null;
  let migrated = true;
  {
    const { data, error } = await sb.from("packing_emails").select("status, sent_at, error").eq("workspace_id", ws).order("sent_at", { ascending: false }).limit(1);
    if (error) migrated = false;
    lastEmail = (data?.[0] as EmailRow | undefined) ?? null;
  }
  checks.push({
    key: "email",
    area: "Automation",
    label: "Packing & airway-bill email",
    level: !pe?.enabled ? "off" : !emailConfigured() || !migrated ? "bad" : lastEmail?.status === "failed" ? "warn" : "ok",
    detail: !pe?.enabled
      ? "Switched off."
      : !emailConfigured()
        ? "Email service key (RESEND_API_KEY) is missing."
        : !migrated
          ? "Database table for the email log is missing."
          : lastEmail
            ? `Last: ${lastEmail.status}${lastEmail.status === "failed" && lastEmail.error ? ` — ${lastEmail.error.slice(0, 100)}` : ""}, ${ago((now - Date.parse(lastEmail.sent_at)) / 60000)}.`
            : "No email sent yet.",
    fix: !pe?.enabled ? undefined : !emailConfigured() ? "Vercel → Environment Variables → RESEND_API_KEY, then Redeploy" : !migrated ? "Supabase → SQL Editor → run 0006_packing_email.sql" : undefined,
  });

  // messaging
  const tg = rows.find((r) => r.provider === "telegram");
  const briefedToday = tg?.last_success_at && klDate(new Date(tg.last_success_at)) === klDate(new Date());
  const klHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  checks.push({
    key: "telegram",
    area: "Messaging",
    label: "Telegram",
    level: !telegramToken() ? "off" : tg?.status !== "connected" ? (tg ? "bad" : "off") : "ok",
    detail: !telegramToken() ? "Bot token not set." : tg?.status === "connected" ? `Linked${tg.last_error ? ` — last error: ${tg.last_error.slice(0, 80)}` : ""}.` : tg ? "Unlinked or blocked." : "Not linked.",
    fix: tg?.status === "connected" ? undefined : "Settings → Integrations → Telegram",
  });
  if (tg?.status === "connected")
    checks.push({
      key: "briefing",
      area: "Messaging",
      label: "Morning briefing",
      level: briefedToday ? "ok" : klHour >= 10 ? "bad" : "ok",
      detail: briefedToday ? "Sent today." : klHour >= 10 ? "Today's briefing hasn't gone out." : "Due around 8:30.",
      fix: briefedToday || klHour < 10 ? undefined : "Send /briefing to the bot; check GitHub Actions → Daily jobs",
    });

  // setup
  checks.push({ key: "ai", area: "Setup", label: "AI engine", level: aiConfigured() ? "ok" : "bad", detail: aiConfigured() ? "Key configured." : "AI key is missing — staff can't reply.", fix: aiConfigured() ? undefined : "Vercel → AI_API_KEY" });
  checks.push({ key: "cron", area: "Setup", label: "Scheduled jobs secret", level: process.env.CRON_SECRET ? "ok" : "bad", detail: process.env.CRON_SECRET ? "Set." : "CRON_SECRET is missing — scheduled jobs are refused.", fix: process.env.CRON_SECRET ? undefined : "Vercel → CRON_SECRET (same value as the GitHub secret), then Redeploy" });
  return checks;
}

/** Ethan (IT) tells the CEO on Telegram when something breaks — and when it's fixed. Once per change. */
export async function healthWatch(ws: string) {
  const checks = await systemHealth(ws);
  const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
  if (!tg?.shop_id) return checks;
  const prev = ((tg.last_sync_summary as { health?: Record<string, Check["level"]> } | null)?.health ?? {}) as Record<string, Check["level"]>;
  const { broke, fixed, next } = transitions(prev, checks);
  if (broke.length || fixed.length) {
    const { data: emp } = await getAdminSupabase().from("employees").select("name").eq("workspace_id", ws).eq("id", "emp-it").maybeSingle();
    const who = ((emp?.name as string | undefined) ?? "IT").split(" ")[0];
    const lines = [
      ...broke.map((c) => `🔴 <b>${escapeHtml(c.label)}</b>: ${escapeHtml(c.detail)}${c.fix ? `\n   ↳ ${escapeHtml(c.fix)}` : ""}`),
      ...fixed.map((c) => `🟢 <b>${escapeHtml(c.label)}</b> is working again.`),
    ];
    await sendTelegram(tg.shop_id, `🛠 <b>${escapeHtml(who)} (IT):</b>\n${lines.join("\n")}`).catch(() => {});
    if (broke.length) await sendPush(ws, { title: `🛠 ${who}: ${broke.length} system problem${broke.length > 1 ? "s" : ""}`, body: pushText(lines.join("\n")), url: "/office", tag: "health" });
  }
  await updateIntegration(tg.id, { last_sync_summary: { ...(tg.last_sync_summary ?? {}), health: next } });
  return checks;
}
