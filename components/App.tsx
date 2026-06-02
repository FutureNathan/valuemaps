"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import { geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import Globe, { type BackgroundBody, type FocusTarget } from "./Globe";
import ValueForm from "./ValueForm";
import { TENSION_PAIRS, WANT_BY_ID } from "@/lib/values";
import {
  WORLDS,
  WORLD_BY_ID,
  regionCentroids,
  regionFeatures,
  regionNames,
} from "@/lib/worlds";
import {
  SOURCES,
  SOURCE_BY_ID,
  formatValue,
  legendGradient,
  metricColor,
  normalizedPosition,
  type DataSource,
  type Metric,
} from "@/lib/sources";
import {
  applySubmission,
  emptyAggregate,
  mergeAggregates,
  topPair,
  topWants,
  wantShare,
} from "@/lib/aggregate";
import type { Aggregate, RegionAggregates, Submission } from "@/lib/types";

type Country = Feature<Geometry, GeoJsonProperties>;
type ReferenceData = Record<string, Record<string, Record<string, number>>>;
type EarthGeo = { features: Country[]; borders: Geometry; names: Map<string, string>; centroids: Map<string, [number, number]> };
const STORAGE_KEY = "valuemaps:v2";

interface LocalState {
  submission: Submission;
  persisted: boolean;
}

