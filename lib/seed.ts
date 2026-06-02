import { AXES, TOPICS, type AxisId } from "./axes";
import type { Aggregate } from "./types";

// Deterministic sample data so the globe is colorful and explorable before any
// real responses exist. Values are derived purely from a region's id, so a
// country always shows the same illustrative profile. This is clearly labelled
// as "sample" in the UI and is replaced the moment real responses come in.

function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, Aggregate>();

export function sampleAggregate(regionId: string): Aggregate {
  const cached = cache.get(regionId);
  if (cached) return cached;

  const rand = mulberry32(xmur3("valuemaps:" + regionId));
  const n = 5 + Math.floor(rand() * 25);

  const axes = {} as Record<AxisId, { sum: number; n: number }>;
  for (const a of AXES) {
    // average of two uniforms -> gentle bell curve centered near 0
    const mean = ((rand() + rand()) / 2 - 0.5) * 2; // -1..1
    const value = Math.round(mean * 85);
    axes[a.id] = { sum: value * n, n };
  }

  const topics: Record<string, number> = {};
  const pool = [...TOPICS];
  const picks = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < picks && pool.length; i++) {
    const t = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    topics[t] = 1 + Math.floor(rand() * n);
  }

  const agg: Aggregate = { count: n, axes, topics };
  cache.set(regionId, agg);
  return agg;
}
