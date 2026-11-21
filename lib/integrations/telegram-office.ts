import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { EmployeeBrief, OfficeContext } from "@/lib/ai/protocol";
import type { Permission } from "@/lib/data/types";
import { aiConfigured, rateLimit } from "@/lib/ai/server/guard";
import { chat } from "@/lib/ai/server/engine";
import { liveSummary } from "./summary";
import { automationFrom } from "./live";
import { listIntegrations, updateIntegration } from "./store";
import { escapeHtml, sendTelegram, tg } from "./telegram";
import { mdToTelegram, pickRecipient } from "./telegram-format";
import { handleCancellation } from "./order-automation";

interface EmpRow {
  id: string;
  name: string;
  title: string;
  department_id: string;
  company_id: string | null;
  personality: string;
  responsibilities: string[];
  permissions: string[];
  ai: { model?: string; maxTokensPerTask?: number } | null;
  active: boolean;
  status: string;
}

/** The workspace whose linked Telegram chat this is (or null). */
export async function workspaceForChat(chatId: string) {
  const { data } = await getAdminSupabase().from("integrations").select("workspace_id").eq("provider", "telegram").eq("shop_id", chatId).eq("status", "connected").limit(1);
  return (data?.[0]?.workspace_id as string | undefined) ?? null;
}

