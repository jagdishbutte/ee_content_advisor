// Session check for route handlers and server components. The proxy also checks, but every
// handler re-verifies so an excluded or mis-matched path can never skip auth.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidSession, SESSION_COOKIE } from "./auth";

export async function hasSession(): Promise<boolean> {
  return isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Returns a 401 response when the request has no valid session, otherwise null. */
export async function unauthorized(): Promise<NextResponse | null> {
  return (await hasSession()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
