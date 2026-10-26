// Stage 5: turn the top-scored items into content briefs, one LLM call per item, sequentially,
// with a delay between calls and daily call/token budgets so free-tier limits are never blown.
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSource } from "@/config/sources";
import { briefSchema, type Brief } from "@/lib/brief-schema";
import type { GenerateJson, LlmUsage } from "@/lib/llm";
import type { ContentStatus, Platform, RunError } from "@/lib/types";
import { sleep } from "@/lib/http";
import { truncateWords } from "@/lib/text";
import { applyPlatform } from "./platform";
import { errorMessage, log } from "@/lib/logger";

export const MAX_SOURCE_WORDS = 3000;
const CALL_TIME_MARGIN_MS = 45_000; // don't start a call that might not finish before the deadline

export interface BriefCandidate {
  id: string;
  source_id: string;
  url: string;
  canonical_url: string | null;
  title: string;
  content_text: string | null;
  summary_raw: string | null;
  content_status: ContentStatus;
  relevance_score: number;
  published_at: string | null;
  topics: string[];
  cluster_id: string | null;
}

export interface RelatedItem {
  id: string;
  source_id: string;
  url: string;
}

export interface NewBrief {
  item_id: string;
  related_item_ids: string[];
  title: string;
  brief_json: Brief;
  recommended_platform: Platform;
  platform_reason: string | null;
  score: number;
}

export interface BriefStore {
  /** Scored, non-duplicate items from the last few days, highest score first. */
  candidates(limit: number): Promise<BriefCandidate[]>;
  related(clusterId: string, excludeId: string): Promise<RelatedItem[]>;
  /** LLM calls and tokens already used today (UTC) by earlier runs. */
  usageToday(): Promise<{ calls: number; tokens: number }>;
  saveBrief(brief: NewBrief): Promise<void>;
}

export interface BriefOptions {
  generate: GenerateJson;
  maxBriefs: number;
  delayMs: number;
  dailyCallBudget: number;
  dailyTokenBudget: number;
  /** Epoch ms after which no new call is started. */
  deadline?: number;
}

export interface BriefResult {
  briefed: number;
  failed: number;
  calls: number;
  tokens: number;
  stopped: "done" | "call_budget" | "token_budget" | "time_budget";
  errors: RunError[];
}

const promptCache = new Map<string, string>();
export function loadPrompt(name: string): string {
  let text = promptCache.get(name);
  if (!text) {
    text = readFileSync(path.join(process.cwd(), "prompts", name), "utf8").trim();
    promptCache.set(name, text);
  }
  return text;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function buildUserPrompt(template: string, item: BriefCandidate, related: RelatedItem[]): string {
  const text = item.content_text || item.summary_raw || item.title;
  return renderTemplate(template, {
    title: item.title,
    source: getSource(item.source_id)?.name ?? item.source_id,
    url: item.canonical_url ?? item.url,
    published: item.published_at ?? "unknown",
    topics: item.topics.join(", ") || "none",
    content_status: item.content_status === "full" ? "full article" : "feed summary only (set needs_verification true)",
    related: related.map((r) => getSource(r.source_id)?.name ?? r.source_id).join(", ") || "none",
    text: truncateWords(text, MAX_SOURCE_WORDS),
  });
}

const numberPattern = /\d[\d,]*(?:\.\d+)?/g;
const normaliseNumber = (n: string) => n.replace(/,/g, "");

/** Numbers in a fact that do not appear anywhere in the source text. */
export function unsupportedNumbers(fact: string, source: string): string[] {
  const available = new Set((source.match(numberPattern) ?? []).map(normaliseNumber));
  return (fact.match(numberPattern) ?? []).map(normaliseNumber).filter((n) => !available.has(n));
}

/** Forces needs_verification when the source was partial or a key fact cites numbers not in the source. */
export function checkFacts(brief: Brief, item: BriefCandidate): Brief {
  const source = `${item.title} ${item.content_text ?? ""} ${item.summary_raw ?? ""}`;
  const unsupported = brief.key_facts.some((f) => unsupportedNumbers(f.fact, source).length > 0);
  const hashtags = brief.hashtags.map((h) => (h.startsWith("#") ? h : `#${h.replace(/\s+/g, "")}`));
  return { ...brief, hashtags, needs_verification: brief.needs_verification || unsupported || item.content_status === "partial" };
}

export async function generateBriefs(store: BriefStore, opts: BriefOptions): Promise<BriefResult> {
  const result: BriefResult = { briefed: 0, failed: 0, calls: 0, tokens: 0, stopped: "done", errors: [] };
  const candidates = (await store.candidates(opts.maxBriefs * 3))
    .filter((c) => getSource(c.source_id)?.type !== "visual_reference")
    .slice(0, opts.maxBriefs);
  const used = await store.usageToday();
  const system = loadPrompt("frame-brief.md");
  const template = loadPrompt("frame-brief-user.md");

  for (const [i, item] of candidates.entries()) {
    if (used.calls + result.calls >= opts.dailyCallBudget) result.stopped = "call_budget";
    else if (used.tokens + result.tokens >= opts.dailyTokenBudget) result.stopped = "token_budget";
    else if (opts.deadline && Date.now() > opts.deadline - CALL_TIME_MARGIN_MS) result.stopped = "time_budget";
    if (result.stopped !== "done") break;
    if (i > 0) await sleep(opts.delayMs);

    const related = item.cluster_id ? await store.related(item.cluster_id, item.id) : [];
    try {
      const { data, usage } = await opts.generate(briefSchema, system, buildUserPrompt(template, item, related));
      addUsage(result, usage);
      const brief = applyPlatform(checkFacts(data, item), item);
      await store.saveBrief({
        item_id: item.id,
        related_item_ids: related.map((r) => r.id),
        title: brief.headline,
        brief_json: brief,
        recommended_platform: brief.recommended_platform,
        platform_reason: brief.platform_reason,
        score: item.relevance_score,
      });
      result.briefed++;
    } catch (err) {
      addUsage(result, (err as { usage?: LlmUsage }).usage);
      result.failed++;
      result.errors.push({ stage: "brief", item_id: item.id, message: errorMessage(err) });
      log.warn("brief.item_failed", { item: item.id, error: errorMessage(err) });
    }
  }
  if (result.stopped !== "done") log.warn("brief.stopped", { reason: result.stopped, used, run: { calls: result.calls, tokens: result.tokens } });
  log.info("brief.done", { ...result, errors: result.errors.length });
  return result;
}

function addUsage(result: BriefResult, usage?: LlmUsage) {
  if (!usage) return;
  result.calls += usage.calls;
  result.tokens += usage.total_tokens;
}
