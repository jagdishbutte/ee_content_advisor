import { describe, expect, it } from "vitest";
import type { Brief } from "@/lib/brief-schema";
import type { BriefCandidate } from "@/lib/pipeline/brief";
import { applyPlatform, recommendPlatform } from "@/lib/pipeline/platform";

const now = Date.parse("2026-10-26T12:00:00Z");

const brief: Brief = {
  headline: "Chipmaker shares update",
  hooks: ["a", "b", "c"],
  why_it_matters: "It matters.",
  key_facts: [{ fact: "No numbers here", source_url: "https://example.com/a" }],
  carousel_slides: [],
  suggested_chart: null,
  captions: { linkedin: "l", instagram: "i", x: "x" },
  hashtags: ["#a", "#b", "#c"],
  source_credit_line: "Source: Example",
  recommended_platform: null,
  secondary_platform: null,
  platform_reason: null,
  confidence: 0.7,
  needs_verification: false,
};

const item: BriefCandidate = {
  id: "i1",
  source_id: "semianalysis",
  url: "https://example.com/a",
  canonical_url: null,
  title: "Chipmaker shares update",
  content_text: null,
  summary_raw: null,
  content_status: "full",
  relevance_score: 70,
  published_at: "2026-10-20T00:00:00Z",
  topics: [],
  cluster_id: null,
};

describe("recommendPlatform", () => {
  it("picks x for fresh breaking news", () => {
    const fresh = { ...item, title: "Nvidia announces new chip", published_at: "2026-10-26T08:00:00Z" };
    expect(recommendPlatform(brief, fresh, now).recommended).toBe("x");
  });

  it("picks instagram for data stories with a chart", () => {
    const visual = { ...brief, suggested_chart: { type: "bar", title: "t", data_description: "d" }, key_facts: [{ fact: "Sales rose 40%", source_url: item.url }] };
    expect(recommendPlatform(visual, item, now).recommended).toBe("instagram");
  });

  it("picks linkedin for business and policy stories", () => {
    const policy = { ...item, title: "New export control rules hit chip supply chain" };
    expect(recommendPlatform(brief, policy, now)).toMatchObject({ recommended: "linkedin", secondary: "x" });
  });

  it("defaults to linkedin with instagram secondary", () => {
    expect(recommendPlatform(brief, item, now)).toMatchObject({ recommended: "linkedin", secondary: "instagram" });
  });
});

describe("applyPlatform", () => {
  it("fills a missing LLM recommendation from the rules", () => {
    const out = applyPlatform(brief, item, now);
    expect(out.recommended_platform).toBe("linkedin");
    expect(out.secondary_platform).toBe("instagram");
    expect(out.platform_reason).toBeTruthy();
  });

  it("keeps a valid LLM choice", () => {
    const llm = { ...brief, recommended_platform: "x" as const, secondary_platform: "linkedin" as const, platform_reason: "Breaking." };
    expect(applyPlatform(llm, item, now)).toMatchObject({ recommended_platform: "x", secondary_platform: "linkedin", platform_reason: "Breaking." });
  });

  it("fixes a secondary that repeats the primary", () => {
    const llm = { ...brief, recommended_platform: "linkedin" as const, secondary_platform: "linkedin" as const, platform_reason: "r" };
    expect(applyPlatform(llm, item, now).secondary_platform).toBe("instagram");
  });
});
