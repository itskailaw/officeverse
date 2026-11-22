import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { dueReminders } from "@/lib/marketing/calendar";
import { listIntegrations } from "./store";
import { escapeHtml, sendTelegram } from "./telegram";
import { sendPush } from "./webpush";
import { getWsState, setWsState } from "./ws-state";

/** Hafiz (Marketplace) reminds the CEO ahead of sale events: 14 and 3 days before mega sales and festivals. */
export async function campaignWatch(ws: string) {
  const sent = await getWsState<string[]>(ws, "campaign-reminders", []);
  const due = dueReminders(new Date(), sent);
  if (!due.length) return { reminded: 0 };
  // remember first: if the table is missing, stay quiet rather than repeat every hour
  if (!(await setWsState(ws, "campaign-reminders", [...sent, ...due.map((d) => d.key)].slice(-200)))) return { reminded: 0 };
  const { data: emp } = await getAdminSupabase().from("employees").select("name").eq("workspace_id", ws).eq("id", "emp-mkt-spec").maybeSingle();
  const who = ((emp?.name as string | undefined) ?? "Hafiz").split(" ")[0];
  const lines = due.map(({ event: e }) => `📅 <b>${escapeHtml(e.name)}</b> in ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} (${e.date})\n   ${escapeHtml(e.tip)}`);
  const tg = (await listIntegrations(ws, "telegram")).find((r) => r.status === "connected" && r.shop_id);
  if (tg?.shop_id) await sendTelegram(tg.shop_id, `📣 <b>${escapeHtml(who)} (Marketplace):</b>\n${lines.join("\n")}\n\nOpen OfficeVerse → Marketing Studio → Campaigns for a ready plan.`).catch(() => {});
  await sendPush(ws, { title: `📣 ${due[0].event.name} in ${due[0].event.daysLeft} days`, body: `${who}: ${due[0].event.tip}`, url: "/office", tag: "campaign" }).catch(() => {});
  return { reminded: due.length };
}
