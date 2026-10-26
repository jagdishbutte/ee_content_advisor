-- Initial schema for the Elevate Edge content suggestion platform.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table sources (
  id text primary key,
  name text not null,
  type text not null check (type in ('news', 'data', 'visual_reference')),
  url text not null,
  enabled boolean not null default true,
  last_polled_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references sources(id) on delete cascade,
  url text not null unique,
  canonical_url text,
  title text not null,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  author text,
  summary_raw text,
  content_text text,
  content_hash text,
  content_status text not null default 'partial' check (content_status in ('full', 'partial')),
  status text not null default 'new' check (status in ('new', 'scored', 'briefed', 'dismissed')),
  relevance_score numeric,
  score_breakdown jsonb,
  topics text[] not null default '{}',
  cluster_id uuid,
  source_count int not null default 1,
  duplicate_of uuid references items(id) on delete set null,
  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_status_idx on items(status);
create index items_published_at_idx on items(published_at desc);
create index items_content_hash_idx on items(content_hash);
create index items_cluster_id_idx on items(cluster_id);
create index items_source_id_idx on items(source_id);
create index items_relevance_score_idx on items(relevance_score desc);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete set null,
  related_item_ids uuid[] not null default '{}',
  title text not null,
  brief_json jsonb not null,
  recommended_platform text not null check (recommended_platform in ('linkedin', 'instagram', 'x')),
  platform_reason text,
  status text not null default 'suggested'
    check (status in ('suggested', 'selected_for_design', 'designed', 'posted', 'rejected')),
  feedback text check (feedback in ('up', 'down')),
  score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index briefs_status_idx on briefs(status);
create index briefs_created_at_idx on briefs(created_at desc);
create index briefs_item_id_idx on briefs(item_id);

create table runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('cron', 'manual')),
  stats jsonb not null default '{}',
  errors jsonb not null default '[]',
  llm_calls int not null default 0,
  llm_tokens int not null default 0
);

create index runs_started_at_idx on runs(started_at desc);

create table posted_log (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid references briefs(id) on delete set null,
  title text not null,
  platform text not null check (platform in ('linkedin', 'instagram', 'x')),
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index posted_log_posted_at_idx on posted_log(posted_at desc);

-- Feedback-loop score offsets (points added in pre-scoring), recomputed every run.
create table weight_offsets (
  kind text not null check (kind in ('source', 'topic')),
  key text not null,
  "offset" numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);

create trigger sources_updated_at before update on sources for each row execute function set_updated_at();
create trigger items_updated_at before update on items for each row execute function set_updated_at();
create trigger briefs_updated_at before update on briefs for each row execute function set_updated_at();

-- The app only uses the service-role key server-side; RLS on with no policies blocks anon access.
alter table sources enable row level security;
alter table items enable row level security;
alter table briefs enable row level security;
alter table runs enable row level security;
alter table posted_log enable row level security;
alter table weight_offsets enable row level security;
