import { describe, expect, it } from "vitest";
import { freshness, matchPillars, noveltyPenalty, prescore, scoreItem, visualPotential, type Offsets, type ScoreInput } from "@/lib/pipeline/prescore";
import { scoreWeights } from "@/config/scoring";
import { titleTokens } from "@/lib/text";

const now = new Date("2026-10-26T12:00:00Z");
const noOffsets: Offsets = { source: new Map(), topic: new Map() };
const input = (extra: Partial<ScoreInput> = {}): ScoreInput => ({
  id: "1",
  source_id: "semiengineering", // authority 4
  title: "TSMC 2nm wafer output to reach 100,000 per month, chip capacity up 40%",
  content_text: "TSMC said its 2nm foundry capacity will grow 40% in 2026 as chip demand for AI GPUs rises. Revenue hit $30 billion.",
  summary_raw: null,
  published_at: "2026-10-26T06:00:00Z",
  fetched_at: "2026-10-26T07:00:00Z",
  source_count: 1,
  ...extra,
});

describe("weights", () => {
  it("sum to 100", () => {
    expect(Object.values(scoreWeights).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("components", () => {
  it("matches pillars by whole-word keywords, strongest first", () => {
    const m = matchPillars("TSMC expands chip foundry", "New GPU demand from AI");
    expect(m[0].id).toBe("semiconductors");
    expect(m.map((x) => x.id)).toContain("ai_infrastructure");
    expect(matchPillars("Rainy weekend ahead", "Said nothing relevant")).toEqual([]);
    expect(matchPillars("Barcelona airport", "")).toEqual([]); // "ar"/"ai" must be whole words
  });

  it("decays freshness linearly to zero over 72h and falls back to fetched_at", () => {
    expect(freshness("2026-10-26T12:00:00Z", "", now)).toBe(1);
    expect(freshness("2026-10-25T00:00:00Z", "", now)).toBeCloseTo(0.5);
    expect(freshness("2026-10-20T00:00:00Z", "", now)).toBe(0);
    expect(freshness(null, "2026-10-26T12:00:00Z", now)).toBe(1);
  });

  it("rates figure-heavy stories as more visual", () => {
    expect(visualPotential("Shipments up 40% to 12 million", "Revenue $5 billion, share 30%, 3nm")).toBeGreaterThan(0.8);
    expect(visualPotential("Interview with a CEO", "Thoughts on leadership")).toBe(0);
  });

  it("penalises stories similar to recent briefs/posts", () => {
    const recent = [titleTokens("TSMC starts 2nm mass production")];
    expect(noveltyPenalty("TSMC starts mass production at 2nm", recent)).toBeGreaterThan(0);
    expect(noveltyPenalty("Nvidia launches new GPU", recent)).toBe(0);
  });
});

describe("scoreItem", () => {
  it("produces a 0–100 total equal to the breakdown sum", () => {
    const r = scoreItem(input(), [], noOffsets, now);
    const b = r.score_breakdown;
    expect(r.relevance_score).toBe(b.total);
    expect(b.total).toBeCloseTo(b.pillar + b.freshness + b.authority + b.corroboration + b.visual + b.novelty_penalty + b.feedback, 1);
    expect(b.total).toBeGreaterThan(50);
    expect(b.authority).toBeCloseTo(11.3, 1);
    expect(r.topics[0]).toBe("semiconductors");
  });

  it("rewards corroboration and applies capped feedback offsets", () => {
    const base = scoreItem(input(), [], noOffsets, now).relevance_score;
    expect(scoreItem(input({ source_count: 4 }), [], noOffsets, now).score_breakdown.corroboration).toBe(scoreWeights.corroboration);
    const boosted = scoreItem(input(), [], { source: new Map([["semiengineering", 50]]), topic: new Map([["semiconductors", -3]]) }, now);
    expect(boosted.score_breakdown.feedback).toBe(7); // +10 (capped) − 3
    expect(boosted.relevance_score).toBeCloseTo(Math.min(100, base + 7), 1);
  });

  it("clamps at zero", () => {
    const r = scoreItem(input({ title: "Weekend reading", content_text: "", published_at: "2026-01-01T00:00:00Z", source_id: "unknown" }), [titleTokens("Weekend reading")], noOffsets, now);
    expect(r.relevance_score).toBe(0);
  });
});

describe("prescore", () => {
  it("scores all candidates through the store", async () => {
    let saved = 0;
    const res = await prescore(
      {
        itemsToScore: async () => [input(), input({ id: "2" })],
        recentTitles: async () => [],
        offsets: async () => noOffsets,
        saveScores: async (r) => void (saved = r.length),
      },
      now,
    );
    expect(res).toEqual({ scored: 2 });
    expect(saved).toBe(2);
  });
});
