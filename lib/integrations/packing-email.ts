import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/ai/server/guard";
import { listIntegrations } from "./store";
import { STATUS } from "./summary";
import { buildLabels, labelErrText, type Plat } from "./labels";
import { sendEmail } from "./email";
import { syncShopee } from "./shopee/sync";
import { syncLazada } from "./lazada/sync";
import { runOrderAutomation } from "./order-automation";
import { escapeHtml, sendTelegram } from "./telegram";
import { packingDue, packingHtml, packingSubject, packingText, klDate, type PackLine, type PackingSettings } from "./packing-format";

const appUrl = () => {
  const host = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return host ? `${host.replace(/\/$/, "")}/office` : undefined;
};

export async function packingSettings(ws: string): Promise<PackingSettings | null> {
  const { data } = await getAdminSupabase().from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  return ((data?.settings as { packingEmail?: PackingSettings } | null)?.packingEmail ?? null) as PackingSettings | null;
}

export interface PackingResult {
  status: "sent" | "empty";
  count: number;
  problems: string[];
}

/**
 * Farid's packing email: every arranged order (To ship) that hasn't been emailed before, as a numbered
 * packing list in the body plus ONE merged airway-bill PDF for Shopee + Lazada in the same order.
 */
export async function sendPackingEmail(ws: string, opts: { manual?: boolean; to?: string } = {}): Promise<PackingResult> {
  const sb = getAdminSupabase();
  const settings = await packingSettings(ws);
  const to = (opts.to ?? settings?.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, "Add the email address to send the packing list to.");

  const { data: log, error: logErr } = await sb
    .from("packing_emails")
    .insert({ workspace_id: ws, status: "sending", recipient: to, manual: !!opts.manual })
    .select("id")
    .single();
  if (logErr) throw new Error(/relation|does not exist/i.test(logErr.message) ? "Run the 0006_packing_email.sql migration in Supabase first." : logErr.message);
  const finish = (patch: Record<string, unknown>) => sb.from("packing_emails").update(patch).eq("id", log.id);

  try {
    // orders already emailed in the last 3 weeks
    const { data: prev } = await sb
      .from("packing_emails")
      .select("orders")
      .eq("workspace_id", ws)
      .eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - 21 * 86400000).toISOString());
    const done = new Set((prev ?? []).flatMap((r) => ((r.orders as { platform: string; id: string }[]) ?? []).map((o) => `${o.platform}:${o.id}`)));

    const conns = await listIntegrations(ws);
    const plats = (["shopee", "lazada"] as Plat[]).filter((p) => conns.some((r) => r.provider === p && r.status !== "expired" && r.status !== "disconnected"));
    const { data: rows, error } = await sb
      .from("marketplace_orders")
      .select("platform, external_order_id, status, ordered_at, pay_time, items")
      .eq("workspace_id", ws)
      .in("platform", plats.length ? plats : ["none"])
      .in("status", plats.flatMap((p) => [...STATUS[p].awaitingPickup]))
      .limit(300);
    if (error) throw new Error(error.message);
    // Shopee's own order: paid time, oldest first
    const todo = (rows ?? [])
      .filter((o) => STATUS[o.platform as Plat].awaitingPickup.has(o.status as string) && !done.has(`${o.platform}:${o.external_order_id}`))
      .sort((a, b) => Date.parse((a.pay_time ?? a.ordered_at) as string) - Date.parse((b.pay_time ?? b.ordered_at) as string));
    if (!todo.length) {
      await finish({ status: "empty" });
      return { status: "empty", count: 0, problems: [] };
    }

    const itemsOf = new Map(todo.map((o) => [`${o.platform}:${o.external_order_id}`, ((o.items as PackLine["items"] | null) ?? []).map((i) => ({ name: i.name, model: i.model ?? null, qty: Number(i.qty) || 1 }))]));
    const bundle = await buildLabels(ws, todo.map((o) => ({ platform: o.platform as Plat, id: o.external_order_id as string })), settings?.paper ?? "thermal");
    const lines: PackLine[] = [...bundle.sequence, ...(bundle.html?.sequence ?? [])].map((x) => ({ ...x, items: itemsOf.get(`${x.platform}:${x.id}`) ?? [] }));
    if (!lines.length) throw new Error(bundle.problems.join(" · ") || "No airway bills came back.");

    const day = klDate(new Date());
    const attachments = [
      ...(bundle.pdf ? [{ filename: `airway-bills-${day}.pdf`, content: bundle.pdf, contentType: "application/pdf" }] : []),
      ...(bundle.html ? [{ filename: `${bundle.html.platform}-labels-${day}.html`, content: bundle.html.doc, contentType: "text/html" }] : []),
    ];
    await sendEmail({
      to,
      fromName: "Farid · OfficeVerse",
      subject: packingSubject(lines),
      html: packingHtml(lines, { from: "Farid, Order Processing", problems: bundle.problems, separate: bundle.html?.platform ?? null, appUrl: appUrl() }),
      text: packingText(lines),
      attachments,
    });
    await finish({ status: "sent", orders: lines.map((l) => ({ platform: l.platform, id: l.id })), error: bundle.problems.length ? bundle.problems.join(" · ").slice(0, 1000) : null });
    return { status: "sent", count: lines.length, problems: bundle.problems };
  } catch (e) {
    const msg = labelErrText(e);
    await finish({ status: "failed", error: msg.slice(0, 1000) });
    // tell the owner on Telegram when the scheduled email fails
    if (!opts.manual) {
      const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
      if (tg?.shop_id) await sendTelegram(tg.shop_id, `📦 <b>Farid:</b> today's packing-list email didn't go out — ${escapeHtml(msg)}`).catch(() => {});
    }
    throw e;
  }
}

/** Called hourly: sends today's packing email once the chosen time has passed. */
export async function ensurePackingEmail(ws: string, now = new Date()) {
  const s = await packingSettings(ws);
  if (!s?.enabled) return null;
  const { data } = await getAdminSupabase()
    .from("packing_emails")
    .select("status, sent_at")
    .eq("workspace_id", ws)
    .eq("manual", false)
    .gte("sent_at", new Date(now.getTime() - 36 * 3600000).toISOString())
    .order("sent_at", { ascending: false });
  if (!packingDue(now, s, data ?? [])) return null;
  // fresh order statuses first (and let Farid arrange new paid orders if that's switched on) — max ~60 s
  const conns = await listIntegrations(ws);
  const syncs = conns
    .filter((r) => (r.provider === "shopee" || r.provider === "lazada") && r.status !== "expired")
    .filter((r) => !r.last_success_at || Date.now() - Date.parse(r.last_success_at) > 15 * 60_000)
    .map((r) => (r.provider === "shopee" ? syncShopee(r) : syncLazada(r)).catch(() => {}));
  await Promise.race([Promise.allSettled(syncs), new Promise((r) => setTimeout(r, 60_000))]);
  await Promise.race([runOrderAutomation(ws).catch(() => {}), new Promise((r) => setTimeout(r, 45_000))]);
  return sendPackingEmail(ws);
}

/** Last few emails, for the settings bar. */
export async function packingLog(ws: string) {
  const { data } = await getAdminSupabase()
    .from("packing_emails")
    .select("sent_at, status, orders, error, manual")
    .eq("workspace_id", ws)
    .order("sent_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((r) => ({ at: r.sent_at as string, status: r.status as string, count: ((r.orders as unknown[]) ?? []).length, error: (r.error as string | null) ?? null, manual: !!r.manual }));
}
