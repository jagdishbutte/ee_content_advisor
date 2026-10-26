// Supabase queries and mutations used by the dashboard pages and brief action routes.
import { db, must } from "./db";
import type { Brief } from "./brief-schema";
import type { BriefRow, BriefStatus, ContentStatus, Feedback, Platform, RunRow, SourceRow } from "./types";

export interface BriefItem {
  source_id: string;
  url: string;
  canonical_url: string | null;
  topics: string[];
  score_breakdown: Record<string, number> | null;
  published_at: string | null;
  content_status: ContentStatus;
}

export type DashboardBrief = Omit<BriefRow, "brief_json"> & { brief_json: Brief; item: BriefItem | null };

export interface BriefFilters {
  status?: BriefStatus | "all";
  platform?: Platform;
  topic?: string;
  sort?: "score" | "new";
}

const BRIEF_SELECT = "*, item:items(source_id, url, canonical_url, topics, score_breakdown, published_at, content_status)";
const LIST_LIMIT = 100;

export async function listBriefs(filters: BriefFilters = {}): Promise<DashboardBrief[]> {
  let query = db().from("briefs").select(BRIEF_SELECT);
  const status = filters.status ?? "suggested";
  if (status !== "all") query = query.eq("status", status);
  if (filters.platform) query = query.eq("recommended_platform", filters.platform);
  query = filters.sort === "new"
    ? query.order("created_at", { ascending: false })
    : query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const rows = must(await query.limit(LIST_LIMIT), "load briefs") as DashboardBrief[];
  return filters.topic ? rows.filter((b) => b.item?.topics.includes(filters.topic!)) : rows;
}

export async function getBrief(id: string): Promise<DashboardBrief | null> {
  const res = await db().from("briefs").select(BRIEF_SELECT).eq("id", id).maybeSingle();
  return must(res, "load brief") as DashboardBrief | null;
}

export async function setBriefStatus(id: string, status: BriefStatus): Promise<void> {
  must(await db().from("briefs").update({ status }).eq("id", id), "update brief status");
}

export async function setBriefFeedback(id: string, feedback: Feedback | null): Promise<void> {
  must(await db().from("briefs").update({ feedback }).eq("id", id), "update brief feedback");
}

/** Marks the brief posted and records it in posted_log (used for novelty checks). */
export async function markPosted(id: string, platform: Platform): Promise<boolean> {
  const brief = must(await db().from("briefs").select("title").eq("id", id).maybeSingle(), "load brief") as { title: string } | null;
  if (!brief) return false;
  must(await db().from("briefs").update({ status: "posted" }).eq("id", id), "mark brief posted");
  must(await db().from("posted_log").insert({ brief_id: id, title: brief.title, platform }), "insert posted_log");
  return true;
}

export async function listSourceRows(): Promise<SourceRow[]> {
  return must(await db().from("sources").select("id, name, type, url, enabled, last_polled_at, last_status, last_error"), "load sources") as SourceRow[];
}

export async function recentRuns(limit = 10): Promise<RunRow[]> {
  const res = await db().from("runs").select("*").order("started_at", { ascending: false }).limit(limit);
  return must(res, "load runs") as RunRow[];
}
