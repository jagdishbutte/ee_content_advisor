// Feedback loop: thumbs up/down on briefs nudge future pre-scores for the same source and main topic.
// Offsets are recomputed from all votes each run, so changing or clearing a vote is reflected next time.
import { scoring } from "@/config/scoring";
import type { Feedback } from "@/lib/types";

export interface Vote {
  feedback: Feedback;
  source_id: string;
  topics: string[];
}

export interface OffsetRow {
  kind: "source" | "topic";
  key: string;
  offset: number;
}

export interface FeedbackStore {
  votes(): Promise<Vote[]>;
  /** Replaces every stored offset with these rows. */
  replaceOffsets(rows: OffsetRow[]): Promise<void>;
}

export function computeOffsets(votes: Vote[], pointsPerVote = scoring.pointsPerVote, max = scoring.maxOffset): OffsetRow[] {
  const net = { source: new Map<string, number>(), topic: new Map<string, number>() };
  const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n);
  for (const v of votes) {
    const n = v.feedback === "up" ? 1 : -1;
    add(net.source, v.source_id, n);
    // Pre-scoring applies the topic offset to an item's main (first) topic, so votes count there too.
    if (v.topics[0]) add(net.topic, v.topics[0], n);
  }
  return (["source", "topic"] as const).flatMap((kind) =>
    [...net[kind]]
      .filter(([, n]) => n !== 0)
      .map(([key, n]) => ({ kind, key, offset: Math.max(-max, Math.min(max, n * pointsPerVote)) })),
  );
}

export async function updateOffsets(store: FeedbackStore): Promise<{ votes: number; offsets: number }> {
  const votes = await store.votes();
  const rows = computeOffsets(votes);
  await store.replaceOffsets(rows);
  return { votes: votes.length, offsets: rows.length };
}
