import { Redis } from "@upstash/redis";
import { AXES } from "./axes";
import { applySubmission, emptyAggregate } from "./aggregate";
import type { Aggregate, RegionAggregates, Submission } from "./types";

// Storage is optional. If Upstash/Vercel-KV credentials are present we persist
// real responses; otherwise the app runs in demo mode (sample data + the
// visitor's own local vote) so it deploys to Vercel with zero configuration.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;
export const storageEnabled = !!redis;

// Single hash: field = regionId, value = JSON aggregate. One round-trip reads
// the whole map; writes are a read-modify-write of one small field.
const KEY = "vm:agg";

function normalize(v: unknown): Aggregate {
  const base = emptyAggregate();
  const obj = v as Partial<Aggregate> | null;
  if (!obj || typeof obj !== "object") return base;
  base.count = Number(obj.count) || 0;
  for (const a of AXES) {
    const ax = obj.axes?.[a.id];
    if (ax) base.axes[a.id] = { sum: Number(ax.sum) || 0, n: Number(ax.n) || 0 };
  }
  if (obj.topics && typeof obj.topics === "object") {
    for (const [t, c] of Object.entries(obj.topics)) base.topics[t] = Number(c) || 0;
  }
  return base;
}

export async function getAllAggregates(): Promise<RegionAggregates> {
  if (!redis) return {};
  const raw = await redis.hgetall<Record<string, unknown>>(KEY);
  const out: RegionAggregates = {};
  if (raw) for (const [k, v] of Object.entries(raw)) out[k] = normalize(v);
  return out;
}

export async function recordSubmission(sub: Submission): Promise<Aggregate> {
  if (!redis) return applySubmission(emptyAggregate(), sub);
  const existing = await redis.hget<unknown>(KEY, sub.regionId);
  const updated = applySubmission(existing ? normalize(existing) : emptyAggregate(), sub);
  await redis.hset(KEY, { [sub.regionId]: updated });
  return updated;
}
