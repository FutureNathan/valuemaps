import { TENSION_PAIRS, WANTS } from "./values";
import type { Aggregate, Submission } from "./types";

const WANT_IDS = new Set(WANTS.map((w) => w.id));

export function emptyAggregate(): Aggregate {
  return { count: 0, wants: {}, pairs: {} };
}

/** Fold one response into a region's tallies. */
export function applySubmission(base: Aggregate, sub: Submission): Aggregate {
  const wants = { ...base.wants };
  const pairs = { ...base.pairs };
  const chosen = new Set(sub.wants.filter((w) => WANT_IDS.has(w)));
  for (const w of chosen) wants[w] = (wants[w] ?? 0) + 1;
  for (const p of TENSION_PAIRS) {
    if (chosen.has(p.a) && chosen.has(p.b)) pairs[p.id] = (pairs[p.id] ?? 0) + 1;
  }
  return { count: base.count + 1, wants, pairs };
}

export function mergeAggregates(a?: Aggregate, b?: Aggregate): Aggregate {
  const out = emptyAggregate();
  for (const src of [a, b]) {
    if (!src) continue;
    out.count += src.count;
    for (const [k, v] of Object.entries(src.wants)) out.wants[k] = (out.wants[k] ?? 0) + v;
    for (const [k, v] of Object.entries(src.pairs)) out.pairs[k] = (out.pairs[k] ?? 0) + v;
  }
  return out;
}

/** Percentage of a region's people who want a given thing (or null if empty). */
export function wantShare(agg: Aggregate | undefined, id: string): number | null {
  if (!agg || !agg.count) return null;
  return ((agg.wants[id] ?? 0) / agg.count) * 100;
}

export function topWants(
  agg: Aggregate | undefined,
  limit = 6
): { id: string; count: number; share: number }[] {
  if (!agg || !agg.count) return [];
  return Object.entries(agg.wants)
    .map(([id, count]) => ({ id, count, share: (count / agg.count) * 100 }))
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}

/** The "you can want both" highlight: the most-endorsed tension pair. */
export function topPair(
  agg: Aggregate | undefined
): { id: string; count: number; share: number } | null {
  if (!agg || !agg.count) return null;
  let best: { id: string; count: number; share: number } | null = null;
  for (const [id, count] of Object.entries(agg.pairs)) {
    if (count > 0 && (!best || count > best.count)) {
      best = { id, count, share: (count / agg.count) * 100 };
    }
  }
  return best;
}
