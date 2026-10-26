import robotsParser from "robots-parser";
import { fetchText, HttpError, USER_AGENT } from "./http";

type Robots = ReturnType<typeof robotsParser>;

// Cached per origin for the lifetime of the process (one pipeline run).
const cache = new Map<string, Promise<Robots | null>>();

async function load(origin: string): Promise<Robots | null> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const { text } = await fetchText(robotsUrl, { timeoutMs: 8000, maxBytes: 500_000, retries: 1 });
    return robotsParser(robotsUrl, text);
  } catch (err) {
    // A missing robots.txt (4xx) means no restrictions; anything else (5xx, timeouts) we treat as "disallow".
    if (err instanceof HttpError && err.status && err.status >= 400 && err.status < 500) return robotsParser(robotsUrl, "");
    return null;
  }
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) cache.set(origin, load(origin));
  const robots = await cache.get(origin)!;
  if (!robots) return false;
  return robots.isAllowed(url, USER_AGENT) !== false;
}

export async function crawlDelayMs(url: string): Promise<number> {
  const origin = new URL(url).origin;
  if (!cache.has(origin)) cache.set(origin, load(origin));
  const robots = await cache.get(origin)!;
  const delay = robots?.getCrawlDelay(USER_AGENT);
  return delay ? Math.min(delay, 30) * 1000 : 0;
}
