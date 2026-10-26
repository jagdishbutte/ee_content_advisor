// Stage 3: group items about the same story. Exact duplicates (canonical URL / content hash) and
// near-duplicates (Jaccard on title tokens) form one cluster; the highest-authority item leads it,
// the others point at it via duplicate_of, and source_count records corroboration.
import { getSource } from "@/config/sources";
import { jaccard, titleTokens } from "@/lib/text";
import { log } from "@/lib/logger";

export const NEAR_DUP_THRESHOLD = 0.5;
export const DEDUPE_WINDOW_HOURS = 72;

export interface DedupeItem {
  id: string;
  source_id: string;
  title: string;
  canonical_url: string | null;
  content_hash: string | null;
  published_at: string | null;
  fetched_at: string;
  cluster_id: string | null;
  duplicate_of: string | null;
  source_count: number;
}

export interface ClusterUpdate {
  id: string;
  cluster_id: string;
  duplicate_of: string | null;
  source_count: number;
}

export interface DedupeStore {
  recentItems(sinceIso: string): Promise<DedupeItem[]>;
  saveClusters(updates: ClusterUpdate[]): Promise<void>;
}

const authority = (sourceId: string) => getSource(sourceId)?.authority ?? 1;
const time = (i: DedupeItem) => new Date(i.published_at ?? i.fetched_at).getTime();

/** Pure clustering; returns updates only for items whose cluster fields change. */
export function clusterItems(items: DedupeItem[], threshold = NEAR_DUP_THRESHOLD): ClusterUpdate[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  const tokens = items.map((i) => titleTokens(i.title));
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const x = items[a];
      const y = items[b];
      const exact =
        (!!x.canonical_url && x.canonical_url === y.canonical_url) || (!!x.content_hash && x.content_hash === y.content_hash);
      if (exact || jaccard(tokens[a], tokens[b]) >= threshold) union(a, b);
    }
  }

  const groups = new Map<number, DedupeItem[]>();
  items.forEach((item, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  });

  const updates: ClusterUpdate[] = [];
  for (const members of groups.values()) {
    const lead = [...members].sort((a, b) => authority(b.source_id) - authority(a.source_id) || time(a) - time(b))[0];
    const sourceCount = new Set(members.map((m) => m.source_id)).size;
    for (const m of members) {
      const next: ClusterUpdate = { id: m.id, cluster_id: lead.id, duplicate_of: m.id === lead.id ? null : lead.id, source_count: sourceCount };
      if (m.cluster_id !== next.cluster_id || m.duplicate_of !== next.duplicate_of || m.source_count !== next.source_count) updates.push(next);
    }
  }
  return updates;
}

export async function dedupe(store: DedupeStore, now = new Date()): Promise<{ considered: number; duplicates: number; updated: number }> {
  const since = new Date(now.getTime() - DEDUPE_WINDOW_HOURS * 3600_000).toISOString();
  const items = await store.recentItems(since);
  const updates = clusterItems(items);
  await store.saveClusters(updates);
  const duplicates = items.filter((i) => (updates.find((u) => u.id === i.id) ?? i).duplicate_of).length;
  log.info("dedupe.done", { considered: items.length, duplicates, updated: updates.length });
  return { considered: items.length, duplicates, updated: updates.length };
}
