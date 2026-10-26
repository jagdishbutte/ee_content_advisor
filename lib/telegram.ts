// Optional Telegram digest sent after a run that produced new briefs.
import { telegramEnv } from "./env";
import { errorMessage, log } from "./logger";
import type { Platform } from "./types";

export interface DigestBrief {
  id: string;
  title: string;
  recommended_platform: Platform;
  score: number | null;
}

const PLATFORM = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" } as const;
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildDigest(briefs: DigestBrief[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const lines = briefs.map(
    (b, i) =>
      `${i + 1}. <a href="${base}/briefs/${b.id}">${escapeHtml(b.title)}</a> · ${PLATFORM[b.recommended_platform]} · score ${b.score === null ? "n/a" : Math.round(b.score)}`,
  );
  return [`<b>Elevate Edge: ${briefs.length} new brief${briefs.length === 1 ? "" : "s"}</b>`, "", ...lines, "", `<a href="${base}/">Open dashboard</a>`].join("\n");
}

/** Sends the digest if Telegram is configured. Never throws: a failed message must not fail the run. */
export async function sendDigest(briefs: DigestBrief[], baseUrl: string): Promise<boolean> {
  const env = telegramEnv();
  if (!env || briefs.length === 0) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: buildDigest(briefs, baseUrl), parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    log.info("telegram.sent", { briefs: briefs.length });
    return true;
  } catch (err) {
    log.warn("telegram.failed", { error: errorMessage(err) });
    return false;
  }
}
