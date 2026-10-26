// Stage 1: poll due sources and store new items. One failing source never stops the others.
import type { SourceConfig, PollFrequency } from "@/config/sources";
import type { RunError } from "@/lib/types";
import { fetchText } from "@/lib/http";
import { isAllowedByRobots } from "@/lib/robots";
import { extractArticleLinks, FEED_ACCEPT, FEED_MAX_BYTES, parseFeed, type FeedEntry } from "@/lib/feeds";
import { normalizeUrl } from "@/lib/url";
import { errorMessage, log } from "@/lib/logger";

const HOUR = 3600_000;
const MAX_ITEMS_PER_SOURCE = 30;
const MAX_ITEM_AGE_MS = 7 * 24 * HOUR;

export interface NewItem {
  source_id: string;
  url: string;
  title: string;
  published_at: string | null;
  author: string | null;
  summary_raw: string | null;
}

export interface IngestStore {
  lastPolled(): Promise<Map<string, string | null>>;
  /** Inserts items whose url is not stored yet; returns how many were new. */
  insertItems(items: NewItem[]): Promise<number>;
  markSource(id: string, status: "ok" | "error", error: string | null): Promise<void>;
}

export interface IngestResult {
  polled: number;
  fetched: number;
  inserted: number;
  errors: RunError[];
}

export function isDue(freq: PollFrequency, lastPolledAt: string | null | undefined, now: Date): boolean {
  if (freq === "every_run" || !lastPolledAt) return true;
  const age = now.getTime() - new Date(lastPolledAt).getTime();
  return freq === "daily" ? age > 20 * HOUR : age > 6.5 * 24 * HOUR;
}

export async function fetchSourceEntries(source: SourceConfig): Promise<FeedEntry[]> {
  if (source.feedUrl) {
    const { text } = await fetchText(source.feedUrl, { accept: FEED_ACCEPT, maxBytes: FEED_MAX_BYTES });
    return parseFeed(text, source.feedUrl);
  }
  if (source.newsPageUrl && source.newsPageAllowed && source.type !== "visual_reference") {
    if (!(await isAllowedByRobots(source.newsPageUrl))) throw new Error("robots.txt disallows news page");
    const { text, finalUrl } = await fetchText(source.newsPageUrl);
    return extractArticleLinks(text, finalUrl);
  }
  throw new Error("no feed and no permitted fallback page");
}

export function toNewItems(source: SourceConfig, entries: FeedEntry[], now: Date): NewItem[] {
  const seen = new Set<string>();
  const out: NewItem[] = [];
  for (const e of entries) {
    if (e.publishedAt && now.getTime() - new Date(e.publishedAt).getTime() > MAX_ITEM_AGE_MS) continue;
    const url = normalizeUrl(e.url);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ source_id: source.id, url, title: e.title, published_at: e.publishedAt, author: e.author, summary_raw: e.summary });
    if (out.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return out;
}

export async function ingest(
  sources: SourceConfig[],
  store: IngestStore,
  now = new Date(),
  fetchEntries: (s: SourceConfig) => Promise<FeedEntry[]> = fetchSourceEntries,
): Promise<IngestResult> {
  const lastPolled = await store.lastPolled();
  const due = sources.filter((s) => s.enabled && isDue(s.pollFrequency, lastPolled.get(s.id), now));
  const result: IngestResult = { polled: due.length, fetched: 0, inserted: 0, errors: [] };

  for (const source of due) {
    try {
      const items = toNewItems(source, await fetchEntries(source), now);
      const inserted = await store.insertItems(items);
      result.fetched += items.length;
      result.inserted += inserted;
      await store.markSource(source.id, "ok", null);
      log.info("ingest.source", { source: source.id, fetched: items.length, new: inserted });
    } catch (err) {
      const message = errorMessage(err);
      result.errors.push({ stage: "ingest", source_id: source.id, message });
      log.warn("ingest.source_failed", { source: source.id, error: message });
      await store.markSource(source.id, "error", message).catch(() => {});
    }
  }
  log.info("ingest.done", { polled: result.polled, fetched: result.fetched, new: result.inserted, failed: result.errors.length });
  return result;
}
