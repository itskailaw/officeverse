import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { listIntegrations, updateIntegration } from "./store";
import { STATUS } from "./summary";
import { shipLazada, shipShopee } from "./fulfil";
import { requireShopeeConfig, shopPost } from "./shopee/api";
import { validToken as shopeeToken } from "./shopee/sync";
import { escapeHtml, sendTelegram } from "./telegram";
import { sendApprovalCards } from "./telegram-office";
import { inHours } from "./order-rules";

export const ORDER_EXEC = "emp-orders";
const NAME = { shopee: "Shopee", lazada: "Lazada" } as const;
type Plat = keyof typeof NAME;

async function notify(ws: string, priority: "critical" | "important" | "info", title: string, body: string) {
  await getAdminSupabase()
    .from("notifications")
    .insert({ workspace_id: ws, id: `n-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, priority, title, body, employee_id: ORDER_EXEC, company_id: "co-wgs", demo: false, read: false });
}

/**
 * Runs after every sync (instant push, manual sync, nightly cron):
 *  1. if the owner switched it on (and within the chosen hours), arrange drop-off for new paid orders;
 *  2. turn buyer cancellation requests into approvals (Shopee: accept / reject from OfficeVerse or Telegram;
 *     Lazada: alert only — Lazada has no API to answer them).
 */
export async function runOrderAutomation(ws: string, source: "push" | "schedule" | "manual" | "sync" = "sync") {
  const sb = getAdminSupabase();
  const rows = await listIntegrations(ws);
  const tg = rows.find((r) => r.provider === "telegram" && r.status === "connected");
  const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  const auto = (lay?.settings as { autoArrange?: { enabled?: boolean; start?: string; end?: string } } | null)?.autoArrange;
  const out = { arranged: 0, failed: 0, cancellations: 0, emailed: 0 };
  // what Farid saw on this run, per platform — shown in the Fulfilment window so the CEO can tell he's working
  const seen: Partial<Record<Plat, { waiting: number; tried: number; arranged: number; failed: number }>> = {};
  const confirmed: { platform: Plat; id: string }[] = [];
  const state = !auto?.enabled ? "off" : inHours(new Date(), auto.start ?? "00:00", auto.end ?? "23:59") ? "on" : "outside_hours";

  // ── 1. auto-arrange new paid orders ──
  if (state === "on") {
    for (const p of ["shopee", "lazada"] as Plat[]) {
      if (!rows.some((r) => r.provider === p && r.status !== "expired")) continue;
      const { data } = await sb
        .from("marketplace_orders")
        .select("external_order_id, raw")
        .eq("workspace_id", ws)
        .eq("platform", p)
        .in("status", [...STATUS[p].toProcess])
        .order("ordered_at", { ascending: true })
        .limit(40);
      // each order is tried once automatically; failures are left for the CEO.
      // The "tried" list lives on the store connection (order rows are rewritten on every sync).
      const conn = rows.find((r) => r.provider === p)!;
      const tried = new Set(((conn.last_sync_summary as { autoTried?: string[] } | null)?.autoTried ?? []) as string[]);
      const todo = (data ?? []).filter((o) => !tried.has(o.external_order_id as string)).slice(0, 20);
      seen[p] = { waiting: (data ?? []).length, tried: todo.length, arranged: 0, failed: 0 };
      if (!todo.length) continue;
      const ids = todo.map((o) => o.external_order_id as string);
      const nextTried = [...tried, ...ids].slice(-500);
      conn.last_sync_summary = { ...(conn.last_sync_summary ?? {}), autoTried: nextTried };
      await updateIntegration(conn.id, { last_sync_summary: conn.last_sync_summary });
      const res = p === "shopee" ? await shipShopee(ws, ids) : await shipLazada(ws, ids);
      const ok = res.filter((r) => r.ok);
      const bad = res.filter((r) => !r.ok);
      out.arranged += ok.length;
      out.failed += bad.length;
      seen[p] = { ...seen[p]!, arranged: ok.length, failed: bad.length };
      confirmed.push(...ok.map((r) => ({ platform: p, id: r.orderId })));
      if (ok.length || bad.length) {
        const lines = [
          ok.length ? `📦 <b>Farid confirmed ${ok.length} new ${NAME[p]} order${ok.length > 1 ? "s" : ""}</b> (drop-off arranged)` : "",
          ...bad.slice(0, 5).map((b) => `⚠️ ${NAME[p]} #${escapeHtml(b.orderId)}: ${escapeHtml(b.message)} — please arrange it yourself`),
        ].filter(Boolean);
        const pe0 = (lay?.settings as { packingEmail?: { enabled?: boolean; mode?: string } } | null)?.packingEmail;
        const next = pe0?.enabled && pe0.mode === "instant" ? "\nI'll email you the airway bills + packing list in a minute." : "\nPrint the airway bills: Dashboard → To ship → Print labels.";
        if (tg?.shop_id) await sendTelegram(tg.shop_id, lines.join("\n") + (ok.length ? next : "")).catch(() => {});
        await notify(ws, bad.length ? "important" : "info", `${NAME[p]}: ${ok.length} order${ok.length === 1 ? "" : "s"} confirmed${bad.length ? `, ${bad.length} need you` : ""}`, lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n"));
      }
    }
  }

  // ── 1b. instant packing email: airway bills + packing list right after confirming ──
  const pe = (lay?.settings as { packingEmail?: { enabled?: boolean; mode?: string; to?: string } } | null)?.packingEmail;
  if (pe?.enabled && pe.mode === "instant" && pe.to) {
    try {
      // give the marketplace a moment to issue tracking numbers for what was just confirmed
      if (confirmed.length) await new Promise((r) => setTimeout(r, 15_000));
      const { sendPackingEmail } = await import("./packing-email");
      const r = await sendPackingEmail(ws, { include: confirmed, instant: true, allowCarryOnly: state === "on" });
      if (r.status === "sent") {
        out.emailed = r.count;
        if (tg?.shop_id) await sendTelegram(tg.shop_id, `📧 <b>Farid:</b> airway bills + packing list for ${r.count} parcel${r.count === 1 ? "" : "s"} sent to your email.`).catch(() => {});
      }
    } catch (e) {
      console.error("[orders] instant packing email:", e instanceof Error ? e.message : e);
    }
  }

  // record the run on each store connection
  for (const conn of rows.filter((r) => r.provider === "shopee" || r.provider === "lazada")) {
    const { data: cur } = await sb.from("integrations").select("last_sync_summary").eq("id", conn.id).maybeSingle();
    const sum = (cur?.last_sync_summary ?? conn.last_sync_summary ?? {}) as Record<string, unknown>;
    await updateIntegration(conn.id, { last_sync_summary: { ...sum, autoRun: { at: new Date().toISOString(), source, state, ...(seen[conn.provider as Plat] ?? {}) }, ...(source === "schedule" ? { lastScheduledAt: new Date().toISOString() } : {}) } });
  }

  // ── 2a. Shopee: buyer cancellation requests → approvals with accept / reject ──
  const { data: inCancel } = await sb
    .from("marketplace_orders")
    .select("external_order_id, gross_amount, items, raw, pay_time, ordered_at")
    .eq("workspace_id", ws)
    .eq("platform", "shopee")
    .eq("status", "IN_CANCEL")
    .limit(50);
  if (inCancel?.length) {
    const want = inCancel.map((o) => {
      const items = ((o.items as { name: string; qty: number; model?: string | null }[] | null) ?? []).map((i) => `${i.qty}× ${i.name}${i.model ? ` (${i.model})` : ""}`);
      const reason = (o.raw as { cancel_reason?: string } | null)?.cancel_reason;
      return {
        workspace_id: ws,
        id: `cancel-shopee-${o.external_order_id}`,
        task_id: null,
        employee_id: ORDER_EXEC,
        kind: "other",
        summary: `Buyer wants to cancel Shopee order #${o.external_order_id} (RM ${Number(o.gross_amount).toFixed(2)}) — accept or reject?`,
        draft:
          `Order #${o.external_order_id} — RM ${Number(o.gross_amount).toFixed(2)}\n${items.join("\n")}\n` +
          (reason ? `Buyer's reason: ${reason}\n` : "") +
          `\nApprove = ACCEPT the cancellation (order is cancelled and the buyer refunded).\nReject = keep the order and ship it.\nShopee auto-decides if nobody responds in time, so please answer soon.`,
        status: "pending",
      };
    });
    const { data: created } = await sb.from("approvals").upsert(want, { onConflict: "workspace_id,id", ignoreDuplicates: true }).select("id, kind, summary, draft, employee_id");
    const fresh = (created ?? []) as { id: string; kind: string; summary: string; draft: string; employee_id: string }[];
    out.cancellations += fresh.length;
    if (fresh.length) {
      if (tg?.shop_id) await sendApprovalCards(tg.shop_id, ws, fresh).catch(() => {});
      await notify(ws, "critical", `${fresh.length} cancellation request${fresh.length > 1 ? "s" : ""} need your decision`, fresh.map((a) => a.summary).join("\n"));
    }
  }

  // ── 2b. Lazada: cancellation requests (reverse orders of type CANCEL) → alert once ──
  try {
    const { data: lzCancel } = await sb
      .from("marketplace_returns")
      .select("external_id, order_id, status, request_type, reason, refund_amount")
      .eq("workspace_id", ws)
      .eq("platform", "lazada")
      .ilike("request_type", "%cancel%")
      .gte("requested_at", new Date(Date.now() - 7 * 86400 * 1000).toISOString())
      .limit(50);
    const seen = new Set(((tg?.last_sync_summary as { lzCancelAlerted?: string[] } | null)?.lzCancelAlerted ?? []) as string[]);
    const open = (lzCancel ?? []).filter((r) => !/CANCEL(L)?ED|CLOSED|COMPLETE|SUCCESS|REJECT|REFUND/i.test(String(r.status)) && !seen.has(String(r.external_id)));
    if (open.length && tg) {
      const msg =
        `🛑 <b>${open.length} Lazada cancellation request${open.length > 1 ? "s" : ""}</b>\n` +
        open.slice(0, 5).map((r) => `• Order #${escapeHtml(String(r.order_id ?? r.external_id))}${r.reason ? ` — ${escapeHtml(String(r.reason).slice(0, 80))}` : ""}`).join("\n") +
        `\nLazada doesn't let apps answer these — open Lazada Seller Center → Orders → Cancellation to accept or reject.`;
      if (tg.shop_id) await sendTelegram(tg.shop_id, msg).catch(() => {});
      await notify(ws, "critical", `${open.length} Lazada cancellation request${open.length > 1 ? "s" : ""}`, msg.replace(/<[^>]+>/g, ""));
      await updateIntegration(tg.id, {
        last_sync_summary: { ...(tg.last_sync_summary ?? {}), lzCancelAlerted: [...seen, ...open.map((r) => String(r.external_id))].slice(-300) },
      });
      out.cancellations += open.length;
    }
  } catch {}
  return out;
}

