import { describe, expect, it, vi } from "vitest";
import { runPipeline, type RunStore, type Stages } from "@/lib/pipeline/run";
import { buildDigest } from "@/lib/telegram";

function makeStore(running = false) {
  const finished: Parameters<RunStore["finish"]>[1][] = [];
  const store: RunStore = {
    isRunning: async () => running,
    start: async () => ({ id: "r1", startedAt: "2026-10-26T00:00:00Z" }),
    finish: async (_id, fields) => {
      finished.push(fields);
    },
  };
  return { store, finished };
}

function makeStages(overrides: Partial<Stages> = {}): Stages {
  return {
    ingest: async () => ({ polled: 2, fetched: 10, inserted: 4, errors: [{ stage: "ingest", source_id: "s1", message: "HTTP 500" }] }),
    extract: async () => ({ extracted: 4, partial: 1, errors: [] }),
    dedupe: async () => ({ considered: 4, duplicates: 1, updated: 2 }),
    feedback: async () => ({ votes: 0, offsets: 0 }),
    prescore: async () => ({ scored: 3 }),
    brief: async () => ({ briefed: 2, failed: 0, calls: 2, tokens: 3000, stopped: "done", errors: [] }),
    notify: async () => ({ sent: true }),
    ...overrides,
  };
}

describe("runPipeline", () => {
  it("runs every stage and records stats, errors and LLM usage", async () => {
    const { store, finished } = makeStore();
    const summary = await runPipeline("cron", store, makeStages(), 60_000);
    expect(summary.stats.ingest).toEqual({ polled: 2, fetched: 10, inserted: 4, errors: 1 });
    expect(summary.stats.prescore).toEqual({ scored: 3 });
    expect(summary).toMatchObject({ id: "r1", llm_calls: 2, llm_tokens: 3000 });
    expect(finished[0].errors).toHaveLength(1);
  });

  it("isolates a failing stage and keeps going", async () => {
    const { store, finished } = makeStore();
    const brief = vi.fn(makeStages().brief);
    const summary = await runPipeline("manual", store, makeStages({ extract: async () => Promise.reject(new Error("boom")), brief }), 60_000);
    expect(summary.stats.extract).toBe("failed");
    expect(summary.errors).toContainEqual({ stage: "extract", message: "boom" });
    expect(brief).toHaveBeenCalled();
    expect(finished).toHaveLength(1);
  });

  it("skips when another run is in progress", async () => {
    const { store, finished } = makeStore(true);
    const summary = await runPipeline("cron", store, makeStages(), 60_000);
    expect(summary.skipped).toBe("already_running");
    expect(finished).toHaveLength(0);
  });

  it("skips remaining stages once the time budget is spent", async () => {
    const { store } = makeStore();
    const summary = await runPipeline("cron", store, makeStages(), -1);
    expect(summary.stats.ingest).toBe("skipped: time budget");
  });
});

describe("telegram digest", () => {
  it("lists briefs with links and escapes HTML", () => {
    const text = buildDigest(
      [
        { id: "b1", title: "AMD <beats> & Nvidia", recommended_platform: "linkedin", score: 81.6 },
        { id: "b2", title: "EV sales", recommended_platform: "x", score: null },
      ],
      "https://app.example.com/",
    );
    expect(text).toContain("2 new briefs");
    expect(text).toContain('<a href="https://app.example.com/briefs/b1">AMD &lt;beats&gt; &amp; Nvidia</a> · LinkedIn · score 82');
    expect(text).toContain("score n/a");
  });
});
