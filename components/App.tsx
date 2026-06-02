"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import { geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import Globe, { type FocusTarget } from "./Globe";
import ValueForm from "./ValueForm";
import { AXES, type Axis, type AxisId } from "@/lib/axes";
import {
  SOURCES,
  SOURCE_BY_ID,
  formatValue,
  legendGradient,
  metricColor,
  normalizedPosition,
} from "@/lib/sources";
import {
  applySubmission,
  axisAverage,
  emptyAggregate,
  mergeAggregates,
  topTopics,
} from "@/lib/aggregate";
import type { Aggregate, RegionAggregates, Submission } from "@/lib/types";

type Country = Feature<Geometry, GeoJsonProperties>;
type ReferenceData = Record<string, Record<string, Record<string, number>>>;
const STORAGE_KEY = "valuemaps:v1";

interface LocalState {
  submission: Submission;
  persisted: boolean;
}

const communityMetricById = Object.fromEntries(
  SOURCE_BY_ID.community.metrics.map((m) => [m.id, m])
);

function leanLabel(axis: Axis, v: number) {
  if (Math.abs(v) < 12) return "Balanced";
  return v < 0 ? axis.left : axis.right;
}

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [borders, setBorders] = useState<Geometry | null>(null);
  const namesRef = useRef<Map<string, string>>(new Map());
  const centroidsRef = useRef<Map<string, [number, number]>>(new Map());

  const [serverRegions, setServerRegions] = useState<RegionAggregates>({});
  const [storageLive, setStorageLive] = useState(false);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData>({});

  const [sourceId, setSourceId] = useState("happiness");
  const [metricId, setMetricId] = useState("ladder");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const source = SOURCE_BY_ID[sourceId];
  const metric = source.metrics.find((m) => m.id === metricId) ?? source.metrics[0];

  // Load the country geometry once.
  useEffect(() => {
    let cancelled = false;
    fetch("/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
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
        namesRef.current = names;
        centroidsRef.current = cents;
        setBorders(mesh(topo, topo.objects.countries, (a, b) => a !== b) as Geometry);
        setCountries(feats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Load reference datasets, community aggregates, and any local vote.
  useEffect(() => {
    fetch("/reference-data.json")
      .then((r) => r.json())
      .then((d) => setReferenceData(d.data || {}))
      .catch(() => {});
    fetch("/api/aggregate")
      .then((r) => r.json())
      .then((d) => {
        setServerRegions(d.regions || {});
        setStorageLive(!!d.storage);
      })
      .catch(() => {});
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LocalState;
        setLocal(parsed);
        if (parsed.submission?.regionId) setSelectedId(parsed.submission.regionId);
      }
    } catch {}
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setAutoRotate(false);
  }, []);

  // Community totals = server data + the visitor's own (un-persisted) vote.
  const realFor = useCallback(
    (id: string): Aggregate | undefined => {
      const server = serverRegions[id];
      let mine: Aggregate | undefined;
      if (local && !local.persisted && local.submission.regionId === id) {
        mine = applySubmission(emptyAggregate(), local.submission);
      }
      if (!server && !mine) return undefined;
      return mergeAggregates(server, mine);
    },
    [serverRegions, local]
  );

  const valueFor = useCallback(
    (id: string, mId: string = metricId): number | null => {
      if (source.kind === "community") return axisAverage(realFor(id), mId as AxisId);
      const v = referenceData[sourceId]?.[id]?.[mId];
      return typeof v === "number" ? v : null;
    },
    [source.kind, sourceId, metricId, referenceData, realFor]
  );

  const colorForId = useCallback(
    (id: string) => metricColor(metric, valueFor(id)),
    [metric, valueFor]
  );

  const pickSource = useCallback((id: string) => {
    setSourceId(id);
    setMetricId(SOURCE_BY_ID[id].metrics[0].id);
  }, []);

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
        setServerRegions((prev) => ({ ...prev, [sub.regionId]: data.aggregate }));
      }
    } catch {
      // offline / no datastore — vote is still kept locally below
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
        // Prefix matches first, then alphabetical.
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      })
      .slice(0, 7);
  }, [query, countries]);

  useEffect(() => setActiveIdx(0), [query]);

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

  const selName = selectedId ? namesRef.current.get(selectedId) ?? null : null;
  const selectedAgg = selectedId ? realFor(selectedId) : undefined;
  const selConcerns = topTopics(selectedAgg, 5);
  const loading = countries.length === 0;

  return (
    <div className="app">
      <div className="globe-wrap">
        <Globe
          features={countries}
          borders={borders}
          colorForId={colorForId}
          selectedId={selectedId}
          onSelect={handleSelect}
          focusTarget={focus}
          autoRotate={autoRotate}
        />
        {loading && <div className="loading">Loading the globe…</div>}
      </div>

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <button className="sidebar-head" onClick={() => setSidebarOpen((s) => !s)}>
          <span className="grab" />
          <div className="brand">
            <h1>Value Maps</h1>
            <p>What does the world actually care about?</p>
          </div>
          <span className="chev">{sidebarOpen ? "▾" : "▴"}</span>
        </button>

        <div className="sidebar-body">
          <div className="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search a country…"
              aria-label="Search a country"
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
            <div className="axis-chips">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  className={`axis-chip ${s.id === sourceId ? "on" : ""}`}
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
            <div className="axis-chips">
              {source.metrics.map((m) => (
                <button
                  key={m.id}
                  className={`axis-chip ${m.id === metricId ? "on" : ""}`}
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
            {local ? "✏️ Update your values" : "➕ Add your values"}
          </button>

          <section className="block region">
            {!selectedId ? (
              <div className="hint">Tap any country, or search above, to see its profile.</div>
            ) : source.kind === "community" ? (
              <CommunityPanel
                name={selName}
                agg={selectedAgg}
                concerns={selConcerns}
                onAdd={() => setFormOpen(true)}
              />
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
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
              />
              <span>Auto-spin</span>
            </label>
          </section>

          <footer className="foot">
            <span className={`dot ${storageLive ? "dot-live" : "dot-demo"}`} />
            {storageLive
              ? "Community responses are live & shared."
              : "Community is in demo mode — add a database to save responses."}
          </footer>
        </div>
      </aside>

      <ValueForm
        open={formOpen}
        regionId={selectedId}
        regionName={selName}
        existing={local?.submission ?? null}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function CommunityPanel({
  name,
  agg,
  concerns,
  onAdd,
}: {
  name: string | null;
  agg: Aggregate | undefined;
  concerns: { topic: string; count: number }[];
  onAdd: () => void;
}) {
  const count = agg?.count ?? 0;
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
          <div className="axis-readouts">
            {AXES.map((a) => {
              const v = axisAverage(agg, a.id) ?? 0;
              const m = communityMetricById[a.id];
              return (
                <div className="readout" key={a.id}>
                  <div className="readout-top">
                    <span>{a.label}</span>
                    <span className="readout-lean">{leanLabel(a, v)}</span>
                  </div>
                  <div className="track">
                    <span className="track-mid" />
                    <span
                      className="track-dot"
                      style={{
                        left: `${normalizedPosition(m, v) * 100}%`,
                        background: metricColor(m, v),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {concerns.length > 0 && (
            <div className="concerns">
              <div className="block-title">Top concerns</div>
              <div className="chips">
                {concerns.map((c) => (
                  <span className="chip chip-static" key={c.topic}>
                    {c.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="hint">Be the first to share what people here care about.</div>
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
