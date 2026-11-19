import { NextResponse } from "next/server";
import { HttpError, rateLimit, str } from "@/lib/ai/server/guard";
import { parseContext, parseEmployee } from "@/lib/ai/server/validate";
import { draftCustomerReply } from "@/lib/ai/server/engine";
import { getMembership } from "@/lib/integrations/store";
import { getChat, getMessages, lazadaChatContext } from "@/lib/integrations/lazada/chat";
import { getServerSupabase } from "@/lib/supabase/server";
import { chatError } from "@/lib/integrations/lazada/chat-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Ask the customer-service employee to draft a reply. Nothing is sent. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new HttpError(400, "Invalid request.");
    const id = str(body.sessionId, "sessionId", 120);
    const employee = parseEmployee(body.employee);
    if (!employee.permissions.includes("customers:read")) throw new HttpError(403, `${employee.name} doesn't have the customers:read permission.`);
    const context = parseContext(body.context);
    const m = await getMembership();
    rateLimit(m.userId);
    const c = await lazadaChatContext(m.workspaceId);
    const session = await getChat(c, id);
    const messages = await getMessages(c, session);
    // orders mentioned in the chat (order cards), from our synced data — no buyer personal data
    const ids = [...new Set(messages.map((x) => x.orderId).filter((x): x is string => !!x))].slice(0, 5);
    let orders: Record<string, unknown>[] = [];
    if (ids.length) {
      const sb = await getServerSupabase();
      const { data } = sb
        ? await sb.from("marketplace_orders").select("external_order_id, status, gross_amount, ordered_at, ship_by, items").eq("workspace_id", m.workspaceId).eq("platform", "lazada").in("external_order_id", ids)
        : { data: null };
      orders = (data ?? []).map((o) => ({
        orderId: o.external_order_id,
        status: o.status,
        amountMYR: o.gross_amount,
        orderedAt: o.ordered_at,
        shipBy: o.ship_by,
        items: o.items,
      }));
      for (const x of ids) if (!orders.some((o) => o.orderId === x)) orders.push({ orderId: x, note: "Not found in synced data (older than 30 days or not synced yet)." });
    }
    const draft = await draftCustomerReply({
      employee,
      context,
      platform: "Lazada",
      buyerName: session.title,
      transcript: messages.map((x) => ({ fromBuyer: x.fromBuyer, text: x.text, at: x.at })),
      orders,
    });
    return NextResponse.json({ ...draft, orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return chatError(e);
  }
}
