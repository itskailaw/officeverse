import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/ai/server/guard";
import { listIntegrations } from "./store";
import { STATUS } from "./summary";
import { buildLabels, labelErrText, type Plat } from "./labels";
import { mergePdfs, sortByOrderId } from "./fulfil";
import { packNames, type StockItem } from "@/lib/data/stock";
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
export async function sendPackingEmail(
  ws: string,
  opts: {
    manual?: boolean;
    to?: string;
    /** orders Farid just confirmed (our copy may still say "to process" until the next sync) */
    include?: { platform: Plat; id: string }[];
    /** instant mode: no log row and no email when there's nothing new; stay quiet if labels aren't ready yet */
    instant?: boolean;
    /** instant mode: may an email go out just for parcels still not shipped (e.g. the first check of the working day)? */
    allowCarryOnly?: boolean;
  } = {},
): Promise<PackingResult> {
  const sb = getAdminSupabase();
  const settings = await packingSettings(ws);
  const to = (opts.to ?? settings?.to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, "Add the email address to send the packing list to.");

  // orders already emailed in the last 3 weeks
  const { data: prev, error: prevErr } = await sb
    .from("packing_emails")
    .select("orders, status, sent_at")
    .eq("workspace_id", ws)
    .gte("sent_at", new Date(Date.now() - 21 * 86400000).toISOString());
  if (prevErr) throw new Error(/relation|does not exist/i.test(prevErr.message) ? "Run the 0006_packing_email.sql migration in Supabase first." : prevErr.message);
  // when each order was first / last emailed
  const emailed = new Map<string, { first: number; last: number }>();
  for (const r of prev ?? []) {
    if (r.status !== "sent") continue;
    const t = Date.parse(r.sent_at as string);
    for (const o of (r.orders as { platform: string; id: string }[]) ?? []) {
      const k = `${o.platform}:${o.id}`;
      const e = emailed.get(k);
      emailed.set(k, { first: Math.min(e?.first ?? t, t), last: Math.max(e?.last ?? t, t) });
    }
  }
  const done = new Set(emailed.keys());
  // another run is sending right now (push and the 10-minute check can overlap)
  if (opts.instant && (prev ?? []).some((r) => r.status === "sending" && Date.now() - Date.parse(r.sent_at as string) < 3 * 60_000)) return { status: "empty", count: 0, problems: [] };

  const conns = await listIntegrations(ws);
  const plats = (["shopee", "lazada"] as Plat[]).filter((p) => conns.some((r) => r.provider === p && r.status !== "expired" && r.status !== "disconnected"));
  const { data: rows, error } = await sb
    .from("marketplace_orders")
    .select("platform, external_order_id, status, ordered_at, pay_time, ship_by, items")
    .eq("workspace_id", ws)
    .in("platform", plats.length ? plats : ["none"])
    .in("status", plats.flatMap((p) => [...STATUS[p].awaitingPickup, ...STATUS[p].toProcess]))
    .limit(400);
  if (error) throw new Error(error.message);
  const include = new Set((opts.include ?? []).map((o) => `${o.platform}:${o.id}`));
  // Shopee's own order: paid time, oldest first
  const todo = (rows ?? [])
    .filter((o) => {
      const k = `${o.platform}:${o.external_order_id}`;
      return !done.has(k) && (STATUS[o.platform as Plat].awaitingPickup.has(o.status as string) || include.has(k));
    })
    .sort((a, b) => Date.parse((a.pay_time ?? a.ordered_at) as string) - Date.parse((b.pay_time ?? b.ordered_at) as string));
  // parcels emailed before but still waiting for pickup: re-sent (same label) at most once a day, most urgent first
  const DAY_MS = 20 * 3600_000;
  const carry = (rows ?? [])
    .filter((o) => {
      const e = emailed.get(`${o.platform}:${o.external_order_id}`);
      return e && STATUS[o.platform as Plat].awaitingPickup.has(o.status as string) && Date.now() - e.last > DAY_MS;
    })
    .sort((a, b) => Date.parse((a.ship_by ?? a.ordered_at) as string) - Date.parse((b.ship_by ?? b.ordered_at) as string));
  if (opts.instant && !todo.length && (!carry.length || !opts.allowCarryOnly)) return { status: "empty", count: 0, problems: [] };

  const { data: log, error: logErr } = await sb
    .from("packing_emails")
    .insert({ workspace_id: ws, status: "sending", recipient: to, manual: !!opts.manual })
    .select("id")
    .single();
  if (logErr) throw new Error(logErr.message);
  const finish = (patch: Record<string, unknown>) => sb.from("packing_emails").update(patch).eq("id", log.id);

  try {
    if (!todo.length && !carry.length) {
      await finish({ status: "empty" });
      return { status: "empty", count: 0, problems: [] };
    }
    const all = [...carry, ...todo];
    const itemsOf = new Map(all.map((o) => [`${o.platform}:${o.external_order_id}`, ((o.items as PackLine["items"] | null) ?? []).map((i) => ({ name: i.name, model: i.model ?? null, sku: i.sku ?? null, qty: Number(i.qty) || 1 }))]));
    const overdueOf = new Map(
      carry.map((o) => [`${o.platform}:${o.external_order_id}`, { since: new Date(emailed.get(`${o.platform}:${o.external_order_id}`)!.first).toISOString(), shipBy: (o.ship_by as string | null) ?? null }]),
    );
    const paper = settings?.paper ?? "thermal";
    // pack names the CEO set in Stock
    const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
    const names = packNames(((lay?.settings as { stock?: StockItem[] } | null)?.stock ?? []) as StockItem[]);
    const ref = (list: typeof all) => list.map((o) => ({ platform: o.platform as Plat, id: o.external_order_id as string }));
    // two batches so the PDF has every not-yet-shipped parcel first, then the new ones
    const parts = [] as Awaited<ReturnType<typeof buildLabels>>[];
    const problemsCarry: string[] = [];
    if (carry.length) {
      try {
        parts.push(await buildLabels(ws, ref(carry), paper));
      } catch (e) {
        problemsCarry.push(`Not-shipped-yet parcels: ${labelErrText(e)}`);
      }
    }
    if (todo.length) parts.push(await buildLabels(ws, ref(todo), paper));
    const pdfs = parts.map((b) => b.pdf).filter((x): x is ArrayBuffer => !!x);
    const merged = await sortByOrderId(pdfs.length > 1 ? await mergePdfs(pdfs) : (pdfs[0] ?? null), parts.flatMap((b) => b.sequence));
    const bundle = {
      pdf: merged.pdf,
      sequence: merged.sequence,
      html: parts.find((b) => b.html)?.html ?? null,
      problems: [...problemsCarry, ...parts.flatMap((b) => b.problems)],
    };
    const lines: PackLine[] = [...bundle.sequence, ...(bundle.html?.sequence ?? [])].map((x) => ({
      ...x,
      items: itemsOf.get(`${x.platform}:${x.id}`) ?? [],
      overdue: overdueOf.get(`${x.platform}:${x.id}`),
    }));
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
      html: packingHtml(lines, { from: "Farid, Order Processing", problems: bundle.problems, separate: bundle.html?.platform ?? null, appUrl: appUrl(), names }),
      text: packingText(lines, names),
      attachments,
    });
    await finish({ status: "sent", orders: lines.map((l) => ({ platform: l.platform, id: l.id })), error: bundle.problems.length ? bundle.problems.join(" · ").slice(0, 1000) : null });
    return { status: "sent", count: lines.length, problems: bundle.problems };
  } catch (e) {
    const msg = labelErrText(e);
    await finish({ status: "failed", error: msg.slice(0, 1000) });
    // instant mode: labels not ready yet (tracking number still coming) — the next check tries again quietly
    const notReady = /tracking number|not packed yet|still preparing|arrange the shipment first/i.test(msg);
    const failedRecently = (prev ?? []).some((r) => r.status === "failed" && Date.now() - Date.parse(r.sent_at as string) < 60 * 60_000);
    if (opts.instant && (notReady || failedRecently)) throw e;
    // tell the owner on Telegram when an automatic email fails
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
