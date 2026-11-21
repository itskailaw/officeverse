import "server-only";
import { after, NextResponse } from "next/server";

/**
 * Shared wrapper for the scheduled-job routes.
 * - Checks `Authorization: Bearer <CRON_SECRET>`.
 * - With `?bg=1` it answers 202 at once and finishes the work in the background (up to the
 *   route's maxDuration). External schedulers such as cron-job.org stop waiting after ~30 s,
 *   which is shorter than the briefing or the full sync can take.
 * - Without it, it waits and returns the result (handy for manual runs).
 */
export async function runCron(req: Request, name: string, work: () => Promise<unknown>) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (new URL(req.url).searchParams.get("bg") === "1") {
    after(async () => {
      try {
        console.log(`[cron ${name}]`, JSON.stringify(await work()).slice(0, 2000));
      } catch (e) {
        console.error(`[cron ${name}] failed`, e instanceof Error ? e.message : e);
      }
    });
    return NextResponse.json({ accepted: true, job: name }, { status: 202 });
  }
  try {
    return NextResponse.json(await work());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
