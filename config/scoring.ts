// Pre-score weights (points). Components are 0–1 and multiplied by these; they sum to 100.
// The novelty penalty and feedback offsets are applied afterwards and the total is clamped to 0–100.

export const scoreWeights = {
  pillar: 35,
  freshness: 20,
  authority: 15,
  corroboration: 15,
  visual: 15,
};

export const scoring = {
  /** Freshness decays linearly from 1 (just published) to 0 at this age. */
  freshnessHours: 72,
  /** Keyword hits needed (title hits count double) for a full pillar match. */
  pillarFullHits: 4,
  /** Extra sources (beyond the first) needed for full corroboration. */
  corroborationFullSources: 3,
  /** Story similar to something briefed/posted in this window gets penalised. */
  noveltyDays: 30,
  noveltyThreshold: 0.45,
  noveltyPenalty: 30,
  /** Feedback offsets per source and per pillar are capped at ±this many points. */
  maxOffset: 10,
  /** Score points each net thumbs up (or down) adds to (or removes from) its source and main topic. */
  pointsPerVote: 2,
  /** Items older than this are not (re)scored. */
  candidateDays: 7,
};