async function loadOffice(ws: string) {
  const sb = getAdminSupabase();
  const [emps, depts, comps, tasks, layout] = await Promise.all([
    sb.from("employees").select("id, name, title, department_id, company_id, personality, responsibilities, permissions, ai, active, status").eq("workspace_id", ws),
    sb.from("departments").select("id, name").eq("workspace_id", ws),
    sb.from("companies").select("id, name, description, active").eq("workspace_id", ws),
    sb.from("tasks").select("employee_id, title, status, result, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(15),
    sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle(),
  ]);
  const employees = ((emps.data ?? []) as EmpRow[]).filter((e) => e.active);
  const deptName = (id: string) => (depts.data ?? []).find((d) => d.id === id)?.name ?? "";
  const compName = (id: string | null) => (id ? ((comps.data ?? []).find((c) => c.id === id)?.name ?? null) : null);
  const settings = (layout.data?.settings ?? {}) as { ceoName?: string; demoMode?: boolean };
  const brief = (e: EmpRow): EmployeeBrief => ({
    id: e.id,
    name: e.name,
    title: e.title,
    department: deptName(e.department_id),
    company: compName(e.company_id),
    personality: e.personality,
    responsibilities: e.responsibilities ?? [],
    permissions: (e.permissions ?? []) as Permission[],
    model: e.ai?.model || "default",
    maxTokensPerTask: e.ai?.maxTokensPerTask || 16000,
  });
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "Unknown";
  const context: OfficeContext = {
    ceoName: settings.ceoName || "CEO",
    demoMode: !!settings.demoMode,
    companies: (comps.data ?? []).map((c) => ({ name: c.name as string, description: (c.description as string) ?? "", active: !!c.active })),
    team: employees.map((e) => ({ name: e.name, title: e.title, department: deptName(e.department_id), status: e.status as OfficeContext["team"][number]["status"] })),
    recentTasks: (tasks.data ?? []).map((t) => ({
      employee: nameOf(t.employee_id as string),
      title: t.title as string,
      status: t.status as OfficeContext["recentTasks"][number]["status"],
      result: t.result ? String(t.result).slice(0, 600) : null,
      createdAt: t.created_at as string,
    })),
  };
  return { employees, brief, context };
}

/** A message from the CEO in Telegram → the right AI employee answers (and it shows in the app's chat). */
export async function answerFromTelegram(ws: string, chatId: string, text: string) {
  if (!aiConfigured()) {
    await sendTelegram(chatId, "The AI engine isn't configured yet (AI_API_KEY in Vercel), so your staff can't reply here.");
    return;
  }
  try {
    rateLimit(`tg:${ws}`);
  } catch {
    await sendTelegram(chatId, "Lots of messages in a short time — please wait a few minutes.");
    return;
  }
  const office = await loadOffice(ws);
  if (!office.employees.length) {
    await sendTelegram(chatId, "Open OfficeVerse once so your team is saved to the cloud, then message me again.");
    return;
  }
  const fallback = office.employees.find((e) => e.id === "emp-ea") ?? office.employees[0];
  const pick = pickRecipient(text, office.employees, fallback.id);
  const emp = office.employees.find((e) => e.id === pick.id)!;
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

  const sb = getAdminSupabase();
  const { data: hist } = await sb
    .from("chat_messages")
    .select("role, content")
    .eq("workspace_id", ws)
    .eq("employee_id", emp.id)
    .order("created_at", { ascending: false })
    .limit(12);
  const history = ((hist ?? []) as { role: "ceo" | "employee"; content: string }[]).reverse();
  const { data: lay } = await sb.from("office_layouts").select("settings").eq("workspace_id", ws).maybeSingle();
  const context = {
    ...office.context,
    live: (await liveSummary(sb, ws, { serviceRole: true }).catch(() => null)) as unknown as Record<string, unknown> | null,
    automation: automationFrom(lay?.settings as Record<string, unknown> | null, true),
  };

  let reply: string;
  let usage: unknown = null;
  let model: string | null = null;
  let actions: { action: string; label: string; note: string }[] = [];
  try {
    const r = await chat({
      employee: office.brief(emp),
      context,
      history,
      message: pick.message,
      situation: "The CEO is messaging you from Telegram on their phone. Keep the reply short (under 120 words) and easy to read on a phone; avoid tables.",
    });
    reply = r.reply;
    usage = r.usage;
    model = r.model;
    actions = r.actions ?? [];
  } catch (e) {
    await sendTelegram(chatId, `⚠️ ${escapeHtml(e instanceof Error ? e.message : String(e))}`);
    return;
  }
  const t = Date.now();
  await sb.from("chat_messages").insert([
    { workspace_id: ws, id: `tg-${t}-c`, employee_id: emp.id, role: "ceo", content: `📱 ${pick.message}`.slice(0, 20000), created_at: new Date(t).toISOString() },
    { workspace_id: ws, id: `tg-${t}-e`, employee_id: emp.id, role: "employee", content: reply.slice(0, 20000), usage, model, created_at: new Date(t + 1).toISOString() },
  ]);
  await sendTelegram(chatId, `<b>${escapeHtml(emp.name)}</b> · <i>${escapeHtml(emp.title)}</i>\n${mdToTelegram(reply)}`);
  // actions the employee offered: one card each, runs only on ✅
  for (const a of actions.slice(0, 3)) {
    await tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `🟦 <b>${escapeHtml(a.label)}</b>${a.note ? `\n${escapeHtml(a.note)}` : ""}`,
      reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `act:${a.action}` }, { text: "✖ Not now", callback_data: "act:x" }]] },
    }).catch(() => {});
  }
}

const KIND: Record<string, string> = {
  payment: "💳 Payment",
  ad_campaign: "📣 Ad campaign",
  product_update: "🏷️ Product / listing",
  customer_message: "💬 Customer message",
  record_deletion: "🗑️ Delete records",
  other: "📝 Request",
};

/** Post approval requests with ✅ / ❌ buttons. */
export async function sendApprovalCards(chatId: string, ws: string, list: { id: string; kind: string; summary: string; draft: string; employee_id: string }[]) {
  if (!list.length) return 0;
  const { data: emps } = await getAdminSupabase().from("employees").select("id, name").eq("workspace_id", ws);
  for (const a of list) {
    const who = (emps ?? []).find((e) => e.id === a.employee_id)?.name ?? "Your team";
    await tg("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: `${KIND[a.kind] ?? KIND.other} · <b>${escapeHtml(who)}</b> needs your approval\n${escapeHtml(a.summary)}\n\n<blockquote>${escapeHtml(a.draft.slice(0, 2500))}</blockquote>`,
      reply_markup: {
        inline_keyboard: [
          a.id.startsWith("review-")
            ? [
                { text: "✅ Post reply", callback_data: `ap:${a.id}:a` },
                { text: "Skip", callback_data: `ap:${a.id}:r` },
              ]
            : a.id.startsWith("cancel-")
            ? [
                { text: "✅ Accept cancellation", callback_data: `ap:${a.id}:a` },
                { text: "❌ Reject — ship it", callback_data: `ap:${a.id}:r` },
              ]
            : [
                { text: "✅ Approve", callback_data: `ap:${a.id}:a` },
                { text: "❌ Reject", callback_data: `ap:${a.id}:r` },
              ],
        ],
      },
    });
  }
  return list.length;
}

