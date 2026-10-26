// Supabase implementations of the small store interfaces each pipeline stage depends on.
import { db, must } from "./db";
import type { IngestStore, NewItem } from "./pipeline/ingest";
import type { Extraction, ExtractStore, PendingItem } from "./pipeline/extract";
import type { ClusterUpdate, DedupeItem, DedupeStore } from "./pipeline/dedupe";
import type { Offsets, PrescoreStore, ScoreInput, ScoreResult } from "./pipeline/prescore";
import type { BriefCandidate, BriefStore, NewBrief, RelatedItem } from "./pipeline/brief";
import type { FeedbackStore, Vote } from "./pipeline/feedback";
import type { RunStore } from "./pipeline/run";
import type { DigestBrief } from "./telegram";
import { scoring } from "@/config/scoring";

export const ingestStore: IngestStore = {
  async lastPolled() {
    const rows = must(await db().from("sources").select("id, last_polled_at"), "load sources");
    return new Map(rows.map((r) => [r.id as string, r.last_polled_at as string | null]));
  },

  async insertItems(items: NewItem[]) {
    if (items.length === 0) return 0;
    const res = await db().from("items").upsert(items, { onConflict: "url", ignoreDuplicates: true }).select("id");
    return must(res, "insert items").length;
  },

  async markSource(id, status, error) {
    must(
      await db().from("sources").update({ last_polled_at: new Date().toISOString(), last_status: status, last_error: error }).eq("id", id),
      "update source",
    );
  },
};

export const extractStore: ExtractStore = {
  async pendingItems(limit) {
    const res = await db()
      .from("items")
      .select("id, source_id, url, title, summary_raw")
      .is("extracted_at", null)
      .order("fetched_at", { ascending: false })
      .limit(limit);
    return must(res, "load pending items") as PendingItem[];
  },

  async saveExtraction(id, e: Extraction) {
    must(await db().from("items").update({ ...e, extracted_at: new Date().toISOString() }).eq("id", id), "save extraction");
  },
};

export const dedupeStore: DedupeStore = {
  async recentItems(sinceIso) {
    const res = await db()
      .from("items")
      .select("id, source_id, title, canonical_url, content_hash, published_at, fetched_at, cluster_id, duplicate_of, source_count")
      .not("extracted_at", "is", null)
      .gte("fetched_at", sinceIso);
    return must(res, "load recent items") as DedupeItem[];
  },

  async saveClusters(updates: ClusterUpdate[]) {
    for (const { id, ...fields } of updates) {
      must(await db().from("items").update(fields).eq("id", id), "save cluster");
    }
  },
};

export const prescoreStore: PrescoreStore = {
  async itemsToScore(sinceIso) {
    const res = await db()
      .from("items")
      .select("id, source_id, title, content_text, summary_raw, published_at, fetched_at, source_count")
      .in("status", ["new", "scored"])
      .is("duplicate_of", null)
      .not("extracted_at", "is", null)
      .gte("fetched_at", sinceIso);
    return must(res, "load items to score") as ScoreInput[];
  },

  // Titles already briefed or posted recently; similar new stories get a novelty penalty.
  async recentTitles(sinceIso) {
    const [briefed, posted] = await Promise.all([
      db().from("items").select("title").eq("status", "briefed").gte("fetched_at", sinceIso),
      db().from("posted_log").select("title").gte("posted_at", sinceIso),
    ]);
    return [...must(briefed, "load briefed titles"), ...must(posted, "load posted titles")].map((r) => r.title as string);
  },

  async offsets() {
    const rows = must(await db().from("weight_offsets").select('kind, key, "offset"'), "load offsets");
    const out: Offsets = { source: new Map(), topic: new Map() };
    for (const r of rows) out[r.kind as "source" | "topic"].set(r.key as string, Number(r.offset));
    return out;
  },

  async saveScores(results: ScoreResult[]) {
    for (const { id, ...fields } of results) {
      must(await db().from("items").update({ ...fields, status: "scored" }).eq("id", id), "save score");
    }
  },
};

export const briefStore: BriefStore = {
  async candidates(limit) {
    const since = new Date(Date.now() - scoring.candidateDays * 86_400_000).toISOString();
    const res = await db()
      .from("items")
      .select("id, source_id, url, canonical_url, title, content_text, summary_raw, content_status, relevance_score, published_at, topics, cluster_id")
      .eq("status", "scored")
      .is("duplicate_of", null)
      .gte("fetched_at", since)
      .order("relevance_score", { ascending: false })
      .limit(limit);
    return (must(res, "load brief candidates") as BriefCandidate[]).map((c) => ({ ...c, relevance_score: Number(c.relevance_score) }));
  },

  async related(clusterId, excludeId) {
    const res = await db().from("items").select("id, source_id, url").eq("cluster_id", clusterId).neq("id", excludeId);
    return must(res, "load related items") as RelatedItem[];
  },

  async usageToday() {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const rows = must(await db().from("runs").select("llm_calls, llm_tokens").gte("started_at", midnight.toISOString()), "load usage");
    return rows.reduce((acc, r) => ({ calls: acc.calls + Number(r.llm_calls), tokens: acc.tokens + Number(r.llm_tokens) }), { calls: 0, tokens: 0 });
  },

  async saveBrief(brief: NewBrief) {
    must(await db().from("briefs").insert(brief), "insert brief");
    must(await db().from("items").update({ status: "briefed" }).eq("id", brief.item_id), "mark item briefed");
  },
};

// A run older than this without finished_at is treated as crashed, so it can't block new runs forever.
const STALE_RUN_MS = 15 * 60_000;

export const runStore: RunStore = {
  async isRunning() {
    const since = new Date(Date.now() - STALE_RUN_MS).toISOString();
    const rows = must(await db().from("runs").select("id").is("finished_at", null).gte("started_at", since).limit(1), "check running runs");
    return rows.length > 0;
  },

  async start(trigger) {
    const row = must(await db().from("runs").insert({ trigger }).select("id, started_at").single(), "start run") as { id: string; started_at: string };
    return { id: row.id, startedAt: row.started_at };
  },

  async finish(id, fields) {
    must(await db().from("runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", id), "finish run");
  },
};

export async function briefsCreatedSince(sinceIso: string, limit = 10): Promise<DigestBrief[]> {
  const res = await db()
    .from("briefs")
    .select("id, title, recommended_platform, score")
    .gte("created_at", sinceIso)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (must(res, "load new briefs") as DigestBrief[]).map((b) => ({ ...b, score: b.score === null ? null : Number(b.score) }));
}

export const feedbackStore: FeedbackStore = {
  async votes() {
    const res = await db().from("briefs").select("feedback, item:items(source_id, topics)").not("feedback", "is", null);
    const rows = must(res, "load feedback") as unknown as { feedback: Vote["feedback"]; item: { source_id: string; topics: string[] } | null }[];
    return rows.filter((r) => r.item).map((r) => ({ feedback: r.feedback, source_id: r.item!.source_id, topics: r.item!.topics ?? [] }));
  },

  async replaceOffsets(rows) {
    must(await db().from("weight_offsets").delete().in("kind", ["source", "topic"]), "clear offsets");
    if (rows.length > 0) must(await db().from("weight_offsets").insert(rows), "save offsets");
  },
};
