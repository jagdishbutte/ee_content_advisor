// Single-user dashboard auth: the session cookie holds an HMAC derived from DASHBOARD_PASSWORD,
// so changing the password logs everyone out and nothing needs to be stored server-side.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { authEnv } from "./env";

export const SESSION_COOKIE = "ee_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update("elevate-edge-dashboard-session-v1").digest("hex");
}

/** Constant-time string comparison (hashing first makes lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string, password = authEnv().DASHBOARD_PASSWORD): boolean {
  return safeEqual(input, password);
}

export function isValidSession(cookie: string | undefined, password = authEnv().DASHBOARD_PASSWORD): boolean {
  return !!cookie && safeEqual(cookie, sessionToken(password));
}

/** Checks an `Authorization: Bearer <CRON_SECRET>` header. */
export function isCronAuthorized(header: string | null, secret = authEnv().CRON_SECRET): boolean {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  return !!token && safeEqual(token, secret);
}