/** New pending approvals not yet posted to Telegram (waits briefly for the app to save them). */
export async function notifyNewApprovals(ws: string) {
  const rows = await listIntegrations(ws);
  const tgRow = rows.find((r) => r.provider === "telegram" && r.status === "connected");
  if (!tgRow?.shop_id) return 0;
  const summary = (tgRow.last_sync_summary ?? {}) as { notifiedApprovals?: string[] };
  const done = new Set(summary.notifiedApprovals ?? []);
  const sb = getAdminSupabase();
  let fresh: { id: string; kind: string; summary: string; draft: string; employee_id: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const { data } = await sb
      .from("approvals")
      .select("id, kind, summary, draft, employee_id, created_at")
      .eq("workspace_id", ws)
      .eq("status", "pending")
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: true })
      .limit(20);
    fresh = ((data ?? []) as typeof fresh).filter((a) => !done.has(a.id));
    if (fresh.length) break;
    await new Promise((r) => setTimeout(r, 1500)); // the app saves changes ~1 s after they happen
  }
  const sent = await sendApprovalCards(tgRow.shop_id, ws, fresh.slice(0, 5));
  if (sent) {
    const ids = [...done, ...fresh.slice(0, 5).map((a) => a.id)].slice(-200);
    await updateIntegration(tgRow.id, { last_sync_summary: { ...(tgRow.last_sync_summary ?? {}), notifiedApprovals: ids } });
  }
  return sent;
}

/** ✅ / ❌ pressed in Telegram. */
export async function decideFromTelegram(ws: string, approvalId: string, approve: boolean) {
  if (approvalId.startsWith("review-shopee-")) {
    const { data: row } = await getAdminSupabase().from("approvals").select("status").eq("workspace_id", ws).eq("id", approvalId).maybeSingle();
    if (!row || row.status !== "pending") return { ok: false, text: "Already decided (or no longer pending)." };
    const { postReviewReply, skipReview } = await import("./reviews");
    try {
      if (approve) {
        await postReviewReply(ws, approvalId);
        return { ok: true, text: "✅ Reply posted on Shopee", summary: "review reply" };
      }
      await skipReview(ws, approvalId);
      return { ok: true, text: "Skipped — no reply posted", summary: "review" };
    } catch (e) {
      return { ok: false, text: `Shopee refused: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}` };
    }
  }
  if (approvalId.startsWith("cancel-shopee-")) {
    const { data: row } = await getAdminSupabase().from("approvals").select("status").eq("workspace_id", ws).eq("id", approvalId).maybeSingle();
    if (!row || row.status !== "pending") return { ok: false, text: "Already decided (or no longer pending)." };
    try {
      const r = await handleCancellation(ws, approvalId, approve);
      return { ok: true, text: approve ? "✅ Cancellation accepted" : "❌ Cancellation rejected — please ship it", summary: `Shopee order #${r.sn}` };
    } catch (e) {
      return { ok: false, text: `Shopee refused: ${(e instanceof Error ? e.message : String(e)).slice(0, 150)}` };
    }
  }
  const { data, error } = await getAdminSupabase()
    .from("approvals")
    .update({ status: approve ? "approved" : "rejected", decided_at: new Date().toISOString() })
    .eq("workspace_id", ws)
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id, summary");
  if (error) return { ok: false, text: "Couldn't save the decision — try again in the app." };
  if (!data?.length) return { ok: false, text: "Already decided (or no longer pending)." };
  return { ok: true, text: approve ? "✅ Approved" : "❌ Rejected", summary: data[0].summary as string };
}
