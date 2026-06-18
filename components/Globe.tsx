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
  onInteract: () => void;
  initialRotation: [number, number, number];
  textureSrc: string | null;
  overlay: number;
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
  onInteract,
  initialRotation,
  textureSrc,
  overlay,
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

  const propsRef = useRef({ features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies, textureSrc, overlay });
  propsRef.current = { features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies, textureSrc, overlay };

  const dirty = useRef(true);
  const raf = useRef<number | null>(null);
  const lastInteraction = useRef(0);
  const tween = useRef<{ from: [number, number, number]; to: [number, number, number]; start: number; dur: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, downAt: 0, lastX: 0, lastY: 0, pinchDist: 0, interacted: false });
  const bodiesRef = useRef<{ id: string; cx: number; cy: number; r: number }[]>([]);
  const bodyImgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const shooting = useRef<{ x0: number; y0: number; dx: number; dy: number; born: number; dur: number; len: number }[]>([]);
  const texPixels = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  const texCanvas = useRef<HTMLCanvasElement | null>(null);
  const lastTexKey = useRef("");
  const lastRotate = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSwitchRef = useRef(onSwitchWorld);
  onSwitchRef.current = onSwitchWorld;
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  function makeProjection(): GeoProjection {
    const v = view.current;
    return geoOrthographic()
      .translate([v.width / 2, v.height / 2])
      .scale(v.baseScale * v.zoom)
      .rotate(v.rotation)
      .clipAngle(90);
  }

  // Lazily load the shaded planet image for a background body.
  function bodyImage(id: string): HTMLImageElement {
    let img = bodyImgs.current.get(id);
    if (!img) {
      img = new Image();
      img.onload = () => requestRender();
      img.src = `/body-${id}.png`;
      bodyImgs.current.set(id, img);
    }
    return img;
  }

  // Occasionally streak a faint shooting star across the deep-space backdrop,
  // matching the look of nathantowianski.com.
  function spawnShoot() {
    const v = view.current;
    if (!v.width || !v.height) return;
    const fromLeft = Math.random() < 0.5;
    const dist = Math.min(v.width, v.height) * (0.5 + Math.random() * 0.4);
    const theta = ((20 + Math.random() * 26) * Math.PI) / 180; // angle below horizontal
    shooting.current.push({
      x0: fromLeft ? Math.random() * v.width * 0.4 : v.width * (0.6 + Math.random() * 0.4),
      y0: Math.random() * v.height * 0.45,
      dx: (fromLeft ? 1 : -1) * dist * Math.cos(theta),
      dy: dist * Math.sin(theta),
      born: performance.now(),
      dur: 700 + Math.random() * 600,
      len: 64 + Math.random() * 90,
    });
    requestRender();
  }

  // Project the equirectangular texture onto the sphere for the current view,
  // using the SAME projection that draws the countries (so they line up).
  // Cached by orientation/zoom; recomputed only when the view changes.
  // Project the equirectangular texture onto the sphere for the current view,
  // using the SAME projection that draws the countries (so they line up).
  // Renders only the on-screen slice of the globe at screen resolution, so
  // zooming in stays crisp while the work stays bounded. Cached by view.
  function renderTexture(
    moving: boolean
  ): { canvas: HTMLCanvasElement; rx: number; ry: number; rw: number; rh: number } | null {
    const tex = texPixels.current;
    if (!tex) return null;
    const v = view.current;
    const cx = v.width / 2;
    const cy = v.height / 2;
    const r = v.baseScale * v.zoom;
    const rx = Math.max(0, Math.floor(cx - r));
    const ry = Math.max(0, Math.floor(cy - r));
    const rw = Math.min(v.width, Math.ceil(cx + r)) - rx;
    const rh = Math.min(v.height, Math.ceil(cy + r)) - ry;
    if (rw <= 0 || rh <= 0) return null;
    const q = moving ? 0.5 : Math.min(v.dpr, 2);
    const maxPix = moving ? 200000 : 900000;
    let ow = Math.max(1, Math.round(rw * q));
    let oh = Math.max(1, Math.round(rh * q));
    if (ow * oh > maxPix) {
      const s = Math.sqrt(maxPix / (ow * oh));
      ow = Math.max(1, Math.round(ow * s));
      oh = Math.max(1, Math.round(oh * s));
    }
    const key = `${v.rotation[0].toFixed(1)},${v.rotation[1].toFixed(1)},${v.zoom.toFixed(
      3
    )},${rx},${ry},${rw},${rh},${ow},${oh},${moving ? 0 : 1},${tex.w}`;
    let tc = texCanvas.current;
    if (tc && lastTexKey.current === key) return { canvas: tc, rx, ry, rw, rh };
    if (!tc) {
      tc = document.createElement("canvas");
      texCanvas.current = tc;
    }
    tc.width = ow;
    tc.height = oh;
    const tctx = tc.getContext("2d");
    if (!tctx) return null;
    const img = tctx.createImageData(ow, oh);
    const out = img.data;
    const invert = makeProjection().invert;
    if (!invert) return null;
    const tw = tex.w;
    const th = tex.h;
    const td = tex.data;
    const pt: [number, number] = [0, 0];
    const smooth = !moving;
    for (let j = 0; j < oh; j++) {
      const sy = ry + ((j + 0.5) / oh) * rh;
      const dyN = (sy - cy) / r;
      for (let i = 0; i < ow; i++) {
        const o = (j * ow + i) * 4;
        const sx = rx + ((i + 0.5) / ow) * rw;
        const dxN = (sx - cx) / r;
        const rho2 = dxN * dxN + dyN * dyN;
        if (rho2 > 1) {
          out[o + 3] = 0;
          continue;
        }
        pt[0] = sx;
        pt[1] = sy;
        const ll = invert(pt);
        if (!ll || Number.isNaN(ll[0])) {
          out[o + 3] = 0;
          continue;
        }
        const shade = 0.62 + 0.38 * Math.sqrt(1 - rho2); // gentle limb darkening
        if (smooth) {
          const uf = ((ll[0] + 180) / 360) * tw - 0.5;
          const vf = ((90 - ll[1]) / 180) * th - 0.5;
          let u0 = Math.floor(uf);
          let v0 = Math.floor(vf);
          const du = uf - u0;
          const dv = vf - v0;
          let u1 = u0 + 1;
          let v1 = v0 + 1;
          u0 = ((u0 % tw) + tw) % tw;
          u1 = ((u1 % tw) + tw) % tw;
          if (v0 < 0) v0 = 0;
          else if (v0 >= th) v0 = th - 1;
          if (v1 < 0) v1 = 0;
          else if (v1 >= th) v1 = th - 1;
          const i00 = (v0 * tw + u0) * 4;
          const i10 = (v0 * tw + u1) * 4;
          const i01 = (v1 * tw + u0) * 4;
          const i11 = (v1 * tw + u1) * 4;
          const w00 = (1 - du) * (1 - dv);
          const w10 = du * (1 - dv);
          const w01 = (1 - du) * dv;
          const w11 = du * dv;
          out[o] = (td[i00] * w00 + td[i10] * w10 + td[i01] * w01 + td[i11] * w11) * shade;
          out[o + 1] =
            (td[i00 + 1] * w00 + td[i10 + 1] * w10 + td[i01 + 1] * w01 + td[i11 + 1] * w11) * shade;
          out[o + 2] =
            (td[i00 + 2] * w00 + td[i10 + 2] * w10 + td[i01 + 2] * w01 + td[i11 + 2] * w11) * shade;
          out[o + 3] = 255;
        } else {
          let u = (((ll[0] + 180) / 360) * tw) | 0;
          u = ((u % tw) + tw) % tw;
          let vv = (((90 - ll[1]) / 180) * th) | 0;
          if (vv < 0) vv = 0;
          else if (vv >= th) vv = th - 1;
          const s = (vv * tw + u) * 4;
          out[o] = td[s] * shade;
          out[o + 1] = td[s + 1] * shade;
          out[o + 2] = td[s + 2] * shade;
          out[o + 3] = 255;
        }
      }
    }
    tctx.putImageData(img, 0, 0);
    lastTexKey.current = key;
    return { canvas: tc, rx, ry, rw, rh };
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
    space.addColorStop(0, "#0a0809");
    space.addColorStop(1, "#000000");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, w, h);

    // Stars.
    for (const s of v.stars) {
      if (s.bright) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
        g.addColorStop(0, `rgba(255,243,233,${s.a})`);
        g.addColorStop(1, "rgba(255,243,233,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = s.a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5efe8";
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shooting stars — a white head trailing into the brand orange.
    if (shooting.current.length) {
      const now = performance.now();
      for (const sh of shooting.current) {
        const t = (now - sh.born) / sh.dur;
        if (t < 0 || t > 1) continue;
        const hx = sh.x0 + sh.dx * t;
        const hy = sh.y0 + sh.dy * t;
        const ang = Math.atan2(sh.dy, sh.dx);
        const tx = hx - Math.cos(ang) * sh.len;
        const ty = hy - Math.sin(ang) * sh.len;
        const a = Math.sin(t * Math.PI) * 0.9; // fade in then out
        const grad = ctx.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, "rgba(255,80,38,0)");
        grad.addColorStop(0.65, `rgba(255,140,96,${a * 0.5})`);
        grad.addColorStop(1, `rgba(255,244,236,${a})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
        ctx.fillStyle = "#fff6ef";
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

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
      const img = bodyImage(b.id);
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, bodyR, 0, Math.PI * 2);
      ctx.closePath();
      if (img.complete && img.naturalWidth > 0) {
        ctx.globalAlpha = 0.96;
        ctx.clip();
        ctx.drawImage(img, s.x - bodyR, s.y - bodyR, bodyR * 2, bodyR * 2);
      } else {
        // Fallback shaded disc while the texture loads.
        ctx.globalAlpha = 0.5;
        const g = ctx.createRadialGradient(s.x - bodyR * 0.35, s.y - bodyR * 0.35, bodyR * 0.1, s.x, s.y, bodyR);
        g.addColorStop(0, b.inner);
        g.addColorStop(1, b.outer);
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();

      // Rim + label.
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, bodyR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 0.78;
      ctx.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(220,228,245,0.85)";
      try {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "2px";
      } catch {}
      ctx.fillText(b.name.toUpperCase(), s.x, s.y + bodyR + 14);
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

    // Surface: real planet texture ("satellite"), else a flat shaded sphere.
    const moving = performance.now() - lastRotate.current < 200;
    const tc = p.textureSrc && texPixels.current ? renderTexture(moving) : null;
    if (tc) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(tc.canvas, tc.rx, tc.ry, tc.rw, tc.rh);
      ctx.restore();
    } else {
      const surface = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      surface.addColorStop(0, p.style.sphereInner);
      surface.addColorStop(1, p.style.sphereOuter);
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = surface;
      ctx.fill();
    }

    if (p.style.graticule && !tc) {
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Regions / countries, colored by the active metric (translucent over texture).
    const fillAlpha = tc ? Math.max(0, Math.min(1, p.overlay)) : 1;
    for (const f of p.features) {
      ctx.beginPath();
      path(f);
      ctx.globalAlpha = fillAlpha;
      ctx.fillStyle = p.colorForId(String(f.id));
      ctx.fill();
      ctx.globalAlpha = 1;
      if (p.style.outlineFeatures) {
        ctx.strokeStyle = tc ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    if (p.borders) {
      ctx.beginPath();
      path(p.borders);
      ctx.strokeStyle = tc ? "rgba(255,255,255,0.5)" : "rgba(5,9,16,0.55)";
      ctx.lineWidth = tc ? 0.6 : 0.5;
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
      lastRotate.current = now;
      if (t >= 1) tween.current = null;
    } else if (p.autoRotate && !document.hidden) {
      if (now - lastInteraction.current > IDLE_MS) {
        v.rotation[0] = (v.rotation[0] + SPIN_SPEED) % 360;
        needDraw = true;
        lastRotate.current = now;
      }
      keepGoing = true;
    }

    // Keep animating while any shooting star is in flight; one extra frame
    // clears the last one as it finishes.
    if (shooting.current.length) {
      shooting.current = shooting.current.filter((s) => now - s.born <= s.dur + 20);
      needDraw = true;
      if (shooting.current.length) keepGoing = true;
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
      g.interacted = false;
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
      lastRotate.current = performance.now();

      if (pointers.current.size >= 2) {
        const d = dist();
        if (g.pinchDist > 0) v.zoom = clamp(v.zoom * (d / g.pinchDist), MIN_ZOOM, MAX_ZOOM);
        g.pinchDist = d;
        g.moved += 50;
        if (!g.interacted) {
          g.interacted = true;
          onInteractRef.current();
        }
        requestRender();
        return;
      }

      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.moved += Math.hypot(dx, dy);
      if (!g.interacted && g.moved >= 8) {
        g.interacted = true;
        onInteractRef.current();
      }
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
      lastRotate.current = performance.now();
      onInteractRef.current();
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
  }, [features, borders, colorForId, selectedId, style, backgroundBodies, textureSrc, overlay]);

  // Load the equirectangular texture for "satellite" mode and grab its pixels.
  useEffect(() => {
    texPixels.current = null;
    lastTexKey.current = "";
    requestRender();
    if (!textureSrc) return;
    let cancelled = false;

    const loadInto = (src: string, next?: () => void) => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cc = c.getContext("2d");
        if (cc) {
          cc.drawImage(img, 0, 0);
          try {
            const id = cc.getImageData(0, 0, c.width, c.height);
            // Only ever upgrade resolution, never downgrade.
            if (!texPixels.current || c.width >= texPixels.current.w) {
              texPixels.current = { data: id.data, w: c.width, h: c.height };
              lastTexKey.current = "";
              requestRender();
            }
          } catch {
            // tainted canvas — keep the flat fallback
          }
        }
        next?.();
      };
      img.onerror = () => next?.();
      img.src = src;
    };

    // Low-res first for an instant paint, then swap in the 2k map.
    const hi = textureSrc.replace(/(\.[a-z0-9]+)$/i, "-hi$1");
    loadInto(textureSrc, () => loadInto(hi));

    return () => {
      cancelled = true;
    };
  }, [textureSrc]);

  useEffect(() => {
    if (autoRotate) {
      lastInteraction.current = performance.now();
      schedule();
    }
  }, [autoRotate]);

  // Occasional shooting stars (disabled when the visitor prefers reduced motion).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const tick = setInterval(() => {
      if (!document.hidden && Math.random() < 0.4) spawnShoot();
    }, 2600);
    const intro = setTimeout(() => {
      if (!document.hidden) spawnShoot();
    }, 1600);
    return () => {
      clearInterval(tick);
      clearTimeout(intro);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