/** Accept / reject a buyer's cancellation request (Shopee order.handle_buyer_cancellation). */
export async function handleCancellation(ws: string, approvalId: string, accept: boolean) {
  const m = /^cancel-shopee-([\w-]+)$/.exec(approvalId);
  if (!m) throw new Error("Not a Shopee cancellation request.");
  const sn = m[1];
  const cfg = requireShopeeConfig();
  const [row] = await listIntegrations(ws, "shopee");
  if (!row) throw new Error("Shopee isn't connected.");
  const token = await shopeeToken(cfg, row);
  await shopPost(cfg, "/api/v2/order/handle_buyer_cancellation", { order_sn: sn, operation: accept ? "ACCEPT" : "REJECT" }, token, Number(row.shop_id));
  const sb = getAdminSupabase();
  await sb
    .from("marketplace_orders")
    .update({ status: accept ? "CANCELLED" : "PROCESSED" })
    .eq("workspace_id", ws)
    .eq("platform", "shopee")
    .eq("external_order_id", sn);
  const { data } = await sb
    .from("approvals")
    .update({ status: accept ? "approved" : "rejected", decided_at: new Date().toISOString() })
    .eq("workspace_id", ws)
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id, summary");
  return { sn, summary: (data?.[0]?.summary as string) ?? `order #${sn}` };
}
