import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Reports which back-end capabilities are configured. Never returns secret values. */
export function GET() {
  return NextResponse.json(
    {
      ok: true,
      phase: 2,
      supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
      ai: Boolean(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY),
      phase2: true,
      integrations: 0,
      timezone: "Asia/Kuala_Lumpur",
      currency: "MYR",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
