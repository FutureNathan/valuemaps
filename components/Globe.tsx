"use client";

import { useEffect, useRef } from "react";
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
  geoContains,
  type GeoProjection,
} from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";

export interface FocusTarget {
  lng: number;
  lat: number;
  nonce: number;
}

export interface GlobeStyle {
  sphereInner: string;
  sphereOuter: string;
  atmosphere: string; // "r,g,b"
  graticule: boolean;
  outlineFeatures: boolean;
}

export interface BackgroundBody {
  id: string;
  name: string;
  inner: string;
  outer: string;
}

interface GlobeProps {
  features: Feature<Geometry, GeoJsonProperties>[];
  borders: Geometry | null;
  colorForId: (id: string) => string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusTarget: FocusTarget | null;
  autoRotate: boolean;
  style: GlobeStyle;
  backgroundBodies: BackgroundBody[];
  onSwitchWorld: (id: string) => void;
  initialRotation: [number, number, number];
}

const MIN_ZOOM = 0.85;
const MAX_ZOOM = 7;
const SPIN_SPEED = 0.1;
const IDLE_MS = 3000;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpAngle(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

export default function Globe({
  features,
  borders,
  colorForId,
  selectedId,
  onSelect,
  focusTarget,
  autoRotate,
  style,
  backgroundBodies,
  onSwitchWorld,
  initialRotation,
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const view = useRef({
    rotation: [...initialRotation] as [number, number, number],
    zoom: 1,
    baseScale: 300,
    width: 0,
    height: 0,
    dpr: 1,
    stars: [] as { x: number; y: number; r: number; a: number; bright: boolean }[],
  });

  const propsRef = useRef({ features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies });
  propsRef.current = { features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies };

  const dirty = useRef(true);
  const raf = useRef<number | null>(null);
  const lastInteraction = useRef(0);
  const tween = useRef<{ from: [number, number, number]; to: [number, number, number]; start: number; dur: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, downAt: 0, lastX: 0, lastY: 0, pinchDist: 0 });
  const bodiesRef = useRef<{ id: string; cx: number; cy: number; r: number }[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSwitchRef = useRef(onSwitchWorld);
  onSwitchRef.current = onSwitchWorld;

  function makeProjection(): GeoProjection {
    const v = view.current;
    return geoOrthographic()
      .translate([v.width / 2, v.height / 2])
      .scale(v.baseScale * v.zoom)
      .rotate(v.rotation)
      .clipAngle(90);
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const v = view.current;
    const p = propsRef.current;
    const w = v.width;
    const h = v.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = v.baseScale * v.zoom;

    ctx.save();
    ctx.scale(v.dpr, v.dpr);

    // Deep-space backdrop (near-black, subtle center lift).
    const space = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.75);
    space.addColorStop(0, "#05070d");
    space.addColorStop(1, "#000000");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, w, h);

    // Stars.
    for (const s of v.stars) {
      if (s.bright) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
        g.addColorStop(0, `rgba(226,236,255,${s.a})`);
        g.addColorStop(1, "rgba(226,236,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "#eaf1ff";
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Faint background worlds you can tap to travel to.
    const bodyR = Math.max(24, Math.min(w, h) * 0.058);
    const m = Math.min(w, h) * 0.06 + bodyR;
    const spots = [
      { x: w - m, y: m },
      { x: m, y: h - m },
    ];
    const bodies: { id: string; cx: number; cy: number; r: number }[] = [];
    p.backgroundBodies.slice(0, 2).forEach((b, i) => {
      const s = spots[i];
      ctx.globalAlpha = 0.5;
      const g = ctx.createRadialGradient(s.x - bodyR * 0.35, s.y - bodyR * 0.35, bodyR * 0.1, s.x, s.y, bodyR);
      g.addColorStop(0, b.inner);
      g.addColorStop(1, b.outer);
      ctx.beginPath();
      ctx.arc(s.x, s.y, bodyR, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(220,228,245,0.8)";
      try {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "2px";
      } catch {}
      ctx.fillText(b.name.toUpperCase(), s.x, s.y + bodyR + 13);
      try {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
      } catch {}
      ctx.textAlign = "start";
      bodies.push({ id: b.id, cx: s.x, cy: s.y, r: bodyR });
    });
    ctx.globalAlpha = 1;
    bodiesRef.current = bodies;

    const projection = makeProjection();
    const path = geoPath(projection, ctx);

    // Atmosphere.
    const glow = ctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r * 1.16);
    glow.addColorStop(0, `rgba(${p.style.atmosphere},0.26)`);
    glow.addColorStop(1, `rgba(${p.style.atmosphere},0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Surface sphere.
    const surface = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    surface.addColorStop(0, p.style.sphereInner);
    surface.addColorStop(1, p.style.sphereOuter);
    ctx.beginPath();
    path({ type: "Sphere" });
    ctx.fillStyle = surface;
    ctx.fill();

    if (p.style.graticule) {
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Regions / countries, colored by the active metric.
    for (const f of p.features) {
      ctx.beginPath();
      path(f);
      ctx.fillStyle = p.colorForId(String(f.id));
      ctx.fill();
      if (p.style.outlineFeatures) {
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    if (p.borders) {
      ctx.beginPath();
      path(p.borders);
      ctx.strokeStyle = "rgba(5,9,16,0.55)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    if (p.selectedId) {
      const sel = p.features.find((f) => String(f.id) === p.selectedId);
      if (sel) {
        ctx.beginPath();
        path(sel);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 1.75;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${p.style.atmosphere},0.4)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function schedule() {
    if (raf.current == null) raf.current = requestAnimationFrame(loop);
  }
  function requestRender() {
    dirty.current = true;
    schedule();
  }

  function loop(now: number) {
    raf.current = null;
    const v = view.current;
    const p = propsRef.current;
    let needDraw = dirty.current;
    dirty.current = false;
    let keepGoing = false;

    if (tween.current) {
      const tw = tween.current;
      const t = clamp((now - tw.start) / tw.dur, 0, 1);
      const e = easeInOut(t);
      v.rotation = [lerpAngle(tw.from[0], tw.to[0], e), tw.from[1] + (tw.to[1] - tw.from[1]) * e, 0];
      needDraw = true;
      keepGoing = true;
      if (t >= 1) tween.current = null;
    } else if (p.autoRotate && !document.hidden) {
      if (now - lastInteraction.current > IDLE_MS) {
        v.rotation[0] = (v.rotation[0] + SPIN_SPEED) % 360;
        needDraw = true;
      }
      keepGoing = true;
    }

    if (needDraw) draw();
    if (keepGoing || dirty.current) schedule();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function dist() {
      const pts = [...pointers.current.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    function onDown(e: PointerEvent) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      g.moved = 0;
      g.downAt = performance.now();
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      if (pointers.current.size === 2) g.pinchDist = dist();
      lastInteraction.current = performance.now();
      tween.current = null;
    }

    function onMove(e: PointerEvent) {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const v = view.current;
      const g = gesture.current;
      lastInteraction.current = performance.now();

      if (pointers.current.size >= 2) {
        const d = dist();
        if (g.pinchDist > 0) v.zoom = clamp(v.zoom * (d / g.pinchDist), MIN_ZOOM, MAX_ZOOM);
        g.pinchDist = d;
        g.moved += 50;
        requestRender();
        return;
      }

      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.moved += Math.hypot(dx, dy);
      const k = 57.29577951 / (v.baseScale * v.zoom);
      v.rotation = [v.rotation[0] + dx * k, clamp(v.rotation[1] - dy * k, -89, 89), 0];
      requestRender();
    }

    function endTap(e: PointerEvent) {
      const g = gesture.current;
      const quick = performance.now() - g.downAt < 450;
      if (g.moved >= 6 || !quick) return;
      const rect = canvas!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const v = view.current;
      const globeR = v.baseScale * v.zoom;
      const onGlobe = Math.hypot(px - v.width / 2, py - v.height / 2) <= globeR;

      // Tapping a faint background world travels there.
      for (const b of bodiesRef.current) {
        if (Math.hypot(px - b.cx, py - b.cy) <= b.r + 6 && !onGlobe) {
          onSwitchRef.current(b.id);
          return;
        }
      }

      if (onGlobe) {
        const ll = makeProjection().invert?.([px, py]);
        if (ll) {
          const hit = propsRef.current.features.find((f) => geoContains(f, ll));
          onSelectRef.current(hit ? String(hit.id) : null);
        }
      }
    }

    function onUp(e: PointerEvent) {
      if (pointers.current.size === 1) endTap(e);
      pointers.current.delete(e.pointerId);
      const g = gesture.current;
      g.pinchDist = 0;
      const rest = [...pointers.current.values()][0];
      if (rest) {
        g.lastX = rest.x;
        g.lastY = rest.y;
      }
      lastInteraction.current = performance.now();
      schedule();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = view.current;
      v.zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      lastInteraction.current = performance.now();
      requestRender();
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function resize() {
      const v = view.current;
      const rect = container!.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      v.width = w;
      v.height = h;
      v.dpr = dpr;
      v.baseScale = (Math.min(w, h) / 2) * 0.92;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";

      const count = Math.round((w * h) / 5200);
      const stars = [];
      let s = 9301;
      const rnd = () => ((s = (s * 233280 + 49297) % 233280) / 233280);
      for (let i = 0; i < count; i++) {
        const bright = rnd() > 0.93;
        stars.push({
          x: rnd() * w,
          y: rnd() * h,
          r: bright ? rnd() * 0.8 + 0.9 : rnd() * 0.9 + 0.25,
          a: bright ? rnd() * 0.3 + 0.7 : rnd() * 0.45 + 0.18,
          bright,
        });
      }
      v.stars = stars;
      requestRender();
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    const onVis = () => schedule();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    requestRender();
  }, [features, borders, colorForId, selectedId, style, backgroundBodies]);

  useEffect(() => {
    if (autoRotate) {
      lastInteraction.current = performance.now();
      schedule();
    }
  }, [autoRotate]);

  useEffect(() => {
    if (!focusTarget) return;
    const v = view.current;
    tween.current = {
      from: [...v.rotation] as [number, number, number],
      to: [-focusTarget.lng, clamp(-focusTarget.lat, -89, 89), 0],
      start: performance.now(),
      dur: 750,
    };
    lastInteraction.current = performance.now() + 750;
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.nonce]);

  useEffect(() => {
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="globe-stage">
      <canvas ref={canvasRef} className="globe-canvas" />
    </div>
  );
}
