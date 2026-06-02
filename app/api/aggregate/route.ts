import { NextResponse } from "next/server";
import { WORLD_IDS } from "@/lib/values";
import { getAllAggregates, storageBackend, storageEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const world = url.searchParams.get("world") ?? "earth";
  if (!WORLD_IDS.includes(world as (typeof WORLD_IDS)[number])) {
    return NextResponse.json(
      { regions: {}, storage: storageEnabled, backend: storageBackend },
      { status: 400 }
    );
  }
  try {
    const regions = await getAllAggregates(world);
    return NextResponse.json(
      { regions, storage: storageEnabled, backend: storageBackend },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ regions: {}, storage: false, backend: "none" });
  }
}
