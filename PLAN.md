# Elevate Edge — Automatic Content Suggestion Platform

Pulls items from configured sources every 6 hours, ranks them for the Elevate Edge Consulting page
(semiconductors, AI, EV, emerging tech), and turns the best ones into design-ready content briefs with a
recommended platform (LinkedIn / Instagram / X). A single user reviews briefs in a dashboard and picks
which go to design. Designing and posting stay manual.

## Architecture

```
GitHub Actions (cron 0 */6 * * *, workflow_dispatch)
        │  POST /api/cron/run  (Authorization: Bearer CRON_SECRET)
        ▼
Next.js on Vercel ──► lib/pipeline/orchestrator.ts
                         1. ingest    (rss-parser / robots-checked page fallback)
                         2. extract   (fetch + Readability/jsdom, timeout + size cap)
                         3. dedupe    (URL / content hash, Jaccard title clusters)
                         4. prescore  (pillars, freshness, authority, corroboration, visual, novelty, feedback)
                         5. brief     (lib/llm.ts → OpenAI-compatible endpoint, Zod-validated JSON)
                         6. platform  (LLM recommendation, deterministic fallback)
                         7. notify    (Telegram digest)
        │
        ▼
Supabase Postgres (sources, items, briefs, runs, posted_log, weight_offsets)
        ▲
Dashboard (App Router, password cookie via middleware) — list, filters, detail, actions, export, sources, run-now
```

- `lib/llm.ts` is the only module that talks to the LLM (official `openai` package, any OpenAI-compatible base URL;
  default Groq + `openai/gpt-oss-120b`).
- Every stage is a plain function that takes its inputs and a small `Db` interface, so stages are unit-testable
  without a database or network.
- All network calls use `lib/http.ts` (User-Agent, timeout, size cap, retries with backoff, robots.txt check).

## Folder structure

```
app/                     Next.js routes (dashboard pages + API routes)
  api/cron/run           cron-triggered pipeline (Bearer CRON_SECRET)
  api/run-now            dashboard-triggered pipeline
  api/briefs/[id]        brief status / feedback / mark-posted actions
  api/login, api/logout  dashboard password cookie
  briefs/[id]            brief detail page
  selected               "Selected for design" view + markdown export
  sources                source status + Run now
  login                  password form
components/              UI components (shadcn/ui in components/ui)
config/                  sources.ts, feeds.json (generated), pillars.ts, scoring.ts
lib/                     env, http, robots, url, db, llm, logger, telegram
lib/pipeline/            ingest, extract, dedupe, prescore, brief, platform, notify, feedback, orchestrator
prompts/                 frame-brief.md (system), frame-brief-user.md (user template)
scripts/                 discover-feeds.ts, seed.ts, run-pipeline.ts
supabase/migrations/     SQL migrations
tests/                   Vitest unit tests
.github/workflows/       pipeline.yml
```

## Database schema

| table | columns |
|---|---|
| `sources` | id text pk, name, type, url, enabled, last_polled_at, last_status, last_error, created_at, updated_at |
| `items` | id uuid pk, source_id → sources, url unique, canonical_url, title, published_at, fetched_at, author, summary_raw, content_text, content_hash, content_status (`full`/`partial`), status (`new`/`scored`/`briefed`/`dismissed`), relevance_score, score_breakdown jsonb, topics text[], cluster_id uuid, source_count int, duplicate_of uuid, created_at, updated_at |
| `briefs` | id uuid pk, item_id (nullable), related_item_ids uuid[], title, brief_json jsonb, recommended_platform, platform_reason, status (`suggested`/`selected_for_design`/`designed`/`posted`/`rejected`), feedback (`up`/`down`/null), score, created_at, updated_at |
| `runs` | id uuid pk, started_at, finished_at, trigger (`cron`/`manual`), stats jsonb, errors jsonb, llm_calls int, llm_tokens int |
| `posted_log` | id uuid pk, brief_id (nullable), title, platform, posted_at, created_at |
| `weight_offsets` | kind (`source`/`topic`), key, offset numeric, updated_at — pk (kind, key) |

Indexes: items(status), items(published_at), items(content_hash), items(cluster_id), items(source_id),
briefs(status), briefs(created_at), briefs(item_id), runs(started_at), posted_log(posted_at).

## Environment variables

| var | purpose | default |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | database (server-side only) | — |
| `LLM_API_KEY` | OpenAI-compatible API key | — |
| `LLM_BASE_URL` | endpoint | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | main model | `openai/gpt-oss-120b` |
| `LLM_FALLBACK_MODEL` | used when the main model keeps failing | (none) |
| `LLM_CALL_DELAY_MS` | delay between sequential LLM calls | `3000` |
| `MAX_BRIEFS_PER_RUN` | top-scored items sent to the LLM per run | `6` |
| `LLM_DAILY_CALL_BUDGET`, `LLM_DAILY_TOKEN_BUDGET` | stop briefing gracefully when reached | `100`, `150000` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | digest | — (skipped if unset) |
| `DASHBOARD_PASSWORD` | dashboard login | — |
| `CRON_SECRET` | protects `/api/cron/run` | — |
| `APP_BASE_URL` | dashboard link in Telegram digest | `http://localhost:3000` |

## Phases

