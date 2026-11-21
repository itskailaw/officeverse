import "server-only";
import type { StaffAction } from "@/lib/ai/actions";
import { checkOrdersNow } from "./order-check";
import { sendBriefing } from "./briefing-send";

/** Run an action the CEO approved. Returns a short message for the chat / Telegram. */
export async function runStaffAction(ws: string, action: StaffAction): Promise<{ ok: boolean; text: string }> {
  try {
    switch (action) {
      case "send_packing_email": {
        const { sendPackingEmail } = await import("./packing-email");
        const r = await sendPackingEmail(ws, { manual: true });
        return { ok: true, text: r.status === "sent" ? `📧 Done — airway bills + packing list for ${r.count} parcel${r.count === 1 ? "" : "s"} sent to your email.` : "Nothing new to send — every parcel in To ship was already emailed." };
      }
      case "check_orders": {
        const r = await checkOrdersNow(ws, "manual", 0);
        return {
          ok: true,
          text: r.arranged || r.failed ? `📦 Checked — ${r.arranged} confirmed${r.failed ? `, ${r.failed} need you` : ""}.` : "📦 Checked — no new orders waiting (or automatic confirmation is off).",
        };
      }
      case "send_briefing": {
        await sendBriefing(ws, { refresh: true });
        return { ok: true, text: "☀️ Done — today's briefing is on your Telegram." };
      }
    }
  } catch (e) {
    return { ok: false, text: `⚠️ Couldn't do it: ${e instanceof Error ? e.message : String(e)}` };
  }
}
