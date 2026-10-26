import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { resolveUrl } from "./url";

// Full-content feeds (e.g. Substack) can be several MB.
export const FEED_MAX_BYTES = 10_000_000;
export const FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml";

// Paths tried when a homepage has no <link rel="alternate"> feed.
export const COMMON_FEED_PATHS = ["/feed", "/feed/", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/feeds/posts/default"];

export interface FeedEntry {
  url: string;
  title: string;
  publishedAt: string | null;
  author: string | null;
  summary: string | null;
}

const parser = new Parser({ timeout: 15000 });

/** Feed URLs advertised in a page's <head> via <link rel="alternate" type="application/rss+xml|atom+xml">. */
export function findAlternateFeeds(html: string, baseUrl: string): string[] {
  const doc = new JSDOM(html).window.document;
  const links = [...doc.querySelectorAll('link[rel~="alternate"]')];
  const feeds = links
    .filter((l) => /(rss|atom)\+xml|application\/xml|text\/xml/i.test(l.getAttribute("type") ?? ""))
    .map((l) => resolveUrl(l.getAttribute("href") ?? "", baseUrl))
    .filter((u): u is string => !!u && !/comments\/feed/i.test(u));
  return [...new Set(feeds)];
}

export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:rdf");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function parseFeed(xml: string, feedUrl: string): Promise<FeedEntry[]> {
  const feed = await parser.parseString(xml);
  return (feed.items ?? [])
    .map((it): FeedEntry | null => {
      const link = it.link ? resolveUrl(it.link, feedUrl) : null;
      const title = it.title?.trim();
      if (!link || !title) return null;
      const date = it.isoDate ?? it.pubDate;
      const parsed = date ? new Date(date) : null;
      const summary = it.contentSnippet ?? it.summary ?? (it.content ? stripHtml(it.content) : null);
      return {
        url: link,
        title: stripHtml(title),
        publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
        author: it.creator ?? (it as { author?: string }).author ?? null,
        summary: summary ? summary.slice(0, 2000) : null,
      };
    })
    .filter((e): e is FeedEntry => e !== null);
}

/**
 * Fallback for sources without a feed: article-looking links on a news/press page.
 * Same host, path depth ≥ 2, link text long enough to be a headline.
 */
export function extractArticleLinks(html: string, pageUrl: string, limit = 20): FeedEntry[] {
  const host = new URL(pageUrl).hostname;
  const doc = new JSDOM(html).window.document;
  const seen = new Set<string>();
  const out: FeedEntry[] = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const url = resolveUrl(a.getAttribute("href") ?? "", pageUrl);
    const title = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!url || title.length <= 25 || seen.has(url)) continue;
    const u = new URL(url);
    if (u.hostname !== host || u.pathname.split("/").filter(Boolean).length < 2) continue;
    seen.add(url);
    out.push({ url, title, publishedAt: null, author: null, summary: null });
    if (out.length >= limit) break;
  }
  return out;
}
