// Checks every source homepage for an RSS/Atom feed and records verified results in config/feeds.json.
// Usage: npm run discover-feeds            (all sources)
//        npm run discover-feeds -- semiwiki (one source)
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { baseSources, type DiscoveredFeed } from "../config/sources";
import { fetchText, sleep } from "../lib/http";
import { isAllowedByRobots } from "../lib/robots";
import { COMMON_FEED_PATHS, FEED_ACCEPT, FEED_MAX_BYTES, findAlternateFeeds, looksLikeFeed, parseFeed } from "../lib/feeds";
import { errorMessage } from "../lib/logger";

const FEEDS_PATH = join(process.cwd(), "config", "feeds.json");

async function verifyFeed(url: string): Promise<boolean> {
  try {
    if (!(await isAllowedByRobots(url))) return false;
    const { text } = await fetchText(url, { retries: 1, accept: FEED_ACCEPT, maxBytes: FEED_MAX_BYTES });
    if (!looksLikeFeed(text)) return false;
    return (await parseFeed(text, url)).length > 0;
  } catch {
    return false;
  }
}

async function findFeed(homepage: string): Promise<string | undefined> {
  const candidates: string[] = [];
  try {
    if (await isAllowedByRobots(homepage)) {
      const { text, finalUrl } = await fetchText(homepage, { retries: 1 });
      candidates.push(...findAlternateFeeds(text, finalUrl));
    }
  } catch (err) {
    console.log(`  homepage fetch failed: ${errorMessage(err)}`);
  }
  const origin = new URL(homepage).origin;
  const base = homepage.endsWith("/") ? homepage : `${homepage}/`;
  for (const p of COMMON_FEED_PATHS) {
    candidates.push(new URL(p.replace(/^\//, ""), base).toString(), origin + p);
  }
  for (const url of [...new Set(candidates)]) {
    if (await verifyFeed(url)) return url;
    await sleep(300);
  }
  return undefined;
}

async function newsPageAllowed(url: string): Promise<boolean> {
  try {
    if (!(await isAllowedByRobots(url))) return false;
    await fetchText(url, { retries: 1 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const only = process.argv[2];
  const existing = JSON.parse(readFileSync(FEEDS_PATH, "utf8")) as Record<string, DiscoveredFeed>;
  const targets = baseSources.filter((s) => !only || s.id === only);

  for (const s of targets) {
    console.log(`${s.id}: ${s.url}`);
    const feedUrl = await findFeed(s.url);
    const result: DiscoveredFeed = { status: feedUrl ? "ok" : "no_feed", checkedAt: new Date().toISOString() };
    if (feedUrl) {
      result.feedUrl = feedUrl;
      console.log(`  feed: ${feedUrl}`);
    } else if (s.newsPageUrl && s.type !== "visual_reference") {
      result.newsPageAllowed = await newsPageAllowed(s.newsPageUrl);
      console.log(`  no feed; fallback page ${s.newsPageUrl} ${result.newsPageAllowed ? "allowed" : "NOT allowed → disabled"}`);
    } else {
      console.log("  no feed; no fallback → disabled (manual source)");
    }
    existing[s.id] = result;
    writeFileSync(FEEDS_PATH, JSON.stringify(existing, null, 2) + "\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
