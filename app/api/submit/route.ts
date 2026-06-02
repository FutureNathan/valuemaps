import { NextResponse } from "next/server";
import { AXES, MAX_TOPICS, TOPICS } from "@/lib/axes";
import { recordSubmission, storageEnabled } from "@/lib/store";
import type { Submission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const regionId = String(body?.regionId ?? "").slice(0, 8);
  if (!/^\d+$/.test(regionId)) {
    return NextResponse.json({ ok: false, error: "missing_region" }, { status: 400 });
  }

  const axesIn = (body?.axes ?? {}) as Record<string, unknown>;
  const axes = {} as Submission["axes"];
  for (const a of AXES) {
    const raw = Number(axesIn[a.id]);
    axes[a.id] = Number.isFinite(raw) ? Math.max(-100, Math.min(100, Math.round(raw))) : 0;
  }

  const topicsIn = Array.isArray(body?.topics) ? (body.topics as unknown[]) : [];
  const topics = topicsIn
    .filter((t): t is string => typeof t === "string" && TOPICS.includes(t))
    .slice(0, MAX_TOPICS);

  try {
    const aggregate = await recordSubmission({ regionId, axes, topics });
    return NextResponse.json({ ok: true, persisted: storageEnabled, aggregate });
  } catch {
    return NextResponse.json({ ok: false, persisted: false, error: "write_failed" }, { status: 500 });
  }
}
