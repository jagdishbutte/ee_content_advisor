// Stage 4: deterministic 0–100 pre-score so only the best items reach the LLM.
// Components (0–1) × config/scoring.ts weights, minus a novelty penalty, plus feedback offsets.
import { pillars as defaultPillars, type Pillar } from "@/config/pillars";
import { scoreWeights, scoring } from "@/config/scoring";
import { getSource } from "@/config/sources";
import { jaccard, titleTokens } from "@/lib/text";
import { log } from "@/lib/logger";

export interface ScoreInput {
  id: string;
  source_id: string;
  title: string;
  content_text: string | null;
  summary_raw: string | null;
  published_at: string | null;
  fetched_at: string;
  source_count: number;
}

export interface ScoreBreakdown {
  pillar: number;
  freshness: number;
  authority: number;
  corroboration: number;
  visual: number;
  novelty_penalty: number;
  feedback: number;
  total: number;
}

export interface Offsets {
  source: Map<string, number>;
  topic: Map<string, number>;
}

export interface ScoreResult {
  id: string;
  relevance_score: number;
  score_breakdown: ScoreBreakdown;
  topics: string[];
}

export interface PrescoreStore {
  itemsToScore(sinceIso: string): Promise<ScoreInput[]>;
  recentTitles(sinceIso: string): Promise<string[]>;
  offsets(): Promise<Offsets>;
  saveScores(results: ScoreResult[]): Promise<void>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countMatches = (text: string, keyword: string) =>
  (text.match(new RegExp(`(?<![a-z0-9])${escape(keyword)}(?![a-z0-9])`, "gi")) ?? []).length;
const round = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Pillar strengths 0–1 (already scaled by pillar weight), strongest first. */
export function matchPillars(title: string, body: string, list: Pillar[] = defaultPillars): { id: string; strength: number }[] {
  const lowerBody = body.slice(0, 20000);
  return list
    .map((p) => {
      const hits = p.keywords.reduce((n, k) => n + 2 * countMatches(title, k) + Math.min(3, countMatches(lowerBody, k)), 0);
      return { id: p.id, strength: Math.min(1, hits / scoring.pillarFullHits) * p.weight };
    })
    .filter((m) => m.strength > 0)
    .sort((a, b) => b.strength - a.strength);
}

export function freshness(publishedAt: string | null, fetchedAt: string, now: Date): number {
  const ageHours = (now.getTime() - new Date(publishedAt ?? fetchedAt).getTime()) / 3600_000;
  return clamp(1 - Math.max(0, ageHours) / scoring.freshnessHours, 0, 1);
}

const NUMBER_RE = /\$\s?\d|\d[\d,.]*\s?(%|percent|billion|million|trillion|bn|gw|mw|twh|nm|x)(?![a-z])/gi;
const CHART_WORDS = /\b(market share|growth|forecast|shipments|capacity|revenue|sales|demand|year[- ]over[- ]year|yoy|ranking|share|record|survey|index|report)\b/i;

/** How chartable/visual the story is: concrete figures and data-ish language. */
export function visualPotential(title: string, body: string): number {
  const numbers = (`${title} ${body.slice(0, 20000)}`.match(NUMBER_RE) ?? []).length;
  const titleNumber = /\d/.test(title) ? 0.2 : 0;
  const chartish = CHART_WORDS.test(`${title} ${body.slice(0, 3000)}`) ? 0.2 : 0;
  return clamp(Math.min(1, numbers / 6) * 0.6 + titleNumber + chartish, 0, 1);
}

export function noveltyPenalty(title: string, recent: Set<string>[]): number {
  const tokens = titleTokens(title);
  return recent.some((r) => jaccard(tokens, r) >= scoring.noveltyThreshold) ? scoring.noveltyPenalty : 0;
}

export function scoreItem(item: ScoreInput, recent: Set<string>[], offsets: Offsets, now: Date): ScoreResult {
  const body = item.content_text ?? item.summary_raw ?? "";
  const matches = matchPillars(item.title, body);
  const source = getSource(item.source_id);
  const components = {
    pillar: matches[0]?.strength ?? 0,
    freshness: freshness(item.published_at, item.fetched_at, now),
    authority: ((source?.authority ?? 1) - 1) / 4,
    corroboration: Math.min(1, (item.source_count - 1) / scoring.corroborationFullSources),
    visual: visualPotential(item.title, body),
  };
  const topics = matches.map((m) => m.id);
  const cap = (n: number) => clamp(n, -scoring.maxOffset, scoring.maxOffset);
  const feedback = cap(offsets.source.get(item.source_id) ?? 0) + (topics[0] ? cap(offsets.topic.get(topics[0]) ?? 0) : 0);
  const penalty = noveltyPenalty(item.title, recent);

  const points = {
    pillar: round(components.pillar * scoreWeights.pillar),
    freshness: round(components.freshness * scoreWeights.freshness),
    authority: round(components.authority * scoreWeights.authority),
    corroboration: round(components.corroboration * scoreWeights.corroboration),
    visual: round(components.visual * scoreWeights.visual),
  };
  const raw = Object.values(points).reduce((a, b) => a + b, 0) - penalty + feedback;
  const total = round(clamp(raw, 0, 100));
  return {
    id: item.id,
    relevance_score: total,
    score_breakdown: { ...points, novelty_penalty: -penalty, feedback: round(feedback), total },
    topics,
  };
}

export async function prescore(store: PrescoreStore, now = new Date()): Promise<{ scored: number }> {
  const day = 24 * 3600_000;
  const [items, titles, offsets] = await Promise.all([
    store.itemsToScore(new Date(now.getTime() - scoring.candidateDays * day).toISOString()),
    store.recentTitles(new Date(now.getTime() - scoring.noveltyDays * day).toISOString()),
    store.offsets(),
  ]);
  const recent = titles.map(titleTokens);
  const results = items.map((i) => scoreItem(i, recent, offsets, now));
  await store.saveScores(results);
  log.info("prescore.done", { scored: results.length, top: results.map((r) => r.relevance_score).sort((a, b) => b - a).slice(0, 5) });
  return { scored: results.length };
}
