# Value Maps 🌍

A spinnable 3D globe of **what the world actually cares about**.

Pick your location, set where you stand on a few independent value axes
(economy, society, power, environment, openness), and tell us your top
concerns. Everyone's answers are aggregated per region, so the globe becomes a
living, multi-dimensional "values map" — think a political map, except you can
recolor it by any single axis instead of being squeezed onto one left/right
line.

Inspired by [Hoodmaps](https://levels.io/hoodmaps/) and the look of a
[3D satellite globe](https://earth3dmap.com/3d-globe/) — but cheap to run.

## Why it's cheap to run

- **The globe is a 2D `<canvas>`** drawn with `d3-geo`'s orthographic
  projection — no WebGL, no multi-gigabyte satellite tiles. It loads a single
  ~108 KB country file and renders ~120 KB of JS total.
- **Only aggregates are stored**, never individual responses. A submission is
  an O(1) update of running sums + counts for one region, and the whole map is
  read back in a single round-trip. Storage stays tiny no matter how many
  people vote.
- **It deploys with zero configuration** and runs fully in "demo mode" using
  illustrative sample data + your own local vote. Add a database whenever you
  want real, shared responses.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — it's a standard
   Next.js app, so no settings to change.
3. Done. It works immediately in demo mode.

### Optional: turn on real, shared responses

By default nothing is persisted across visitors. To save and share real
responses, add a serverless Redis (free tiers are plenty). The app reads
either **Upstash** or **Vercel KV** style env vars:

| Variable | |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`  (or `KV_REST_API_URL`)   | REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_TOKEN`) | REST token |

Easiest path on Vercel: **Storage → Marketplace → Upstash Redis** (or any KV
add-on). It injects the env vars for you; redeploy and the footer flips from
"Demo mode" to "Live". Locally, copy `.env.example` to `.env.local` and fill it
in.

## Make it yours

- **Value axes & topics** live in [`lib/axes.ts`](lib/axes.ts). Add, rename, or
  recolor axes and the whole UI (map coloring, legend, sliders, region panel)
  follows automatically.
- **Sample data** is generated deterministically in [`lib/seed.ts`](lib/seed.ts)
  so the map looks alive before real votes arrive. It's clearly badged
  "sample" and can be toggled off in the sidebar.

## How it fits together

```
app/
  page.tsx               renders the client app
  api/aggregate/route.ts GET  — all region aggregates (one read)
  api/submit/route.ts    POST — fold one response into a region
components/
  App.tsx                state, sidebar, search, region panel
  Globe.tsx              canvas globe: drag, pinch/scroll zoom, tap-to-select
  ValueForm.tsx          the "share your values" sliders + concern chips
lib/
  axes.ts colors.ts aggregate.ts seed.ts store.ts types.ts
public/
  countries-110m.json    Natural Earth countries via the world-atlas package
```

Country geometry is from [world-atlas](https://github.com/topojson/world-atlas)
(Natural Earth, public domain).
