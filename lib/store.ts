import { Redis } from "@upstash/redis";
import { applySubmission, emptyAggregate } from "./aggregate";
import type { Aggregate, RegionAggregates, Submission } from "./types";

// Storage is optional. With Upstash/Vercel-KV credentials we persist responses;
// otherwise community runs in demo mode (the visitor's own local vote) so the
// app deploys to Vercel with zero configuration.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;
export const storageEnabled = !!redis;

// One hash per world: field = regionId, value = JSON aggregate.
const key = (world: string) => `vm:agg:${world}`;

function normalize(v: unknown): Aggregate {
  const base = emptyAggregate();
  const obj = v as Partial<Aggregate> | null;
  if (!obj || typeof obj !== "object") return base;
  base.count = Number(obj.count) || 0;
  if (obj.wants && typeof obj.wants === "object") {
    for (const [k, c] of Object.entries(obj.wants)) base.wants[k] = Number(c) || 0;
  }
  if (obj.pairs && typeof obj.pairs === "object") {
    for (const [k, c] of Object.entries(obj.pairs)) base.pairs[k] = Number(c) || 0;
  }
  return base;
}

export async function getAllAggregates(world: string): Promise<RegionAggregates> {
  if (!redis) return {};
  const raw = await redis.hgetall<Record<string, unknown>>(key(world));
  const out: RegionAggregates = {};
  if (raw) for (const [k, v] of Object.entries(raw)) out[k] = normalize(v);
  return out;
}

export async function recordSubmission(sub: Submission): Promise<Aggregate> {
  if (!redis) return applySubmission(emptyAggregate(), sub);
  const existing = await redis.hget<unknown>(key(sub.worldId), sub.regionId);
  const updated = applySubmission(existing ? normalize(existing) : emptyAggregate(), sub);
  await redis.hset(key(sub.worldId), { [sub.regionId]: updated });
  return updated;
}
