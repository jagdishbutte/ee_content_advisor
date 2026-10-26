// Orchestrator: ingest → extract → dedupe → feedback offsets → prescore → brief, inside a time budget.
// Each stage is isolated so one failure is recorded in the run row and the rest still run.
import type { RunError, RunTrigger } from "@/lib/types";
import { errorMessage, log } from "@/lib/logger";
import { sources } from "@/config/sources";
import { pipelineEnv } from "@/lib/env";
import { generateJson } from "@/lib/llm";
import { briefsCreatedSince, briefStore, dedupeStore, extractStore, feedbackStore, ingestStore, prescoreStore, runStore } from "@/lib/repo";
import { sendDigest } from "@/lib/telegram";
import { generateBriefs, type BriefResult } from "./brief";
import { dedupe } from "./dedupe";
import { extract } from "./extract";
import { updateOffsets } from "./feedback";
import { ingest } from "./ingest";
import { prescore } from "./prescore";

export interface RunStore {
  /** True if another run started recently and has not finished. */
  isRunning(): Promise<boolean>;
  start(trigger: RunTrigger): Promise<{ id: string; startedAt: string }>;
  finish(id: string, fields: { stats: Record<string, unknown>; errors: RunError[]; llm_calls: number; llm_tokens: number }): Promise<void>;
}

export interface Stages {
  ingest(): Promise<{ polled: number; fetched: number; inserted: number; errors: RunError[] }>;
  extract(): Promise<{ extracted: number; partial: number; errors: RunError[] }>;
  dedupe(): Promise<{ considered: number; duplicates: number; updated: number }>;
  feedback(): Promise<{ votes: number; offsets: number }>;
  prescore(): Promise<{ scored: number }>;
  brief(deadline: number): Promise<BriefResult>;
  /** Called with the run start time once briefs are done (e.g. Telegram digest). */
  notify(startedAt: string): Promise<unknown>;
}

export interface RunSummary {
  id: string | null;
  skipped?: "already_running";
  stats: Record<string, unknown>;
  errors: RunError[];
  llm_calls: number;
  llm_tokens: number;
}

const STAGES_BEFORE_BRIEF = ["ingest", "extract", "dedupe", "feedback", "prescore"] as const;

export async function runPipeline(trigger: RunTrigger, store: RunStore, stages: Stages, timeBudgetMs: number): Promise<RunSummary> {
  if (await store.isRunning()) {
    log.warn("run.skipped", { reason: "already_running", trigger });
    return { id: null, skipped: "already_running", stats: {}, errors: [], llm_calls: 0, llm_tokens: 0 };
  }
  const deadline = Date.now() + timeBudgetMs;
  const { id, startedAt } = await store.start(trigger);
  const summary: RunSummary = { id, stats: {}, errors: [], llm_calls: 0, llm_tokens: 0 };
  log.info("run.start", { id, trigger });

  try {
    for (const name of STAGES_BEFORE_BRIEF) {
      if (Date.now() > deadline) {
        summary.stats[name] = "skipped: time budget";
        continue;
      }
      await stage(summary, name, () => stages[name]());
    }
    await stage(summary, "brief", async () => {
      const r = await stages.brief(deadline);
      summary.llm_calls = r.calls;
      summary.llm_tokens = r.tokens;
      return r;
    });
    await stage(summary, "notify", () => stages.notify(startedAt));
  } finally {
    await store.finish(id, { stats: summary.stats, errors: summary.errors, llm_calls: summary.llm_calls, llm_tokens: summary.llm_tokens });
    log.info("run.done", { id, stats: summary.stats, errors: summary.errors.length });
  }
  return summary;
}

async function stage(summary: RunSummary, name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    if (result && typeof result === "object" && "errors" in result && Array.isArray(result.errors)) {
      const { errors, ...rest } = result as { errors: RunError[] };
      summary.errors.push(...errors);
      summary.stats[name] = { ...rest, errors: errors.length };
    } else {
      summary.stats[name] = result ?? "ok";
    }
  } catch (err) {
    summary.errors.push({ stage: name, message: errorMessage(err) });
    summary.stats[name] = "failed";
    log.error("run.stage_failed", { stage: name, error: errorMessage(err) });
  }
}

/** Runs the pipeline against Supabase and the configured LLM. Used by the API routes and the CLI script. */
export async function runWithDefaults(trigger: RunTrigger): Promise<RunSummary> {
  const env = pipelineEnv();
  return runPipeline(
    trigger,
    runStore,
    {
      ingest: () => ingest(sources, ingestStore),
      extract: () => extract(extractStore),
      dedupe: () => dedupe(dedupeStore),
      feedback: () => updateOffsets(feedbackStore),
      prescore: () => prescore(prescoreStore),
      brief: (deadline) =>
        generateBriefs(briefStore, {
          generate: generateJson,
          maxBriefs: env.MAX_BRIEFS_PER_RUN,
          delayMs: env.LLM_CALL_DELAY_MS,
          dailyCallBudget: env.LLM_DAILY_CALL_BUDGET,
          dailyTokenBudget: env.LLM_DAILY_TOKEN_BUDGET,
          deadline,
        }),
      notify: async (startedAt) => ({ sent: await sendDigest(await briefsCreatedSince(startedAt), env.APP_BASE_URL) }),
    },
    env.RUN_TIME_BUDGET_MS,
  );
}
