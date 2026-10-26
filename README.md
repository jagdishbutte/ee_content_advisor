# Elevate Edge content suggestions

Every 6 hours this app reads trusted news and data feeds about semiconductors, AI, EVs and emerging tech. It
scores the stories and turns the best few into ready-to-design content briefs for LinkedIn, Instagram and X.
You review the briefs in a password-protected dashboard, pick the ones you like, and export them for your designer.

It only reads public RSS/Atom feeds and article pages, and respects robots.txt. It never scrapes Instagram,
LinkedIn or X.

## How it works

```
GitHub Actions (every 6h) ──POST──▶ /api/cron/run
  1. ingest     poll due feeds (config/sources.ts) → items
  2. extract    fetch article text (Readability); falls back to the feed summary ("partial")
  3. dedupe     merge the same story from several outlets into one cluster
  4. feedback   turn your 👍/👎 into small score offsets per source and topic
  5. prescore   rank by pillar match, authority, freshness, corroboration, visual potential, novelty
  6. brief      the LLM frames the top 6 items as briefs (one call each, 3s apart, daily budgets)
  7. notify     optional Telegram digest with links to the new briefs
```

Each run is logged in the `runs` table, which you can see on the dashboard's Sources page. A failing source or
article is recorded and skipped, and the run carries on.

## 1. Run it locally

You need Node.js 20+ and free accounts on [Supabase](https://supabase.com) and [Groq](https://console.groq.com).
Any OpenAI-compatible API works in place of Groq.

```bash
npm install
cp env.example .env.local     # then fill in the values (see below)
```

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API. Use the **service_role** secret key, never the anon/publishable key. |
| `LLM_API_KEY` | Groq console → API Keys. |
| `LLM_BASE_URL`, `LLM_MODEL` | Keep the Groq defaults, or point them at another OpenAI-compatible provider. |
| `DASHBOARD_PASSWORD` | Any password you choose. |
| `CRON_SECRET` | Random string of at least 16 characters, e.g. `openssl rand -hex 32`. |
| `TELEGRAM_*` | Optional, see [Telegram](#5-telegram-digest-optional). |
| `APP_BASE_URL` | `http://localhost:3000` locally, your Vercel URL in production. |

**Create the database.** In Supabase, open SQL Editor, paste the contents of
`supabase/migrations/20261026000000_init.sql` and click Run. If you use the Supabase CLI, run `supabase db push` instead.

**Load the sources and start the app:**

```bash
npm run seed            # copies config/sources.ts into the sources table (safe to re-run)
npm run dev             # http://localhost:3000, log in with DASHBOARD_PASSWORD
npm run pipeline        # run the whole pipeline once from your terminal
```

The dashboard's **Sources → Run now** button does the same as `npm run pipeline`.

Optional: `npm run discover-feeds` finds the RSS feed for each source and writes `config/feeds.json`. Sources it
can't verify are disabled and listed in PLAN.md under "Manual sources".

## 2. Use the dashboard

- **Briefs** shows new suggestions as cards. You can filter by status, platform and topic, and sort by score or date.
- Click a headline to see the full brief: hooks, key facts with source links, carousel slides, a chart idea,
  captions for each platform, hashtags and the score breakdown. Every section has a copy button.
- Actions: **Select for design**, **Reject**, 👍/👎 (this teaches the scorer) and **Mark posted** (logs the post so
  similar stories score lower for 30 days).
- **Selected** lists the briefs you picked, with a one-click markdown export for the designer.
- A brief marked **Needs verification** used only a feed summary, or quotes a number that the article doesn't
  contain. Check it before posting.

## 3. Deploy to Vercel

1. Push this repo to GitHub, then on [vercel.com](https://vercel.com) choose **Add New → Project** and import it.
2. Under **Environment Variables**, add every variable from your `.env.local`, with `APP_BASE_URL` set to the
   Vercel URL (e.g. `https://ee-content.vercel.app`).
3. Deploy. The cron route allows up to 300 seconds (`maxDuration`). On the Hobby plan that limit needs Fluid
   Compute, which is on by default for new projects.

## 4. Schedule runs with GitHub Actions

`.github/workflows/pipeline.yml` calls the app every 6 hours (`0 */6 * * *`, UTC). In GitHub, open
**Settings → Secrets and variables → Actions** and add:

- `APP_URL`: your Vercel URL
- `CRON_SECRET`: the same value as in Vercel

To test it, open **Actions → Content pipeline → Run workflow**. A 409 response means a run was already in progress.

## 5. Telegram digest (optional)

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot` and copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message. Then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy
   `message.chat.id` (a number) into `TELEGRAM_CHAT_ID`. Use the chat id, not the bot's username.
3. After each run that creates briefs, the bot sends you their titles and dashboard links.

## Tuning

| What | Where |
|---|---|
| Sources, poll frequency, authority | `config/sources.ts` (then `npm run seed`) |
| Topics (pillars) and their keywords | `config/pillars.ts` |
| Score weights, novelty, feedback strength | `config/scoring.ts` |
| Brief style and rules | `prompts/frame-brief.md` |
| Briefs per run, LLM delay and daily budgets | env vars (`MAX_BRIEFS_PER_RUN`, `LLM_*`) |

## Development

```bash
npm run lint && npm run typecheck && npm test
```

Code map: `lib/pipeline/*` holds one file per stage (pure logic behind small store interfaces, so tests need no
database). `lib/repo.ts` is the Supabase side, `lib/llm.ts` is the only LLM client, `app/` is the dashboard and API
routes, and `tests/` holds the Vitest tests.
