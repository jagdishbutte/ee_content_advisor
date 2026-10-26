import { describe, expect, it } from "vitest";
import { ingest, isDue, toNewItems, type IngestStore, type NewItem } from "@/lib/pipeline/ingest";
import { extractArticleLinks, findAlternateFeeds } from "@/lib/feeds";
import type { SourceConfig } from "@/config/sources";

const now = new Date("2026-10-26T12:00:00Z");

function source(id: string, extra: Partial<SourceConfig> = {}): SourceConfig {
  return { id, name: id, url: `https://${id}.com/`, type: "news", feedUrl: `https://${id}.com/feed`, pollFrequency: "every_run", enabled: true, topics: [], authority: 3, notes: "", ...extra };
}

function memoryStore() {
  const inserted: NewItem[] = [];
  const marks: Record<string, string> = {};
  const store: IngestStore = {
    lastPolled: async () => new Map(),
    insertItems: async (items) => {
      inserted.push(...items);
      return items.length;
    },
    markSource: async (id, status) => {
      marks[id] = status;
    },
  };
  return { store, inserted, marks };
}

describe("isDue", () => {
  it("handles each frequency", () => {
    expect(isDue("every_run", now.toISOString(), now)).toBe(true);
    expect(isDue("daily", null, now)).toBe(true);
    expect(isDue("daily", "2026-10-26T00:00:00Z", now)).toBe(false);
    expect(isDue("daily", "2026-10-25T10:00:00Z", now)).toBe(true);
    expect(isDue("weekly", "2026-10-22T00:00:00Z", now)).toBe(false);
    expect(isDue("weekly", "2026-10-18T00:00:00Z", now)).toBe(true);
  });
});

describe("toNewItems", () => {
  it("normalises urls, drops old and duplicate entries", () => {
    const items = toNewItems(source("a"), [
      { url: "https://www.a.com/x?utm_source=rss", title: "X", publishedAt: "2026-10-25T00:00:00Z", author: null, summary: null },
      { url: "https://a.com/x/", title: "X again", publishedAt: null, author: null, summary: null },
      { url: "https://a.com/old", title: "Old", publishedAt: "2026-09-01T00:00:00Z", author: null, summary: null },
    ], now);
    expect(items.map((i) => i.url)).toEqual(["https://a.com/x"]);
  });
});

describe("ingest", () => {
  it("isolates a failing source", async () => {
    const { store, inserted, marks } = memoryStore();
    const result = await ingest([source("good"), source("bad"), source("off", { enabled: false })], store, now, async (s) => {
      if (s.id === "bad") throw new Error("boom");
      return [{ url: "https://good.com/a", title: "A", publishedAt: null, author: null, summary: null }];
    });
    expect(result.polled).toBe(2);
    expect(result.inserted).toBe(1);
    expect(result.errors).toEqual([{ stage: "ingest", source_id: "bad", message: "boom" }]);
    expect(marks).toEqual({ good: "ok", bad: "error" });
    expect(inserted).toHaveLength(1);
  });
});

describe("feed helpers", () => {
  it("finds alternate feed links", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed/"><link rel="alternate" type="application/rss+xml" href="/comments/feed/"></head></html>`;
    expect(findAlternateFeeds(html, "https://x.com/")).toEqual(["https://x.com/feed/"]);
  });

  it("extracts article-like links from a news page", () => {
    const html = `<a href="/news/2026/big-chip-news">TSMC reports record quarterly revenue on AI demand</a><a href="/about">About us and our long history here</a><a href="https://other.com/a/b">Another site headline that is long enough</a>`;
    expect(extractArticleLinks(html, "https://x.com/news").map((e) => e.url)).toEqual(["https://x.com/news/2026/big-chip-news"]);
  });
});
