import { NextResponse } from "next/server";
import { getAllAggregates, storageBackend, storageEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick connection check — visit /api/health to confirm the datastore is wired
// up without having to submit anything.
export async function GET() {
  const base = { ok: true, storage: storageEnabled, backend: storageBackend };
  if (!storageEnabled) {
    return NextResponse.json({ ...base, connected: false }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const regions = await getAllAggregates("earth");
    return NextResponse.json(
      { ...base, connected: true, earthRegions: Object.keys(regions).length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { ...base, connected: false, error: String(e).slice(0, 200) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
