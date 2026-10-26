import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { briefSchema } from "@/lib/brief-schema";
import { validBrief } from "./fixtures";
import { backoffMs, extractJson, isReasoningModel, parseJson } from "@/lib/llm";
import type { GenerateJson } from "@/lib/llm";
import { buildUserPrompt, checkFacts, generateBriefs, unsupportedNumbers, type BriefCandidate, type BriefStore, type NewBrief } from "@/lib/pipeline/brief";

const item: BriefCandidate = {
  id: "i1",
  source_id: "semianalysis",
  url: "https://example.com/a",
  canonical_url: null,
  title: "TSMC raises capex",
  content_text: "TSMC said capital spending will reach $52 billion in 2026, up from 40.9 billion.",
  summary_raw: null,
  content_status: "full",
  relevance_score: 80,
  published_at: "2026-10-25T00:00:00Z",
  topics: ["semiconductors"],
  cluster_id: null,
};

describe("brief schema", () => {
  it("accepts a valid brief", () => {
    expect(briefSchema.safeParse(validBrief).success).toBe(true);
  });

  it("rejects long headlines, wrong hook count and too few slides", () => {
    expect(briefSchema.safeParse({ ...validBrief, headline: "one two three four five six seven eight nine ten eleven twelve thirteen" }).success).toBe(false);
    expect(briefSchema.safeParse({ ...validBrief, hooks: validBrief.hooks.slice(0, 2) }).success).toBe(false);
    expect(briefSchema.safeParse({ ...validBrief, carousel_slides: validBrief.carousel_slides.slice(0, 4) }).success).toBe(false);
  });

  it("rejects slide bodies over 25 words and long X captions", () => {
    const slides = validBrief.carousel_slides.map((s) => ({ ...s, body: "word ".repeat(26) }));
    expect(briefSchema.safeParse({ ...validBrief, carousel_slides: slides }).success).toBe(false);
    expect(briefSchema.safeParse({ ...validBrief, captions: { ...validBrief.captions, x: "x".repeat(281) } }).success).toBe(false);
  });
});

describe("llm helpers", () => {
  it("strips fences and stray text", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nThanks')).toBe('{"a":1}');
  });

  it("parses and validates", () => {
    const parsed = parseJson(briefSchema, `\`\`\`json\n${JSON.stringify(validBrief)}\n\`\`\``);
    expect(parsed.ok).toBe(true);
    expect(parseJson(briefSchema, "{not json").ok).toBe(false);
    expect(parseJson(briefSchema, '{"headline":"x"}').ok).toBe(false);
  });

  it("detects reasoning models", () => {
    expect(isReasoningModel("openai/gpt-oss-120b")).toBe(true);
    expect(isReasoningModel("llama-3.3-70b-versatile")).toBe(false);
  });

  it("uses retry-after when present, otherwise exponential backoff", () => {
    expect(backoffMs(0, new Headers({ "retry-after": "7" }))).toBe(7000);
    expect(backoffMs(2)).toBeGreaterThanOrEqual(8000);
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe("fact checks", () => {
  it("finds numbers missing from the source", () => {
    expect(unsupportedNumbers("Capex hit $52 billion", item.content_text!)).toEqual([]);
    expect(unsupportedNumbers("Revenue grew 33%", item.content_text!)).toEqual(["33"]);
  });

  it("flags unsupported numbers, partial sources and normalises hashtags", () => {
    expect(checkFacts(validBrief, item).needs_verification).toBe(false);
    expect(checkFacts(validBrief, item).hashtags).toContain("#TSMC");
    const bad = { ...validBrief, key_facts: [{ fact: "Margins are 61%", source_url: item.url }] };
    expect(checkFacts(bad, item).needs_verification).toBe(true);
    expect(checkFacts(validBrief, { ...item, content_status: "partial" }).needs_verification).toBe(true);
  });

  it("truncates source text in the user prompt", () => {
    const long = { ...item, content_text: "word ".repeat(5000) };
    const prompt = buildUserPrompt("{{title}}|{{text}}", long, []);
    expect(prompt.startsWith("TSMC raises capex|")).toBe(true);
    expect(prompt.split(" ").length).toBeLessThan(3010);
  });
});

function makeStore(candidates: BriefCandidate[], usage = { calls: 0, tokens: 0 }) {
  const saved: NewBrief[] = [];
  const store: BriefStore = {
    candidates: async () => candidates,
    related: async () => [],
    usageToday: async () => usage,
    saveBrief: async (b) => {
      saved.push(b);
    },
  };
  return { store, saved };
}

const usage = { calls: 1, prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000, model: "m" };
const opts = { maxBriefs: 6, delayMs: 0, dailyCallBudget: 100, dailyTokenBudget: 100_000 };

describe("generateBriefs with a mocked LLM", () => {
  it("briefs top candidates sequentially and records usage", async () => {
    const generate = vi.fn(async (schema: z.ZodType) => ({ data: schema.parse(validBrief), usage })) as unknown as GenerateJson;
    const { store, saved } = makeStore([item, { ...item, id: "i2" }]);
    const result = await generateBriefs(store, { ...opts, generate });
    expect(result).toMatchObject({ briefed: 2, failed: 0, calls: 2, tokens: 2000, stopped: "done" });
    expect(saved.map((b) => b.item_id)).toEqual(["i1", "i2"]);
    expect(saved[0].title).toBe(validBrief.headline);
  });

  it("skips visual-reference sources and caps the count", async () => {
    const generate = vi.fn(async () => ({ data: validBrief, usage })) as unknown as GenerateJson;
    const many = Array.from({ length: 5 }, (_, i) => ({ ...item, id: `i${i}` }));
    const { store } = makeStore([{ ...item, id: "v", source_id: "voronoi" }, ...many]);
    const result = await generateBriefs(store, { ...opts, maxBriefs: 3, generate });
    expect(result.briefed).toBe(3);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("stops gracefully at the daily budget", async () => {
    const generate = vi.fn(async () => ({ data: validBrief, usage })) as unknown as GenerateJson;
    const { store } = makeStore([item, { ...item, id: "i2" }], { calls: 99, tokens: 0 });
    const result = await generateBriefs(store, { ...opts, generate });
    expect(result).toMatchObject({ briefed: 1, stopped: "call_budget" });
  });

  it("isolates a failed item and counts its usage", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("invalid"), { usage: { ...usage, calls: 2, total_tokens: 1500 } }))
      .mockResolvedValueOnce({ data: validBrief, usage }) as unknown as GenerateJson;
    const { store, saved } = makeStore([item, { ...item, id: "i2" }]);
    const result = await generateBriefs(store, { ...opts, generate });
    expect(result).toMatchObject({ briefed: 1, failed: 1, calls: 3, tokens: 2500 });
    expect(saved[0].item_id).toBe("i2");
    expect(result.errors[0]).toMatchObject({ stage: "brief", item_id: "i1" });
  });
});
