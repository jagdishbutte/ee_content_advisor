// Scheduled pipeline run, called by GitHub Actions every 6 hours with `Authorization: Bearer CRON_SECRET`.
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { runWithDefaults } from "@/lib/pipeline/run";
import { errorMessage, log } from "@/lib/logger";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runWithDefaults("cron");
    return NextResponse.json(summary, { status: summary.skipped ? 409 : 200 });
  } catch (err) {
    log.error("cron.failed", { error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
