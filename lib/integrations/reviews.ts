import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { aiConfigured } from "@/lib/ai/server/guard";
import { reviewReplyDraft } from "@/lib/ai/server/engine";
import { requireShopeeConfig, shopGet, shopPost } from "./shopee/api";
import { validToken as shopeeToken } from "./shopee/sync";
import { listIntegrations } from "./store";
import { sendTelegram } from "./telegram";
import { sendApprovalCards } from "./telegram-office";
import { sendPush } from "./webpush";

interface ShopeeComment {
  comment_id: number;
  comment?: string;
  item_id?: number;
  rating_star?: number;
  create_time?: number;
  comment_reply?: { reply?: string; create_time?: number } | null;
}

/**
 * Mei Ling's review watch (Shopee): pull recent ratings, and for each new 1–3 star review draft a polite reply.
 * The reply is posted only when the CEO approves it (in OfficeVerse or on Telegram).
 */
export async function reviewWatch(ws: string) {
  const [row] = (await listIntegrations(ws, "shopee")).filter((r) => r.status === "connected");
  if (!row) return { fetched: 0, flagged: 0 };
  const sb = getAdminSupabase();
  const cfg = requireShopeeConfig();
  const token = await shopeeToken(cfg, row);
  const shopId = Number(row.shop_id);

  const comments: ShopeeComment[] = [];
  let cursor = "";
  for (let page = 0; page < 3; page++) {
    const r = await shopGet<{ response?: { item_comment_list?: ShopeeComment[]; more?: boolean; next_cursor?: string } }>(cfg, "/api/v2/product/get_comment", { cursor, page_size: 100 }, token, shopId);
    comments.push(...(r.response?.item_comment_list ?? []));
    if (!r.response?.more || !r.response.next_cursor) break;
    cursor = r.response.next_cursor;
  }
  if (!comments.length) return { fetched: 0, flagged: 0 };

  // product names from synced orders (Shopee item ids)
  const { data: orders } = await sb.from("marketplace_orders").select("items").eq("workspace_id", ws).eq("platform", "shopee").order("ordered_at", { ascending: false }).limit(1500);
  const nameOf = new Map<string, string>();
  for (const o of orders ?? []) for (const i of (o.items as { id?: number; name: string }[] | null) ?? []) if (i.id) nameOf.set(String(i.id), i.name);

  const { data: known } = await sb.from("marketplace_reviews").select("review_id, status").eq("workspace_id", ws).eq("platform", "shopee");
  const seen = new Map((known ?? []).map((k) => [k.review_id as string, k.status as string]));
  const rows = comments.map((c) => ({
    workspace_id: ws,
    platform: "shopee",
    review_id: String(c.comment_id),
    item_id: c.item_id ? String(c.item_id) : null,
    item_name: c.item_id ? (nameOf.get(String(c.item_id)) ?? null) : null,
    rating: Number(c.rating_star) || 0,
    comment: (c.comment ?? "").slice(0, 2000),
    created_at: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
    reply: c.comment_reply?.reply || null,
    replied_at: c.comment_reply?.create_time ? new Date(c.comment_reply.create_time * 1000).toISOString() : null,
  }));
  // first run: remember everything without alerting about old reviews
  const firstRun = !known?.length;
  const { error } = await sb.from("marketplace_reviews").upsert(
    rows.map((r) => ({ ...r, status: r.reply ? "replied" : (seen.get(r.review_id) as string | undefined) ?? (firstRun ? "ignored" : "new") })),
    { onConflict: "workspace_id,platform,review_id" },
  );
  if (error) throw new Error(/relation|does not exist/i.test(error.message) ? "Run the 0008_state_reviews.sql migration in Supabase first." : error.message);

  const fresh = rows.filter((r) => !r.reply && r.rating > 0 && r.rating <= 3 && !seen.has(r.review_id) && !firstRun).slice(0, 5);
  if (!fresh.length) return { fetched: rows.length, flagged: 0 };
  const created: { id: string; kind: string; summary: string; draft: string; employee_id: string }[] = [];
  for (const r of fresh) {
    const product = r.item_name ?? "your product";
    const draft = aiConfigured() ? await reviewReplyDraft({ rating: r.rating, comment: r.comment || "(no text)", product }).catch(() => "") : "";
    const reply = draft || "Thank you for your feedback, and sorry to hear about this. Please chat with us so we can look into it and help you 🙏";
    await sb.from("marketplace_reviews").update({ draft: reply, status: "drafted" }).eq("workspace_id", ws).eq("platform", "shopee").eq("review_id", r.review_id);
    const a = {
      workspace_id: ws,
      id: `review-shopee-${r.review_id}`,
      task_id: null,
      employee_id: "emp-cs",
      kind: "customer_message",
      summary: `${"⭐".repeat(r.rating)} Shopee review on ${product.slice(0, 60)} — post Mei Ling's reply?`,
      draft: `Review: “${r.comment || "(no text)"}”\n\nReply to post:\n${reply}`,
      status: "pending",
    };
    const { data } = await sb.from("approvals").upsert(a, { onConflict: "workspace_id,id", ignoreDuplicates: true }).select("id, kind, summary, draft, employee_id");
    created.push(...((data ?? []) as typeof created));
  }
  const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
  if (created.length) {
    if (tg?.shop_id) {
      await sendTelegram(tg.shop_id, `💬 <b>Mei Ling:</b> ${created.length} new low rating${created.length > 1 ? "s" : ""} on Shopee — I drafted a reply for each. Approve to post it.`).catch(() => {});
      await sendApprovalCards(tg.shop_id, ws, created).catch(() => {});
    }
    await sendPush(ws, { title: `💬 ${created.length} low rating${created.length > 1 ? "s" : ""} on Shopee`, body: created.map((c) => c.summary).join("\n"), url: "/office", tag: "reviews" });
  }
  return { fetched: rows.length, flagged: created.length };
}

