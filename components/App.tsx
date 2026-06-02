"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import { geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import Globe, { type FocusTarget } from "./Globe";
import ValueForm from "./ValueForm";
import { AXES, AXIS_BY_ID, type Axis, type AxisId } from "@/lib/axes";
import { NO_DATA_COLOR, divergingColor } from "@/lib/colors";
import {
  applySubmission,
  axisAverage,
  emptyAggregate,
  mergeAggregates,
  topTopics,
} from "@/lib/aggregate";
import { sampleAggregate } from "@/lib/seed";
import type { Aggregate, RegionAggregates, Submission } from "@/lib/types";

type Country = Feature<Geometry, GeoJsonProperties>;
const STORAGE_KEY = "valuemaps:v1";

interface LocalState {
  submission: Submission;
  persisted: boolean;
}

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

  const [axis, setAxis] = useState<AxisId>("economic");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Load the country geometry once (small topojson served from /public).
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

  // Load aggregates and any locally-saved vote.
  useEffect(() => {
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

  // Combine server totals with the visitor's own (un-persisted) vote.
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

  const displayFor = useCallback(
    (id: string): { agg: Aggregate | undefined; isSample: boolean } => {
      const real = realFor(id);
      if (real && real.count > 0) return { agg: real, isSample: false };
      if (showSample) return { agg: sampleAggregate(id), isSample: true };
      return { agg: undefined, isSample: false };
    },
    [realFor, showSample]
  );

  const colorForId = useCallback(
    (id: string) => {
      const { agg } = displayFor(id);
      const avg = axisAverage(agg, axis);
      if (avg == null) return NO_DATA_COLOR;
      const a = AXIS_BY_ID[axis];
      return divergingColor(avg, a.leftColor, a.rightColor);
    },
    [displayFor, axis]
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
        setServerRegions((prev) => ({ ...prev, [sub.regionId]: data.aggregate }));
      }
    } catch {
      // offline / no datastore — we still keep the vote locally below
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
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6);
  }, [query, countries]);

  const activeAxis = AXIS_BY_ID[axis];
  const selName = selectedId ? namesRef.current.get(selectedId) ?? null : null;
  const selected = selectedId ? displayFor(selectedId) : null;
  const selConcerns = topTopics(selected?.agg, 5);
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

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} data-open={sidebarOpen}>
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
              placeholder="Search a country…"
              aria-label="Search a country"
            />
            {results.length > 0 && (
              <ul className="results">
                {results.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => goTo(r.id)}>{r.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section className="block">
            <div className="block-title">Color the map by</div>
            <div className="axis-chips">
              {AXES.map((a) => (
                <button
                  key={a.id}
                  className={`axis-chip ${a.id === axis ? "on" : ""}`}
                  onClick={() => setAxis(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div
              className="legend-bar"
              style={{
                background: `linear-gradient(90deg, ${activeAxis.leftColor}, #5b6b82 50%, ${activeAxis.rightColor})`,
              }}
            />
            <div className="legend-ends">
              <span>{activeAxis.left}</span>
              <span>{activeAxis.right}</span>
            </div>
          </section>

          <button className="primary-btn" onClick={() => setFormOpen(true)}>
            {local ? "✏️ Update your values" : "➕ Add your values"}
          </button>

          <section className="block region">
            {!selectedId ? (
              <div className="hint">Tap any country, or search above, to see what it values.</div>
            ) : (
              <>
                <div className="region-head">
                  <h2>{selName}</h2>
                  {selected?.isSample ? (
                    <span className="pill pill-sample">sample data</span>
                  ) : (
                    <span className="pill pill-live">
                      {realFor(selectedId)?.count ?? 0} voice
                      {(realFor(selectedId)?.count ?? 0) === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {selected?.agg ? (
                  <>
                    <div className="axis-readouts">
                      {AXES.map((a) => {
                        const v = axisAverage(selected.agg, a.id) ?? 0;
                        const pct = (v + 100) / 2;
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
                                  left: `${pct}%`,
                                  background: divergingColor(v, a.leftColor, a.rightColor),
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {selConcerns.length > 0 && (
                      <div className="concerns">
                        <div className="block-title">Top concerns</div>
                        <div className="chips">
                          {selConcerns.map((c) => (
                            <span className="chip chip-static" key={c.topic}>
                              {c.topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <button className="ghost-btn" onClick={() => setFormOpen(true)}>
                      Add your voice for {selName}
                    </button>
                  </>
                ) : (
                  <div className="hint">
                    No responses here yet. Turn on sample data, or be the first voice.
                  </div>
                )}
              </>
            )}
          </section>

          <section className="block toggles">
            <label className="toggle">
              <input
                type="checkbox"
                checked={showSample}
                onChange={(e) => setShowSample(e.target.checked)}
              />
              <span>Show sample data</span>
            </label>
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
              ? "Live — responses are shared with everyone."
              : "Demo mode — add a database to save responses."}
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
