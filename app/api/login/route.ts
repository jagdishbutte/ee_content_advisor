import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authEnv } from "@/lib/env";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth";

const bodySchema = z.object({ password: z.string() });

export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !checkPassword(body.data.password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionToken(authEnv().DASHBOARD_PASSWORD), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