- [x] 1. Project setup, folder structure, Tailwind/shadcn, env handling, DB migrations, seed
- [x] 2. Source config, feed discovery script, and ingestion with error isolation
- [x] 3. Article extraction, dedupe, URL normalisation
- [x] 4. Pre-scoring with configurable pillars and weights, and tests
- [x] 5. LLM brief generation with prompts, Zod validation, retry, and cost limits
- [x] 6. Platform recommender (LLM + deterministic fallback)
- [x] 7. Dashboard (list, filters, detail, actions, export, sources page, run-now)
- [x] 8. Orchestrator, protected cron route, GitHub Actions workflow, Telegram digest
- [x] 9. Feedback loop, README with setup/deploy instructions, final cleanup

After each phase: `npm run lint`, `npm run typecheck`, `npm test`, tick the box, commit.

## Assumptions

- LLM overrides apply: `openai` npm package against an OpenAI-compatible endpoint (Groq by default), one item per
  call, sequential with a delay, max 6 briefs/run, article text truncated to ~3,000 words, daily call/token budgets
  tracked in `runs`. No Anthropic SDK.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`; the dashboard password check lives in `proxy.ts`.
- The env template is `env.example` (creating dot-env files is blocked in this workspace); copy it to `.env.local`.
- Discovered feed URLs are written to `config/feeds.json` by `scripts/discover-feeds.ts`; `config/sources.ts`
  merges it, so sources.ts stays the single place to edit sources and the script never rewrites TypeScript.
- Data and visual-reference sources are polled on their configured frequency; visual-reference sources only
  contribute links/titles as inspiration (never graphics) and are never sent to the LLM for briefs.
- "Due" = `every_run` always; `daily` if last poll > 20h ago; `weekly` if > 6.5 days ago (tolerates cron jitter).
- Near-duplicate threshold: Jaccard ≥ 0.5 on normalised title tokens (stop words removed) within 72 hours. The
  cluster lead is the highest-authority item; others get `duplicate_of` and only add corroboration.
- Novelty: Jaccard ≥ 0.45 against `posted_log` and briefs of the last 30 days → penalty.
- Dashboard auth is a single password; the cookie stores an HMAC of the password, so changing the env value logs
  everyone out.
- Vercel function `maxDuration` = 300s; the orchestrator also keeps its own time budget (default 270s) and stops
  briefing early rather than being killed mid-write.
- Only items with status `scored` from the last 7 days are candidates for briefs; items already briefed are skipped.
- If the LLM output fails validation twice, the item is left as `scored` (retried next run) and the error is logged.
- Pre-scoring does the selecting; the LLM frames the top `MAX_BRIEFS_PER_RUN` items (one call each) rather than
  choosing among many, which keeps calls and tokens low.
- `lib/llm.ts` requests `json_schema` output and switches to `json_object` for the rest of the process if the
  endpoint rejects it; Zod validation always runs either way.
- Briefs from `partial` (feed-summary-only) items always get `needs_verification: true`.
- Platform fallback rules: fresh (≤12h) announcement-style news with no data angle → X; data source or chart
  with numeric facts and no business angle → Instagram; business/policy keywords → LinkedIn; otherwise LinkedIn.
  The LLM's pick is kept when present; a secondary equal to the primary is replaced by the rules.
- Feedback offsets are capped at ±10 score points per source and per pillar.

- Feedback: each net 👍 (minus 👎) adds 2 points to that brief's source and main topic (first pillar), clamped to
  ±10. Offsets are recomputed from all votes at the start of every run, so un-voting undoes the effect.

## Manual sources

Result of `npm run discover-feeds` on 2026-10-26. These sources are disabled automatically and need a manual check:

| source | reason |
|---|---|
| HPCwire | homepage returns 403 to bots; no feed could be verified |
| The Register — Data Centre | robots.txt is default-deny for crawlers not explicitly allowed |
| WEF publications | 403 to bots; fallback page not allowed |
| Voronoi | no feed found (visual reference) |
| IEA Data & Statistics | no feed (visual reference) |
| WEF Infographics (stories) | 403 to bots (visual reference) |

Sources without a feed that use the robots-permitted news-page fallback: SIA, TrendForce, IEA (news),
Stanford HAI (news), IFR. Re-run `npm run discover-feeds -- <id>` to re-check one source.

## Risks

- Several sites block bots or are behind Cloudflare; their feeds may fail intermittently → isolated per source.
- Free-tier LLM rate limits (requests/tokens per minute and per day) → sequential calls, delay, budgets, 429 backoff.
- Vercel Hobby function time limits → time budget in the orchestrator; small per-run caps.
- Paywalled sources (SemiAnalysis, parts of EE Times) → feed summary only, flagged `partial`.
- LLM may still state unsupported numbers → prompt forbids it, `needs_verification` flags, plus a check that
  flags key facts whose numbers do not appear in the source text.

## Known limitations / next steps

- Topic matching uses keywords, not embeddings, so the scorer misses articles that use unusual wording.
- Dedupe compares normalised URLs and title similarity. A rewritten story with a very different headline stays separate.
- The number check flags figures that are missing from the source. It cannot catch a wrong claim that uses only correct numbers.
- Paywalled and bot-blocking sources contribute only feed summaries, which are flagged `partial`.
- One shared dashboard password, with no user accounts or audit trail.
- The dashboard topic filter runs after the 100-row query limit. With very large backlogs it can miss older briefs.
- Next steps: an engagement-metrics import (from manual entry or official platform APIs) to tune the weights,
  image generation for the chart ideas, and per-user logins.
