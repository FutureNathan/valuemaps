import { AXES, type AxisId } from "./axes";
import type { Aggregate, Submission } from "./types";

export function emptyAggregate(): Aggregate {
  const axes = {} as Aggregate["axes"];
  for (const a of AXES) axes[a.id] = { sum: 0, n: 0 };
  return { count: 0, axes, topics: {} };
}

function clampAxis(v: number | undefined): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

/** Fold a single response into a region's running totals. */
export function applySubmission(base: Aggregate, sub: Submission): Aggregate {
  const next: Aggregate = {
    count: base.count + 1,
    axes: {} as Aggregate["axes"],
    topics: { ...base.topics },
  };
  for (const a of AXES) {
    const cur = base.axes[a.id] ?? { sum: 0, n: 0 };
    next.axes[a.id] = { sum: cur.sum + clampAxis(sub.axes[a.id]), n: cur.n + 1 };
  }
  for (const t of sub.topics) next.topics[t] = (next.topics[t] ?? 0) + 1;
  return next;
}

/** Combine two aggregates (e.g. server data + the visitor's own pending vote). */
export function mergeAggregates(a?: Aggregate, b?: Aggregate): Aggregate {
  const out = emptyAggregate();
  for (const src of [a, b]) {
    if (!src) continue;
    out.count += src.count;
    for (const ax of AXES) {
      const s = src.axes[ax.id];
      if (s) {
        out.axes[ax.id].sum += s.sum;
        out.axes[ax.id].n += s.n;
      }
    }
    for (const [t, c] of Object.entries(src.topics)) out.topics[t] = (out.topics[t] ?? 0) + c;
  }
  return out;
}

export function axisAverage(agg: Aggregate | undefined, axis: AxisId): number | null {
  const a = agg?.axes[axis];
  if (!a || a.n === 0) return null;
  return a.sum / a.n;
}

export function topTopics(agg: Aggregate | undefined, limit = 5): { topic: string; count: number }[] {
  if (!agg) return [];
  return Object.entries(agg.topics)
    .map(([topic, count]) => ({ topic, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}
