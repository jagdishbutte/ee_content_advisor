// Stage 2: fetch article pages and pull readable text. Paywalls and failures keep the feed summary
// and are flagged "partial"; visual-reference sources are never fetched (inspiration only).
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { getSource } from "@/config/sources";
import type { ContentStatus, RunError } from "@/lib/types";
import { fetchText, sleep } from "@/lib/http";
import { isAllowedByRobots } from "@/lib/robots";
import { normalizeUrl } from "@/lib/url";
import { contentHash, wordCount } from "@/lib/text";
import { errorMessage, log } from "@/lib/logger";

const MIN_FULL_WORDS = 200;
const PAGE_MAX_BYTES = 2_000_000;

export interface PendingItem {
  id: string;
  source_id: string;
  url: string;
  title: string;
  summary_raw: string | null;
}

export interface Extraction {
  canonical_url: string | null;
  content_text: string | null;
  content_hash: string;
  content_status: ContentStatus;
}

export interface ExtractStore {
  pendingItems(limit: number): Promise<PendingItem[]>;
  saveExtraction(id: string, e: Extraction): Promise<void>;
}

export function parseArticle(html: string, url: string): { text: string; canonical: string | null } {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const href = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let canonical: string | null = null;
  if (href) {
    try {
      canonical = normalizeUrl(new URL(href, url).toString());
    } catch {
      canonical = null;
    }
  }
  const article = new Readability(doc).parse();
  const text = (article?.textContent ?? "").replace(/\s+/g, " ").trim();
  return { text, canonical };
}

/** Builds the stored extraction; falls back to the feed summary when the page text is too thin. */
export function toExtraction(item: PendingItem, page: { text: string; canonical: string | null } | null): Extraction {
  const full = !!page && wordCount(page.text) >= MIN_FULL_WORDS;
  const text = full ? page.text : item.summary_raw;
  return {
    canonical_url: page?.canonical ?? null,
    content_text: text,
    content_hash: contentHash(full ? page.text : `${item.title} ${item.summary_raw ?? ""}`),
    content_status: full ? "full" : "partial",
  };
}

export async function extract(store: ExtractStore, limit = 40, delayMs = 500): Promise<{ extracted: number; partial: number; errors: RunError[] }> {
  const items = await store.pendingItems(limit);
  const result = { extracted: 0, partial: 0, errors: [] as RunError[] };

  for (const item of items) {
    let page: { text: string; canonical: string | null } | null = null;
    const source = getSource(item.source_id);
    if (source?.type !== "visual_reference") {
      try {
        if (await isAllowedByRobots(item.url)) {
          const { text, finalUrl } = await fetchText(item.url, { timeoutMs: 12000, maxBytes: PAGE_MAX_BYTES, retries: 1, accept: "text/html" });
          page = parseArticle(text, finalUrl);
        }
      } catch (err) {
        log.warn("extract.item_failed", { item: item.id, url: item.url, error: errorMessage(err) });
      }
      await sleep(delayMs);
    }
    const e = toExtraction(item, page);
    try {
      await store.saveExtraction(item.id, e);
      result.extracted++;
      if (e.content_status === "partial") result.partial++;
    } catch (err) {
      result.errors.push({ stage: "extract", item_id: item.id, message: errorMessage(err) });
    }
  }
  log.info("extract.done", { candidates: items.length, extracted: result.extracted, partial: result.partial });
  return result;
}
