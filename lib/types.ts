// Row shapes for the Supabase tables (see supabase/migrations).

export type SourceType = "news" | "data" | "visual_reference";
export type ItemStatus = "new" | "scored" | "briefed" | "dismissed";
export type ContentStatus = "full" | "partial";
export type Platform = "linkedin" | "instagram" | "x";
export type BriefStatus = "suggested" | "selected_for_design" | "designed" | "posted" | "rejected";
export type Feedback = "up" | "down";
export type RunTrigger = "cron" | "manual";

export interface SourceRow {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  enabled: boolean;
  last_polled_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export interface ItemRow {
  id: string;
  source_id: string;
  url: string;
  canonical_url: string | null;
  title: string;
  published_at: string | null;
  fetched_at: string;
  author: string | null;
  summary_raw: string | null;
  content_text: string | null;
  content_hash: string | null;
  content_status: ContentStatus;
  status: ItemStatus;
  relevance_score: number | null;
  score_breakdown: Record<string, number> | null;
  topics: string[];
  cluster_id: string | null;
  source_count: number;
  duplicate_of: string | null;
  extracted_at: string | null;
}

export interface BriefRow {
  id: string;
  item_id: string | null;
  related_item_ids: string[];
  title: string;
  brief_json: unknown;
  recommended_platform: Platform;
  platform_reason: string | null;
  status: BriefStatus;
  feedback: Feedback | null;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: RunTrigger;
  stats: Record<string, unknown>;
  errors: RunError[];
  llm_calls: number;
  llm_tokens: number;
}

export interface RunError {
  stage: string;
  source_id?: string;
  item_id?: string;
  message: string;
}

export interface PostedLogRow {
  id: string;
  brief_id: string | null;
  title: string;
  platform: Platform;
  posted_at: string;
}

export interface WeightOffsetRow {
  kind: "source" | "topic";
  key: string;
  offset: number;
}