/** Post the (possibly edited) reply for an approved review. */
export async function postReviewReply(ws: string, approvalId: string, text?: string) {
  const m = /^review-shopee-(\d+)$/.exec(approvalId);
  if (!m) throw new Error("Not a Shopee review.");
  const sb = getAdminSupabase();
  const { data: rev } = await sb.from("marketplace_reviews").select("draft, status").eq("workspace_id", ws).eq("platform", "shopee").eq("review_id", m[1]).maybeSingle();
  const reply = (text ?? (rev?.draft as string | null) ?? "").trim().slice(0, 500);
  if (!reply) throw new Error("The reply is empty.");
  const [row] = (await listIntegrations(ws, "shopee")).filter((r) => r.status === "connected");
  if (!row) throw new Error("Shopee isn't connected.");
  const cfg = requireShopeeConfig();
  const token = await shopeeToken(cfg, row);
  const r = await shopPost<{ response?: { result_list?: { comment_id: number; fail_error?: string; fail_message?: string }[] } }>(
    cfg,
    "/api/v2/product/reply_comment",
    { comment_list: [{ comment_id: Number(m[1]), comment: reply }] },
    token,
    Number(row.shop_id),
  );
  const fail = r.response?.result_list?.find((x) => x.fail_error);
  if (fail) throw new Error(fail.fail_message || fail.fail_error);
  await sb.from("marketplace_reviews").update({ reply, replied_at: new Date().toISOString(), status: "replied" }).eq("workspace_id", ws).eq("platform", "shopee").eq("review_id", m[1]);
  await sb.from("approvals").update({ status: "approved", decided_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", approvalId).eq("status", "pending");
  return { reply };
}

/** Skip: mark the review as handled without posting. */
export async function skipReview(ws: string, approvalId: string) {
  const m = /^review-shopee-(\d+)$/.exec(approvalId);
  if (!m) throw new Error("Not a Shopee review.");
  const sb = getAdminSupabase();
  await sb.from("marketplace_reviews").update({ status: "ignored" }).eq("workspace_id", ws).eq("platform", "shopee").eq("review_id", m[1]);
  await sb.from("approvals").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("workspace_id", ws).eq("id", approvalId).eq("status", "pending");
}

