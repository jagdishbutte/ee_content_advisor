// Brief actions from the dashboard: change status (select/reject/…), thumbs feedback, mark posted.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { platformSchema } from "@/lib/brief-schema";
import { markPosted, setBriefFeedback, setBriefStatus } from "@/lib/dashboard";
import { unauthorized } from "@/lib/session";
import { errorMessage, log } from "@/lib/logger";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(["suggested", "selected_for_design", "designed", "rejected"]) }),
  z.object({ action: z.literal("feedback"), feedback: z.enum(["up", "down"]).nullable() }),
  z.object({ action: z.literal("posted"), platform: platformSchema }),
]);

export async function POST(request: NextRequest, ctx: RouteContext<"/api/briefs/[id]">) {
  const denied = await unauthorized();
  if (denied) return denied;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid brief id" }, { status: 400 });
  const body = actionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  try {
    const a = body.data;
    if (a.action === "status") await setBriefStatus(id, a.status);
    else if (a.action === "feedback") await setBriefFeedback(id, a.feedback);
    else if (!(await markPosted(id, a.platform))) return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("brief.action_failed", { id, error: errorMessage(err) });
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
