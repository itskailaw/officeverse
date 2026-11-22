import { NextResponse } from "next/server";
import { errorResponse, HttpError, rateLimit, requireUser } from "@/lib/ai/server/guard";
import { campaignPlan, chatReplies, writeListing, type Who } from "@/lib/ai/server/marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Marketing Studio: listing writer, buyer chat replies, campaign plans. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    rateLimit(user);
    const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const e = (body.employee ?? {}) as Record<string, unknown>;
    const who: Who = { name: s(e.name, 60) || "Hafiz", title: s(e.title, 80) || "Marketplace Specialist", model: s(e.model, 40) || undefined };
    let out: unknown;
    if (body.kind === "listing") {
      const product = s(body.product, 300);
      if (!product) throw new HttpError(400, "Enter the product name.");
      const languages = (Array.isArray(body.languages) ? body.languages : ["en"]).filter((l): l is "en" | "ms" => l === "en" || l === "ms");
      out = await writeListing(who, { product, variations: s(body.variations, 600), facts: s(body.facts, 3000), platform: body.platform === "lazada" ? "lazada" : "shopee", languages: languages.length ? languages : ["en"] });
    } else if (body.kind === "reply") {
      const message = s(body.message, 2000);
      if (!message) throw new HttpError(400, "Paste the buyer's message.");
      out = await chatReplies(who, { message, context: s(body.context, 2000), tone: body.tone === "formal" ? "formal" : "friendly" });
    } else if (body.kind === "campaign") {
      const ev = (body.event ?? {}) as Record<string, unknown>;
      const name = s(ev.name, 80);
      if (!name) throw new HttpError(400, "Choose an event.");
      const products = (Array.isArray(body.products) ? body.products : []).slice(0, 15).map((p) => {
        const r = p as Record<string, unknown>;
        return { name: s(r.name, 120), units30: num(r.units30) ?? 0, left: num(r.left), perDay: num(r.perDay) };
      });
      out = await campaignPlan(who, { event: { name, date: s(ev.date, 10), daysLeft: num(ev.daysLeft) ?? 0, tip: s(ev.tip, 300) }, products, budget: s(body.budget, 200), notes: s(body.notes, 1500) });
    } else throw new HttpError(400, "Unknown request.");
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
