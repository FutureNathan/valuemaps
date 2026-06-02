import { NextResponse } from "next/server";
import { getAllAggregates, storageEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const regions = await getAllAggregates();
    return NextResponse.json(
      { regions, storage: storageEnabled },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Never break the map because the datastore hiccuped — fall back to demo.
    return NextResponse.json({ regions: {}, storage: false });
  }
}
