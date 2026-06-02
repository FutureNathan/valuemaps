import type { AxisId } from "./axes";

/** Running total for one axis in a region (so averages stay O(1) to update). */
export interface AxisAgg {
  sum: number;
  n: number;
}

/** Everything we keep for a single region. Only aggregates are stored — never
 * individual responses — which keeps both storage and privacy cheap. */
export interface Aggregate {
  count: number;
  axes: Record<AxisId, AxisAgg>;
  topics: Record<string, number>;
}

export type RegionAggregates = Record<string, Aggregate>;

/** One person's contribution. */
export interface Submission {
  regionId: string;
  axes: Record<AxisId, number>; // each clamped to -100..100
  topics: string[];
}
