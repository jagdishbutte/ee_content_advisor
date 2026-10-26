// Redirects to /login (or returns 401 for API calls) when the session cookie is missing or wrong.
import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Public: login page/route, the cron route (Bearer-protected itself) and static assets.
  matcher: ["/((?!login|api/login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
