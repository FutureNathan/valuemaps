import { Redis } from "@upstash/redis";
import { applySubmission, emptyAggregate } from "./aggregate";
import type { Aggregate, RegionAggregates, Submission } from "./types";

// Storage is optional and pluggable. Priority: Supabase → Upstash → demo mode
// (the visitor's own local vote only). The app deploys with zero config and
// upgrades to shared, persistent responses once you add credentials.

// --- Supabase (REST / PostgREST — no SDK dependency) ---
// Project URL is pre-wired (it's public, not a secret); env vars still override.
// You only need to set SUPABASE_SERVICE_ROLE_KEY to go live.
const supaUrl = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://frlfegdrniztuoijlpny.supabase.co"
).replace(/\/$/, "");
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
const supaOn = !!(supaUrl && supaKey);
const TABLE = "value_aggregates";

// --- Upstash / Vercel KV (fallback) ---
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisTok = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = !supaOn && redisUrl && redisTok ? new Redis({ url: redisUrl, token: redisTok }) : null;

export const storageEnabled = supaOn || !!redis;
export const storageBackend = supaOn ? "supabase" : redis ? "upstash" : "none";

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

// ---------- Supabase helpers ----------
function supaHeaders(extra?: Record<string, string>) {
  return {
    apikey: supaKey,
    Authorization: `Bearer ${supaKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supaGetAll(world: string): Promise<RegionAggregates> {
  const u = `${supaUrl}/rest/v1/${TABLE}?select=region,data&world=eq.${encodeURIComponent(world)}`;
  const r = await fetch(u, { headers: supaHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  const rows = (await r.json()) as { region: string; data: unknown }[];
  const out: RegionAggregates = {};
  for (const row of rows) out[row.region] = normalize(row.data);
  return out;
}

async function supaGetOne(world: string, region: string): Promise<Aggregate | null> {
  const u = `${supaUrl}/rest/v1/${TABLE}?select=data&world=eq.${encodeURIComponent(
    world
  )}&region=eq.${encodeURIComponent(region)}&limit=1`;
  const r = await fetch(u, { headers: supaHeaders(), cache: "no-store" });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  const rows = (await r.json()) as { data: unknown }[];
  return rows.length ? normalize(rows[0].data) : null;
}

async function supaUpsert(world: string, region: string, data: Aggregate) {
  const r = await fetch(`${supaUrl}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: supaHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ world, region, data, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
}

// ---------- Public API ----------
export async function getAllAggregates(world: string): Promise<RegionAggregates> {
  if (supaOn) return supaGetAll(world);
  if (redis) {
    const raw = await redis.hgetall<Record<string, unknown>>(key(world));
    const out: RegionAggregates = {};
    if (raw) for (const [k, v] of Object.entries(raw)) out[k] = normalize(v);
    return out;
  }
  return {};
}

export async function recordSubmission(sub: Submission): Promise<Aggregate> {
  if (supaOn) {
    const existing = await supaGetOne(sub.worldId, sub.regionId);
    const updated = applySubmission(existing ?? emptyAggregate(), sub);
    await supaUpsert(sub.worldId, sub.regionId, updated);
    return updated;
  }
  if (redis) {
    const existing = await redis.hget<unknown>(key(sub.worldId), sub.regionId);
    const updated = applySubmission(existing ? normalize(existing) : emptyAggregate(), sub);
    await redis.hset(key(sub.worldId), { [sub.regionId]: updated });
    return updated;
  }
  return applySubmission(emptyAggregate(), sub);
}
