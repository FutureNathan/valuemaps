# Value Maps 🌍

A spinnable 3D globe of **what the world cares about** — and how that compares to
real, reputable data.

Switch between **data sources** to recolor the globe:

- **Community** — what people on this site have shared about their own values
  (five independent axes: economy, society, power, environment, openness).
- **World Happiness** — life evaluations and their drivers (freedom, social
  support, generosity).
- **Cultural values** — Hofstede's six dimensions of national culture
  (individualism, power distance, long-term focus…).
- **Human Development** — UNDP's Human Development Index.

Think a political map, except you pick the lens — one independent axis at a
time — and you can hold the platform's own responses up against established
research. Inspired by [Hoodmaps](https://levels.io/hoodmaps/) and the look of a
[3D satellite globe](https://earth3dmap.com/3d-globe/), but cheap to run.

## Why it's cheap to run

- **The globe is a 2D `<canvas>`** drawn with `d3-geo`'s orthographic
  projection — no WebGL, no satellite tiles. ~122 KB of JS total.
- **Reference data is pre-joined at build time** to a single ~18 KB JSON, so
  the client does zero data wrangling and makes no third-party calls at runtime.
- **Only aggregates are stored** for community responses — an O(1) update of
  running sums + counts per region — so storage stays tiny.
- **Zero-config deploy.** Reference layers work out of the box; community
  responses upgrade from "your own local vote" to "shared & persistent" when you
  add a database.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Vercel

Push to GitHub → import at [vercel.com/new](https://vercel.com/new). It's a
standard Next.js app — nothing to configure.

### Optional: shared community responses

By default community responses aren't shared across visitors. To persist them,
add a serverless Redis (free tiers are plenty). The app reads either Upstash or
Vercel KV style env vars:

| Variable | |
| --- | --- |
| `UPSTASH_REDIS_REST_URL`  (or `KV_REST_API_URL`)   | REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_TOKEN`) | REST token |

On Vercel: **Storage → Marketplace → Upstash Redis** injects these for you.
Locally, copy `.env.example` to `.env.local`. The sidebar footer flips from
"demo mode" to "live" once it's connected.

## The reference data

`public/reference-data.json` is **generated and committed** by
[`scripts/build-data.mjs`](scripts/build-data.mjs), which pulls from openly
available, widely-cited sources and joins them to the globe's country ids:

| Layer | Source | Notes |
| --- | --- | --- |
| World Happiness | [World Happiness Report 2024](https://worldhappiness.report/) | ladder score + factor breakdown |
| Cultural values | [Hofstede dimension data](https://geerthofstede.com/research-and-vsm/dimension-data-matrix/) | 6 dimensions of national culture |
| Human Development | [UNDP HDI 2022](https://hdr.undp.org/data-center) | health, education, income |
| Country crosswalk | [`datasets/country-codes`](https://github.com/datasets/country-codes) | ISO numeric ↔ alpha-3 ↔ name |

Refresh the snapshot any time:

```bash
npm run build:data
```

It prints per-source coverage so you can see how many countries matched. (Tiny
states like Singapore and Malta aren't in the 110m globe geometry, so they're
skipped.) The committed JSON is what ships, so deploys never depend on those
upstreams being reachable.

> The reference layers are convenience snapshots for visualization. For
> authoritative, up-to-date figures, always consult the original sources linked
> above.

## Make it yours

- **Add a data source or metric:** add a fetch+parse block in
  `scripts/build-data.mjs`, then describe it (labels, colors, domain) in
  [`lib/sources.ts`](lib/sources.ts). The selector, legend, coloring and region
  panel all follow automatically.
- **Community value axes & topics** live in [`lib/axes.ts`](lib/axes.ts).

## How it fits together

```
app/
  page.tsx               renders the client app
  api/aggregate/route.ts GET  — community aggregates (one read)
  api/submit/route.ts    POST — fold one response into a region
components/
  App.tsx                state, sidebar, source/metric selectors, search
  Globe.tsx              canvas globe: drag, pinch/scroll zoom, tap-to-select
  ValueForm.tsx          the "share your values" sliders + concern chips
lib/
  sources.ts             data-source + metric definitions, color scales
  axes.ts colors.ts aggregate.ts store.ts types.ts
scripts/
  build-data.mjs         fetches + joins the reference datasets
public/
  countries-110m.json    Natural Earth countries (world-atlas)
  reference-data.json    generated reference data (committed)
```

Country geometry is from [world-atlas](https://github.com/topojson/world-atlas)
(Natural Earth, public domain).
