# Value Maps 🌍🌑🔴

A spinnable 3D globe of **what the world actually wants** — without forcing
anyone onto a left–right line.

Instead of opposing sliders, the platform asks one honest question: **"What do
you want for where you live?"** — and lets you pick *every* hope you hold, even
ones the usual framing says you must choose between (a thriving environment **and**
a booming economy; personal freedom **and** strong community). When you pick a
pair like that, the map celebrates it and shows how many of your neighbours
agree — because most "either/or" debates are false choices.

You can recolor the globe by different **data sources**:

- **Community** — what people here say they want (one map per hope: "share who
  want a thriving environment", etc.).
- **World Happiness** — life evaluations and their drivers.
- **Cultural values** — Hofstede's six dimensions of national culture.
- **Human Development** — UNDP's Human Development Index.

…and you can travel to **other worlds**. Tap the faint Moon or Mars drifting in
the background and the globe becomes that world — pick named regions (Tranquility
Base, Olympus Mons, Jezero Crater…) and say what *those* places should stand for.

Inspired by [Hoodmaps](https://levels.io/hoodmaps/) and the look of a
[3D satellite globe](https://earth3dmap.com/3d-globe/), with cool, optimistic
space vibes — and cheap to run.

## Why it's cheap to run

- **The globe is a 2D `<canvas>`** drawn with `d3-geo`'s orthographic
  projection — no WebGL, no satellite tiles. ~124 KB of JS total.
- **Only anonymous tallies are stored** for community responses (how many people
  want each thing, plus a few "both/and" co-endorsement counts) — O(1) updates,
  one round-trip reads a whole world.
- **Reference data is pre-joined at build time** into one ~18 KB JSON; no
  third-party calls at runtime.
- **Zero-config deploy.** Everything works out of the box; community responses
  upgrade from "your own local vote" to "shared & persistent" when you add a
  database.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Deploy to Vercel

Push to GitHub → import at [vercel.com/new](https://vercel.com/new). Standard
Next.js app — nothing to configure.

### Optional: shared community responses (Supabase)

By default community responses live only in your own browser. To save & share
them across everyone, connect a free database. **Supabase** is the easy path:

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql) — it
   creates one `value_aggregates` table.
3. Open **Project Settings → API** and set two environment variables (on Vercel:
   *Project → Settings → Environment Variables*; locally: `.env.local`):

   | Variable | Where to find it |
   | --- | --- |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key — **secret, server-only** |

4. Redeploy. The sidebar footer flips from "demo mode" to "live".

The service-role key is used only server-side (in the API routes) and bypasses
row-level security, so the table stays private. Each world is stored separately,
and only anonymous tallies are written — never individual answers.

Prefer Redis? Upstash / Vercel KV also work — set `UPSTASH_REDIS_REST_URL` +
`UPSTASH_REDIS_REST_TOKEN` (or the `KV_*` equivalents) instead.

### Social preview

Link previews (iMessage, WhatsApp, Twitter, Slack…) use a generated share card,
star favicon and apple-touch-icon. They resolve to absolute URLs automatically on
Vercel; for a custom domain, set `NEXT_PUBLIC_SITE_URL=https://yourdomain`.
Regenerate the card and icons with `npm run build:images`.

## The reference data

`public/reference-data.json` is **generated and committed** by
[`scripts/build-data.mjs`](scripts/build-data.mjs), which pulls from open,
widely-cited sources and joins them to the globe's country ids:

| Layer | Source |
| --- | --- |
| World Happiness | [World Happiness Report 2024](https://worldhappiness.report/) |
| Cultural values | [Hofstede dimension data](https://geerthofstede.com/research-and-vsm/dimension-data-matrix/) |
| Human Development | [UNDP HDI 2022](https://hdr.undp.org/data-center) |
| Country crosswalk | [`datasets/country-codes`](https://github.com/datasets/country-codes) |

Refresh anytime with `npm run build:data`. The reference layers are convenience
snapshots for visualization — for authoritative figures, consult the sources
above.

## Make it yours

- **The "wants"** (and the "you can want both" tension pairs) live in
  [`lib/values.ts`](lib/values.ts). Add or rephrase a hope and the form, maps,
  legend and panel all follow.
- **Worlds** (Earth/Moon/Mars, their colors and named regions) live in
  [`lib/worlds.ts`](lib/worlds.ts). Add a moon of Jupiter if you like.
- **Data sources & color scales** live in [`lib/sources.ts`](lib/sources.ts).

## How it fits together

```
app/
  page.tsx               renders the client app
  api/aggregate/route.ts GET  ?world=… community tallies (one read)
  api/submit/route.ts    POST a response (worldId + regionId + wants)
components/
  App.tsx                state, world switching, sidebar, search, panels
  Globe.tsx              canvas globe: drag/zoom/tap, starfield, background worlds
  ValueForm.tsx          the "what do you want?" cards
lib/
  values.ts worlds.ts sources.ts colors.ts aggregate.ts store.ts types.ts
scripts/
  build-data.mjs         fetches + joins the reference datasets
  build-images.mjs       renders the OG share card + icons
  build-bodies.mjs       renders shaded Earth/Moon/Mars planet images
supabase/
  schema.sql             one-table schema for shared responses
public/
  countries-110m.json    Natural Earth countries (world-atlas)
  reference-data.json     generated reference data (committed)
  body-*.png             shaded planet images for the travel bodies
```

Country geometry is from [world-atlas](https://github.com/topojson/world-atlas)
(Natural Earth, public domain). Lunar/Martian regions are hand-placed at
approximate real coordinates. Planet textures for the travel bodies are from
[threex.planets](https://github.com/jeromeetienne/threex.planets) (Planet Pixel
Emporium), projected to spheres at build time.
