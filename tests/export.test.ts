import { describe, expect, it } from "vitest";
import type { DashboardBrief } from "@/lib/dashboard";
import { briefToMarkdown, briefsToMarkdown } from "@/lib/export";
import { validBrief } from "./fixtures";

const brief: DashboardBrief = {
  id: "b1",
  item_id: "i1",
  related_item_ids: [],
  title: validBrief.headline,
  brief_json: { ...validBrief, needs_verification: true },
  recommended_platform: "linkedin",
  platform_reason: "Strategy story.",
  status: "selected_for_design",
  feedback: null,
  score: 72,
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
  item: {
    source_id: "semianalysis",
    url: "https://example.com/a",
    canonical_url: null,
    topics: ["semiconductors"],
    score_breakdown: null,
    published_at: null,
    content_status: "full",
  },
};

describe("markdown export", () => {
  it("includes everything the designer needs", () => {
    const md = briefToMarkdown(brief);
    expect(md).toContain(`## ${validBrief.headline}`);
    expect(md).toContain("LinkedIn (secondary: Instagram)");
    expect(md).toContain("Needs verification");
    expect(md).toContain("https://example.com/a");
    for (const h of validBrief.hooks) expect(md).toContain(h);
    expect(md).toContain("Slide 5");
    expect(md).toContain(validBrief.captions.x);
    expect(md).toContain(validBrief.source_credit_line);
  });

  it("joins briefs under a dated header", () => {
    const md = briefsToMarkdown([brief, brief], new Date("2026-10-26T12:00:00Z"));
    expect(md.startsWith("# Elevate Edge: selected briefs (2026-10-26)")).toBe(true);
    expect(md.split("\n---\n").length).toBe(2);
    expect(briefsToMarkdown([], new Date("2026-10-26T12:00:00Z"))).toContain("No briefs selected.");
  });
});
