import { describe, expect, it } from "vitest";
import { clusterItems, dedupe, type DedupeItem } from "@/lib/pipeline/dedupe";
import { contentHash, jaccard, titleTokens, truncateWords } from "@/lib/text";
import { toExtraction } from "@/lib/pipeline/extract";

const item = (id: string, source_id: string, title: string, extra: Partial<DedupeItem> = {}): DedupeItem => ({
  id,
  source_id,
  title,
  canonical_url: null,
  content_hash: null,
  published_at: "2026-10-25T10:00:00Z",
  fetched_at: "2026-10-25T10:00:00Z",
  cluster_id: null,
  duplicate_of: null,
  source_count: 1,
  ...extra,
});

describe("text helpers", () => {
  it("tokenises titles without stop words or punctuation", () => {
    expect([...titleTokens("TSMC's 2nm yields hit 60%, says report")]).toEqual(["tsmc", "2nm", "yields", "hit", "60%", "report"]);
  });

  it("computes Jaccard similarity", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });

  it("hashes content ignoring case and whitespace", () => {
    expect(contentHash("Hello  World")).toBe(contentHash("hello world"));
  });

  it("truncates to a word limit", () => {
    expect(truncateWords("one two three four", 2)).toBe("one two …");
    expect(truncateWords("one two", 5)).toBe("one two");
  });
});

describe("clusterItems", () => {
  it("clusters near-duplicate titles and picks the highest-authority lead", () => {
    const updates = clusterItems([
      item("1", "semiwiki", "TSMC begins 2nm mass production in Taiwan"), // authority 3
      item("2", "semiengineering", "TSMC begins mass production of 2nm chips in Taiwan"), // authority 4
      item("3", "eetimes", "Nvidia unveils new Blackwell Ultra GPU"),
    ]);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u]));
    expect(byId["2"]).toEqual({ id: "2", cluster_id: "2", duplicate_of: null, source_count: 2 });
    expect(byId["1"]).toEqual({ id: "1", cluster_id: "2", duplicate_of: "2", source_count: 2 });
    expect(byId["3"]).toEqual({ id: "3", cluster_id: "3", duplicate_of: null, source_count: 1 });
  });

  it("treats identical canonical URLs or content hashes as duplicates", () => {
    const updates = clusterItems([
      item("a", "eetimes", "Completely different headline", { canonical_url: "https://x.com/story" }),
      item("b", "semiwiki", "Another unrelated title", { canonical_url: "https://x.com/story" }),
      item("c", "eetimes", "Third title here", { content_hash: "h1" }),
      item("d", "eetimes", "Fourth title there", { content_hash: "h1" }),
    ]);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u]));
    expect(byId.b.duplicate_of).toBe("a");
    expect(byId.d.cluster_id).toBe(byId.c.cluster_id);
    expect(byId.c.source_count).toBe(1); // same source twice is not corroboration
  });

  it("returns no updates when clusters are unchanged", () => {
    expect(clusterItems([item("x", "eetimes", "Solo story", { cluster_id: "x" })])).toEqual([]);
  });

  it("saves only changed rows through the store", async () => {
    const saved: unknown[] = [];
    const res = await dedupe(
      {
        recentItems: async () => [item("1", "eetimes", "Intel foundry wins Microsoft order"), item("2", "semiwiki", "Microsoft order won by Intel foundry")],
        saveClusters: async (u) => void saved.push(...u),
      },
      new Date("2026-10-26T00:00:00Z"),
    );
    expect(res).toEqual({ considered: 2, duplicates: 1, updated: 2 });
    expect(saved).toHaveLength(2);
  });
});

describe("toExtraction", () => {
  const pending = { id: "1", source_id: "eetimes", url: "https://x.com/a", title: "Title", summary_raw: "Feed summary" };

  it("keeps the feed summary and flags partial when the page is thin or missing", () => {
    expect(toExtraction(pending, null)).toMatchObject({ content_text: "Feed summary", content_status: "partial", canonical_url: null });
    expect(toExtraction(pending, { text: "Subscribe to read", canonical: "https://x.com/a" }).content_status).toBe("partial");
  });

  it("uses full page text when long enough", () => {
    const text = Array.from({ length: 250 }, (_, i) => `w${i}`).join(" ");
    const e = toExtraction(pending, { text, canonical: "https://x.com/a" });
    expect(e).toMatchObject({ content_text: text, content_status: "full", canonical_url: "https://x.com/a", content_hash: contentHash(text) });
  });
});
