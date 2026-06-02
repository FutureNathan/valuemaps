import { NextResponse } from "next/server";
import { WANTS, WORLD_IDS } from "@/lib/values";
import { recordSubmission, storageEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WANT_IDS = new Set(WANTS.map((w) => w.id));

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const worldId = String(body?.worldId ?? "earth");
  if (!WORLD_IDS.includes(worldId as (typeof WORLD_IDS)[number])) {
    return NextResponse.json({ ok: false, error: "bad_world" }, { status: 400 });
  }

  const regionId = String(body?.regionId ?? "");
  if (!/^[a-z0-9:_-]{1,32}$/i.test(regionId)) {
    return NextResponse.json({ ok: false, error: "missing_region" }, { status: 400 });
  }

  const wantsIn = Array.isArray(body?.wants) ? (body.wants as unknown[]) : [];
  const wants = Array.from(
    new Set(wantsIn.filter((w): w is string => typeof w === "string" && WANT_IDS.has(w)))
  ).slice(0, WANTS.length);

  try {
    const aggregate = await recordSubmission({ worldId, regionId, wants });
    return NextResponse.json({ ok: true, persisted: storageEnabled, aggregate });
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: "write_failed" }, { status: 500 });
  }
}