export default function App() {
  const earthRef = useRef<EarthGeo | null>(null);

  const [worldId, setWorldId] = useState("earth");
  const [features, setFeatures] = useState<Country[]>([]);
  const [borders, setBorders] = useState<Geometry | null>(null);
  const namesRef = useRef<Map<string, string>>(new Map());
  const centroidsRef = useRef<Map<string, [number, number]>>(new Map());
  const [geoVersion, setGeoVersion] = useState(0);

  const [serverByWorld, setServerByWorld] = useState<Record<string, RegionAggregates>>({});
  const [storageLive, setStorageLive] = useState(false);
  const [backend, setBackend] = useState("none");
  const [local, setLocal] = useState<LocalState | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData>({});

  const [sourceId, setSourceId] = useState("happiness");
  const [metricId, setMetricId] = useState("ladder");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [overlay, setOverlay] = useState(0.5);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const worldIdRef = useRef(worldId);
  worldIdRef.current = worldId;
  const loadedWorlds = useRef<Set<string>>(new Set(["earth"]));
  const prefsLoaded = useRef(false);
  const headDrag = useRef<{ x: number; y: number } | null>(null);

  const world = WORLD_BY_ID[worldId];
  const availableSources = world.hasReference ? SOURCES : SOURCES.filter((s) => s.kind === "community");
  const source = SOURCE_BY_ID[sourceId] ?? SOURCE_BY_ID.community;
  const metric = source.metrics.find((m) => m.id === metricId) ?? source.metrics[0];

  const applyWorldGeo = useCallback((id: string) => {
    const w = WORLD_BY_ID[id];
    if (w.kind === "countries") {
      const e = earthRef.current;
      if (!e) {
        setFeatures([]);
        setBorders(null);
        namesRef.current = new Map();
        centroidsRef.current = new Map();
        setGeoVersion((v) => v + 1);
        return;
      }
      setFeatures(e.features);
      setBorders(e.borders);
      namesRef.current = e.names;
      centroidsRef.current = e.centroids;
    } else {
      setFeatures(regionFeatures(w));
      setBorders(null);
      namesRef.current = regionNames(w);
      centroidsRef.current = regionCentroids(w);
    }
    setGeoVersion((v) => v + 1);
  }, []);

  const loadAggregates = useCallback((id: string) => {
    fetch(`/api/aggregate?world=${id}`)
      .then((r) => r.json())
      .then((d) => {
        setServerByWorld((prev) => ({ ...prev, [id]: d.regions || {} }));
        setStorageLive(!!d.storage);
        setBackend(d.backend || "none");
      })
      .catch(() => {});
  }, []);

  // One-time loads: Earth geometry, reference data, the saved vote, and Earth's aggregates.
  useEffect(() => {
    fetch("/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => {
        const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<
          Geometry,
          GeoJsonProperties
        >;
        const feats = fc.features as Country[];
        const names = new Map<string, string>();
        const cents = new Map<string, [number, number]>();
        for (const f of feats) {
          const id = String(f.id);
          names.set(id, (f.properties?.name as string) || id);
          cents.set(id, geoCentroid(f) as [number, number]);
        }
        earthRef.current = {
          features: feats,
          borders: mesh(topo, topo.objects.countries, (a, b) => a !== b) as Geometry,
          names,
          centroids: cents,
        };
        if (worldIdRef.current === "earth") applyWorldGeo("earth");
      })
      .catch(() => {});

    fetch("/reference-data.json")
      .then((r) => r.json())
      .then((d) => setReferenceData(d.data || {}))
      .catch(() => {});

    loadAggregates("earth");

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLocal(JSON.parse(raw) as LocalState);
    } catch {}
    try {
      const prefs = JSON.parse(localStorage.getItem("valuemaps:prefs") || "{}");
      if (typeof prefs.satellite === "boolean") setSatellite(prefs.satellite);
      if (typeof prefs.overlay === "number") setOverlay(prefs.overlay);
      if (typeof prefs.autoRotate === "boolean") setAutoRotate(prefs.autoRotate);
    } catch {}
    prefsLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const realFor = useCallback(
    (id: string): Aggregate | undefined => {
      const server = serverByWorld[worldId]?.[id];
      let mine: Aggregate | undefined;
      if (
        local &&
        !local.persisted &&
        local.submission.worldId === worldId &&
        local.submission.regionId === id
      ) {
        mine = applySubmission(emptyAggregate(), local.submission);
      }
      if (!server && !mine) return undefined;
      return mergeAggregates(server, mine);
    },
    [serverByWorld, worldId, local]
  );

  const valueFor = useCallback(
    (id: string, mId: string): number | null => {
      if (source.kind === "community") return wantShare(realFor(id), mId);
      const v = referenceData[sourceId]?.[id]?.[mId];
      return typeof v === "number" ? v : null;
    },
    [source.kind, sourceId, referenceData, realFor]
  );

  const colorForId = useCallback(
    (id: string) => metricColor(metric, valueFor(id, metric.id)),
    [metric, valueFor]
  );

  const pickSource = useCallback((id: string) => {
    setSourceId(id);
    setMetricId(SOURCE_BY_ID[id].metrics[0].id);
  }, []);

  const switchWorld = useCallback(
    (id: string) => {
      if (id === worldId || !WORLD_BY_ID[id]) return;
      const w = WORLD_BY_ID[id];
      setWorldId(id);
      setSelectedId(null);
      setQuery("");
      setFocus(null);
      setSourceId(w.defaultSource);
      setMetricId(SOURCE_BY_ID[w.defaultSource].metrics[0].id);
      applyWorldGeo(id);
      if (!loadedWorlds.current.has(id)) {
        loadedWorlds.current.add(id);
        loadAggregates(id);
      }
    },
    [worldId, applyWorldGeo, loadAggregates]
  );

  const goTo = useCallback((id: string) => {
    setSelectedId(id);
    const c = centroidsRef.current.get(id);
    if (c) setFocus({ lng: c[0], lat: c[1], nonce: Date.now() });
    setQuery("");
    setSidebarOpen(true);
  }, []);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setSidebarOpen(true);
  }, []);

  const handleSubmit = useCallback(async (sub: Submission) => {
    let persisted = false;
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      const data = await res.json();
      persisted = !!data.persisted;
      if (data.ok && persisted && data.aggregate) {
        setServerByWorld((prev) => ({
          ...prev,
          [sub.worldId]: { ...(prev[sub.worldId] || {}), [sub.regionId]: data.aggregate },
        }));
      }
    } catch {
      // offline / no datastore — kept locally below
    }
    const ls: LocalState = { submission: sub, persisted };
    setLocal(ls);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ls));
    } catch {}
    setFormOpen(false);
    setSelectedId(sub.regionId);
    setSidebarOpen(true);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { id: string; name: string }[];
    const out: { id: string; name: string }[] = [];
    namesRef.current.forEach((name, id) => {
      if (name.toLowerCase().includes(q)) out.push({ id, name });
    });
    return out
      .sort((a, b) => {
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      })
      .slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, geoVersion]);

  useEffect(() => setActiveIdx(0), [query]);

  // Remember UI preferences across visits.
  useEffect(() => {
    if (!prefsLoaded.current) return;
    try {
      localStorage.setItem("valuemaps:prefs", JSON.stringify({ satellite, overlay, autoRotate }));
    } catch {}
  }, [satellite, overlay, autoRotate]);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[Math.max(0, Math.min(results.length - 1, activeIdx))];
      if (r) {
        goTo(r.id);
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === "Escape") {
      setQuery("");
    }
  }

  // Mobile bottom-sheet: swipe up/down to open/close, tap to toggle.
  function onHeadPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".collapse-btn")) return;
    headDrag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onHeadPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = headDrag.current;
    headDrag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 26 && Math.abs(dy) > Math.abs(dx)) {
      setSidebarOpen(dy < 0); // swipe up opens, down closes
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      setSidebarOpen((s) => !s); // tap toggles
    }
  }

  const backgroundBodies: BackgroundBody[] = useMemo(() => {
    const order = ["earth", "moon", "mars"];
    const i = order.indexOf(worldId);
    // [next, prev] so the top corner always advances Earth → Moon → Mars → Earth.
    return [order[(i + 1) % 3], order[(i + 2) % 3]].map((id) => {
      const w = WORLD_BY_ID[id];
      return { id: w.id, name: w.name.replace(/^The /, ""), inner: w.body.inner, outer: w.body.outer };
    });
  }, [worldId]);

  const selName = selectedId ? namesRef.current.get(selectedId) ?? null : null;
  const selectedAgg = selectedId ? realFor(selectedId) : undefined;
  const loading = features.length === 0;

  return (
    <div className="app">
      <div className="globe-wrap">
        <Globe
          key={worldId}
          features={features}
          borders={borders}
          colorForId={colorForId}
          selectedId={selectedId}
          onSelect={handleSelect}
          focusTarget={focus}
          autoRotate={autoRotate}
          style={world.style}
          backgroundBodies={backgroundBodies}
          onSwitchWorld={switchWorld}
          initialRotation={world.initialRotation}
          textureSrc={satellite ? `/tex-${worldId}.jpg` : null}
          overlay={overlay}
        />
        {loading && <div className="loading">Loading {world.name}…</div>}
      </div>

      {collapsed && (
        <button className="sidebar-open-btn" onClick={() => setCollapsed(false)} aria-label="Open menu">
          <MiniLegend source={source} metric={metric} />
          <span className="reopen-caret">›</span>
        </button>
      )}

      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-head" onPointerDown={onHeadPointerDown} onPointerUp={onHeadPointerUp}>
          <span className="grab" />
          <div className="head-content">
            <div className="brand">
              <h1>Value Maps</h1>
              <p>{world.tagline}</p>
            </div>
            <div className="mini-head">
              <MiniLegend source={source} metric={metric} />
            </div>
          </div>
          <button
            className="collapse-btn"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(true);
            }}
            aria-label="Collapse menu"
          >
            «
          </button>
          <span className="chev">{sidebarOpen ? "▾" : "▴"}</span>
        </div>

        <div className="sidebar-body">
          <div className="world-tabs">
            {WORLDS.map((w) => (
              <button
                key={w.id}
                className={`world-tab ${w.id === worldId ? "on" : ""}`}
                onClick={() => switchWorld(w.id)}
              >
                {w.name.replace(/^The /, "")}
              </button>
            ))}
          </div>

          <div className="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={world.kind === "countries" ? "Search a country…" : "Search a place…"}
              aria-label="Search a place"
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="results">
                {results.map((r, i) => (
                  <li key={r.id} className={i === activeIdx ? "active" : ""}>
                    <button onClick={() => goTo(r.id)} onMouseEnter={() => setActiveIdx(i)}>
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section className="block">
            <div className="block-title">Data source</div>
            <div className="chip-row">
              {availableSources.map((s) => (
                <button
                  key={s.id}
                  className={`pchip ${s.id === sourceId ? "on" : ""}`}
                  onClick={() => pickSource(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="source-blurb">{source.blurb}</p>
          </section>

          <section className="block">
            <div className="block-title">Color the map by</div>
            <div className="chip-row">
              {source.metrics.map((m) => (
                <button
                  key={m.id}
                  className={`pchip ${m.id === metricId ? "on" : ""}`}
                  onClick={() => setMetricId(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="legend-bar" style={{ background: legendGradient(metric) }} />
            <div className="legend-ends">
              <span>{metric.low}</span>
              <span>{metric.high}</span>
            </div>
            {source.kind === "reference" && source.attribution && (
              <a className="source-credit" href={source.url} target="_blank" rel="noreferrer">
                {source.attribution}
                {source.year ? ` · ${source.year}` : ""} ↗
              </a>
            )}
          </section>

          <button className="primary-btn" onClick={() => setFormOpen(true)}>
            {local ? "Update what you want" : "Share what you want"}
          </button>

          <section className="block region">
            {!selectedId ? (
              <div className="hint">
                Tap any {world.kind === "countries" ? "country" : "place"}, or search above, to see
                its profile.
              </div>
            ) : source.kind === "community" ? (
              <CommunityPanel name={selName} agg={selectedAgg} onAdd={() => setFormOpen(true)} />
            ) : (
              <ReferencePanel
                name={selName}
                regionId={selectedId}
                source={source}
                referenceData={referenceData}
                activeMetricId={metricId}
                onPickMetric={setMetricId}
              />
            )}
          </section>

          <section className="block toggles">
            <label className="toggle">
              <input
                type="checkbox"
                checked={satellite}
                onChange={(e) => setSatellite(e.target.checked)}
              />
              <span>Satellite imagery</span>
            </label>
            {satellite && (
              <label className="slider-row">
                <span>Data&nbsp;↔&nbsp;terrain</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(overlay * 100)}
                  onChange={(e) => setOverlay(Number(e.target.value) / 100)}
                  aria-label="Overlay opacity"
                />
              </label>
            )}
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
              />
              <span>Auto-spin</span>
            </label>
            <span className="travel-hint">Tap a faint world in space to travel there.</span>
          </section>

          <footer className="foot">
            <span className={`dot ${storageLive ? "dot-live" : "dot-demo"}`} />
            {storageLive
              ? `Live & shared${
                  backend === "supabase" ? " · Supabase" : backend === "upstash" ? " · Upstash" : ""
                }.`
              : "Community is in demo mode — add a database to save responses."}
          </footer>
        </div>
      </aside>

      <ValueForm
        open={formOpen}
        worldId={worldId}
        regionId={selectedId}
        regionName={selName}
        existing={local?.submission ?? null}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function MiniLegend({ source, metric }: { source: DataSource; metric: Metric }) {
  return (
    <div className="mini-legend">
      <div className="mini-legend-title">
        {source.label} · {metric.label}
      </div>
      <div className="legend-bar" style={{ background: legendGradient(metric) }} />
      <div className="legend-ends">
        <span>{metric.low}</span>
        <span>{metric.high}</span>
      </div>
    </div>
  );
}

function CommunityPanel({
  name,
  agg,
  onAdd,
}: {
  name: string | null;
  agg: Aggregate | undefined;
  onAdd: () => void;
}) {
  const count = agg?.count ?? 0;
  const wants = topWants(agg, 6);
  const pair = topPair(agg);
  const pairDef = pair ? TENSION_PAIRS.find((p) => p.id === pair.id) : null;

  return (
    <>
      <div className="region-head">
        <h2>{name}</h2>
        {count > 0 ? (
          <span className="pill pill-live">
            {count} voice{count === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="pill pill-sample">no responses yet</span>
        )}
      </div>

      {count > 0 ? (
        <>
          {pairDef && pair && (
            <div className="both-highlight">
              <strong>{Math.round(pair.share)}%</strong> here want both {pairDef.label} — not one
              or the other.
            </div>
          )}
          <div className="block-title">Most want here</div>
          <div className="want-bars">
            {wants.map((w) => {
              const def = WANT_BY_ID[w.id];
              return (
                <div className="want-bar" key={w.id}>
                  <div className="readout-top">
                    <span>{def?.label ?? w.id}</span>
                    <span className="metric-val">{Math.round(w.share)}%</span>
                  </div>
                  <div className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${w.share}%`, background: def?.color ?? "#888" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="hint">Be the first to share what people here want.</div>
      )}

      <button className="ghost-btn" onClick={onAdd}>
        Add your voice for {name}
      </button>
    </>
  );
}

function ReferencePanel({
  name,
  regionId,
  source,
  referenceData,
  activeMetricId,
  onPickMetric,
}: {
  name: string | null;
  regionId: string;
  source: (typeof SOURCES)[number];
  referenceData: ReferenceData;
  activeMetricId: string;
  onPickMetric: (id: string) => void;
}) {
  const row = referenceData[source.id]?.[regionId];
  const hasData = row && Object.keys(row).length > 0;
  return (
    <>
      <div className="region-head">
        <h2>{name}</h2>
        <span className="pill pill-ref">{source.label}</span>
      </div>

      {hasData ? (
        <div className="metric-rows">
          {source.metrics.map((m) => {
            const v = row?.[m.id];
            const has = typeof v === "number";
            return (
              <button
                key={m.id}
                className={`metric-row ${m.id === activeMetricId ? "active" : ""}`}
                onClick={() => onPickMetric(m.id)}
              >
                <div className="readout-top">
                  <span>{m.label}</span>
                  <span className="metric-val">{has ? formatValue(m, v as number) : "—"}</span>
                </div>
                <div className="track">
                  {m.scale === "diverging" && <span className="track-mid" />}
                  {has && (
                    <span
                      className="track-dot"
                      style={{
                        left: `${normalizedPosition(m, v as number) * 100}%`,
                        background: metricColor(m, v as number),
                      }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="hint">No data for {name} in this dataset.</div>
      )}

      {source.attribution && (
        <a className="source-credit" href={source.url} target="_blank" rel="noreferrer">
          Source: {source.attribution}
          {source.year ? ` · ${source.year}` : ""} ↗
        </a>
      )}
    </>
  );
}
