// "Run now" button on the Sources page: same pipeline as the cron, behind the dashboard session.
import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/session";
import { runWithDefaults } from "@/lib/pipeline/run";
import { errorMessage, log } from "@/lib/logger";

export const maxDuration = 300;

export async function POST() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    const summary = await runWithDefaults("manual");
    if (summary.skipped) return NextResponse.json({ error: "A run is already in progress" }, { status: 409 });
    return NextResponse.json({ stats: summary.stats, errors: summary.errors });
  } catch (err) {
    log.error("run_now.failed", { error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
