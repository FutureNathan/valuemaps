import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort "where are you?" guess from Vercel's edge geolocation headers
// (set automatically on Vercel; absent locally). No permission prompt — it's a
// coarse IP guess the visitor can override by picking another place. We return
// lat/lng so the client can match it to a country polygon it already has.
export async function GET(req: Request) {
  const h = req.headers;
  const latRaw = h.get("x-vercel-ip-latitude");
  const lngRaw = h.get("x-vercel-ip-longitude");
  const lat = latRaw ? Number(latRaw) : null;
  const lng = lngRaw ? Number(lngRaw) : null;
  return NextResponse.json(
    {
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
      country: h.get("x-vercel-ip-country"),
      city: h.get("x-vercel-ip-city"),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
