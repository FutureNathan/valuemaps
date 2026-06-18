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
  tileUrl: string | null;
  overlay: number;
  hideData: boolean;
}

const MIN_ZOOM = 0.85;
// Without working map tiles we cap zoom where the base texture still holds up;
// once tiles start loading we open it right up for Google-Earth-style depth.
const MAX_ZOOM_BASE = 12;
const MAX_ZOOM_TILES = 8000;
const SPIN_SPEED = 0.1;
const IDLE_MS = 3000;

// Web-Mercator slippy-map tiles (256px). Standard formulas.
const TILE_SIZE = 256;
const TILE_Z_MAX = 17; // deepest tile level we'll request
const MAX_TILES_PER_FRAME = 180; // guard against the limb spanning the whole map

function lonLatToMercator(lonDeg: number, latDeg: number): [number, number] {
  const x = (lonDeg + 180) / 360;
  const lat = (latDeg * Math.PI) / 180;
  const y = 0.5 - Math.asinh(Math.tan(lat)) / (2 * Math.PI);
  return [x, y]; // normalized [0,1)
}

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
  tileUrl,
  overlay,
  hideData,
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
  });

  // Celestial sphere: stars + a faint Milky Way, fixed in sky coordinates and
  // projected with the globe's rotation so they sweep past as you spin it.
  const sky = useRef<{
    stars: { lon: number; sinLat: number; cosLat: number; r: number; a: number; bright: boolean }[];
    haze: { lon: number; sinLat: number; cosLat: number; r: number; a: number }[];
  } | null>(null);

  const propsRef = useRef({ features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies, textureSrc, tileUrl, overlay, hideData });
  propsRef.current = { features, borders, colorForId, selectedId, autoRotate, style, backgroundBodies, textureSrc, tileUrl, overlay, hideData };

  // Satellite map tiles for deep zoom (Earth). Decoded RGBA kept in an LRU cache.
  const tileCache = useRef(new Map<string, { data?: Uint8ClampedArray; state: "loading" | "ok" | "err" }>());
  const maxZoom = useRef(MAX_ZOOM_BASE);
  const tilesEverLoaded = useRef(false);

  const dirty = useRef(true);
  const raf = useRef<number | null>(null);
  const settleTimer = useRef<number | null>(null);
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

  // Build the celestial sphere once: a uniform sprinkling of stars plus a denser,
  // tilted band of stars and soft haze blobs that read as the Milky Way.
  // Deterministic, and stored as precomputed trig (lonRad, sinLat, cosLat) so
  // the per-frame orthographic projection is cheap.
  function buildSky() {
    let s = 1234567;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // Tilt the band off the equator so it crosses the view diagonally.
    const tilt = (61 * Math.PI) / 180;
    const ct = Math.cos(tilt);
    const stt = Math.sin(tilt);
    // Place a point near the equator then tilt the whole band; return rad/sin/cos.
    const place = (lonDeg: number, latDeg: number) => {
      const lo = (lonDeg * Math.PI) / 180;
      const la = (latDeg * Math.PI) / 180;
      const cl = Math.cos(la);
      const x = cl * Math.cos(lo);
      let y = cl * Math.sin(lo);
      let z = Math.sin(la);
      const y2 = y * ct - z * stt;
      const z2 = y * stt + z * ct;
      const latR = Math.asin(Math.max(-1, Math.min(1, z2)));
      return { lon: Math.atan2(y2, x), sinLat: Math.sin(latR), cosLat: Math.cos(latR) };
    };
    const gauss = () => rnd() + rnd() + rnd() - 1.5; // ~N(0, .5)

    const stars: { lon: number; sinLat: number; cosLat: number; r: number; a: number; bright: boolean }[] = [];
    // Uniform field across the whole sky.
    for (let i = 0; i < 2200; i++) {
      const lonR = (rnd() * 360 - 180) * (Math.PI / 180);
      const latR = Math.asin(rnd() * 2 - 1); // uniform on sphere
      const bright = rnd() > 0.972;
      stars.push({
        lon: lonR,
        sinLat: Math.sin(latR),
        cosLat: Math.cos(latR),
        r: bright ? rnd() * 0.8 + 0.9 : rnd() * 0.7 + 0.3,
        a: bright ? rnd() * 0.3 + 0.6 : rnd() * 0.4 + 0.15,
        bright,
      });
    }
    // Denser river of stars along the (tilted) galactic band.
    for (let i = 0; i < 1500; i++) {
      const pos = place(rnd() * 360 - 180, gauss() * 11);
      const bright = rnd() > 0.985;
      stars.push({
        ...pos,
        r: bright ? rnd() * 0.7 + 0.8 : rnd() * 0.6 + 0.3,
        a: bright ? rnd() * 0.3 + 0.5 : rnd() * 0.35 + 0.14,
        bright,
      });
    }
    // Soft haze blobs giving the band its milky glow.
    const haze: { lon: number; sinLat: number; cosLat: number; r: number; a: number }[] = [];
    for (let i = 0; i < 54; i++) {
      const pos = place(rnd() * 360 - 180, gauss() * 7);
      haze.push({ ...pos, r: rnd() * 60 + 46, a: rnd() * 0.05 + 0.035 });
    }
    sky.current = { stars, haze };
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

  // Keep the satellite-tile cache bounded (oldest-out).
  function evictTiles() {
    const c = tileCache.current;
    const MAX = 200;
    if (c.size <= MAX) return;
    let over = c.size - MAX;
    for (const k of c.keys()) {
      if (over-- <= 0) break;
      c.delete(k);
    }
  }

  // Fetch + decode one map tile. crossOrigin "anonymous" means a provider
  // without CORS simply fails to load (we fall back to the base texture) — it
  // can never taint the main canvas. First success unlocks deep zoom.
  function fetchTile(template: string, z: number, x: number, y: number, key: string) {
    const c = tileCache.current;
    if (c.has(key)) return;
    c.set(key, { state: "loading" });
    const url = template
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = TILE_SIZE;
        cv.height = TILE_SIZE;
        const cc = cv.getContext("2d", { willReadFrequently: true });
        if (!cc) {
          c.set(key, { state: "err" });
          return;
        }
        cc.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
        const data = cc.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
        c.set(key, { state: "ok", data });
        tilesEverLoaded.current = true;
        if (maxZoom.current < MAX_ZOOM_TILES) maxZoom.current = MAX_ZOOM_TILES;
        evictTiles();
        lastTexKey.current = ""; // invalidate the cached slice so tiles composite in
        settle();
      } catch {
        c.set(key, { state: "err" });
      }
    };
    img.onerror = () => c.set(key, { state: "err" });
    img.src = url;
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
    // While dragging, render a cheap low-res slice; once still, render a much
    // sharper one (cached) so zoomed-in detail from the 4k texture comes through.
    const maxPix = moving ? 200000 : 3500000;
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

    // --- Satellite map tiles for deep zoom (Earth) ---
    // Pick the slippy zoom whose tile resolution matches the on-screen scale,
    // find which tiles the current view touches, gather the loaded ones and
    // request the rest. Pixels without a loaded tile fall back to the base map.
    const template = propsRef.current.tileUrl;
    let grid: (Uint8ClampedArray | undefined)[] | null = null;
    let ntiles = 0;
    let txMin = 0;
    let tyMin = 0;
    let gw = 0;
    let gh = 0;
    if (smooth && template) {
      const rdev = r * q;
      let tz = Math.round(Math.log2((2 * Math.PI * rdev) / TILE_SIZE));
      tz = Math.max(0, Math.min(TILE_Z_MAX, tz));
      if (tz >= 5) {
        ntiles = 2 ** tz;
        let fxMin = Infinity;
        let fxMax = -Infinity;
        let fyMin = Infinity;
        let fyMax = -Infinity;
        const step = Math.max(1, Math.floor(Math.min(ow, oh) / 40));
        for (let j = 0; j < oh; j += step) {
          const sy = ry + ((j + 0.5) / oh) * rh;
          const dyN = (sy - cy) / r;
          for (let i = 0; i < ow; i += step) {
            const sx = rx + ((i + 0.5) / ow) * rw;
            const dxN = (sx - cx) / r;
            if (dxN * dxN + dyN * dyN > 1) continue;
            pt[0] = sx;
            pt[1] = sy;
            const ll = invert(pt);
            if (!ll || Number.isNaN(ll[0])) continue;
            const m = lonLatToMercator(ll[0], ll[1]);
            const fx = m[0] * ntiles;
            const fy = m[1] * ntiles;
            if (fx < fxMin) fxMin = fx;
            if (fx > fxMax) fxMax = fx;
            if (fy < fyMin) fyMin = fy;
            if (fy > fyMax) fyMax = fy;
          }
        }
        if (fxMax >= fxMin) {
          txMin = Math.floor(fxMin);
          tyMin = Math.floor(fyMin);
          gw = Math.floor(fxMax) - txMin + 1;
          gh = Math.floor(fyMax) - tyMin + 1;
          if (gw > 0 && gh > 0 && gw * gh <= MAX_TILES_PER_FRAME) {
            grid = new Array(gw * gh);
            for (let ty = tyMin; ty < tyMin + gh; ty++) {
              if (ty < 0 || ty >= ntiles) continue;
              for (let tx = txMin; tx < txMin + gw; tx++) {
                const wx = ((tx % ntiles) + ntiles) % ntiles;
                const key = `${tz}/${wx}/${ty}`;
                const ent = tileCache.current.get(key);
                if (ent && ent.state === "ok" && ent.data) {
                  grid[(ty - tyMin) * gw + (tx - txMin)] = ent.data;
                } else if (!ent) {
                  fetchTile(template, tz, wx, ty, key);
                }
              }
            }
          } else {
            grid = null;
          }
        }
      }
    }

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
        if (grid) {
          const m = lonLatToMercator(ll[0], ll[1]);
          const fx = m[0] * ntiles;
          const fy = m[1] * ntiles;
          const txi = Math.floor(fx);
          const tyi = Math.floor(fy);
          const col = txi - txMin;
          const row = tyi - tyMin;
          if (col >= 0 && col < gw && row >= 0 && row < gh) {
            const cell = grid[row * gw + col];
            if (cell) {
              let px = ((fx - txi) * TILE_SIZE) | 0;
              let py = ((fy - tyi) * TILE_SIZE) | 0;
              if (px > TILE_SIZE - 1) px = TILE_SIZE - 1;
              if (py > TILE_SIZE - 1) py = TILE_SIZE - 1;
              const s = (py * TILE_SIZE + px) * 4;
              out[o] = cell[s] * shade;
              out[o + 1] = cell[s + 1] * shade;
              out[o + 2] = cell[s + 2] * shade;
              out[o + 3] = 255;
              continue;
            }
          }
        }
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

    // Stars + Milky Way on the celestial sphere — orthographically projected
    // about the same point the globe faces, at a wider "infinity" scale, so they
    // sweep past as you spin and stay put as you zoom. Back-hemisphere points and
    // anything behind the globe disc are culled.
    if (!sky.current) buildSky();
    const skyData = sky.current!;
    const S = Math.hypot(w, h) * 0.7;
    const lambda0 = (-v.rotation[0] * Math.PI) / 180;
    const phi0 = (-v.rotation[1] * Math.PI) / 180;
    const sinPhi0 = Math.sin(phi0);
    const cosPhi0 = Math.cos(phi0);
    const rr = r * r;

    // Soft Milky Way haze first (under the stars).
    for (const hz of skyData.haze) {
      const dl = hz.lon - lambda0;
      const cosdl = Math.cos(dl);
      if (sinPhi0 * hz.sinLat + cosPhi0 * hz.cosLat * cosdl <= 0) continue;
      const px = cx + S * (hz.cosLat * Math.sin(dl));
      const py = cy - S * (cosPhi0 * hz.sinLat - sinPhi0 * hz.cosLat * cosdl);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < rr) continue;
      if (px < -130 || px > w + 130 || py < -130 || py > h + 130) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, hz.r);
      g.addColorStop(0, `rgba(150,168,214,${hz.a})`);
      g.addColorStop(1, "rgba(150,168,214,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, hz.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars.
    for (const st of skyData.stars) {
      const dl = st.lon - lambda0;
      const cosdl = Math.cos(dl);
      if (sinPhi0 * st.sinLat + cosPhi0 * st.cosLat * cosdl <= 0) continue; // back side
      const px = cx + S * (st.cosLat * Math.sin(dl));
      const py = cy - S * (cosPhi0 * st.sinLat - sinPhi0 * st.cosLat * cosdl);
      if (px < 0 || px > w || py < 0 || py > h) continue;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy < rr) continue; // behind the globe
      if (st.bright) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, st.r * 3);
        g.addColorStop(0, `rgba(214,226,245,${st.a * 0.5})`);
        g.addColorStop(1, "rgba(214,226,245,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, st.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = st.a;
      ctx.beginPath();
      ctx.arc(px, py, st.r, 0, Math.PI * 2);
      ctx.fillStyle = "#e8eefb";
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
        const a = Math.sin(t * Math.PI) * 0.8; // fade in then out
        const grad = ctx.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, "rgba(220,232,250,0)");
        grad.addColorStop(0.65, `rgba(225,235,250,${a * 0.45})`);
        grad.addColorStop(1, `rgba(245,249,255,${a})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(hx, hy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#f4f8ff";
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

    // Atmosphere — a whisper-thin halo, intentionally very faint.
    const glow = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r * 1.08);
    glow.addColorStop(0, `rgba(${p.style.atmosphere},0.06)`);
    glow.addColorStop(1, `rgba(${p.style.atmosphere},0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
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

    if (p.style.graticule && !tc && !p.hideData) {
      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Regions / countries, colored by the active metric (translucent over texture).
    // "Beautiful home" mode (hideData) skips every overlay for a clean Earth.
    if (!p.hideData) {
      // Over imagery, fade the data tint out as you zoom in so deep zooms show the
      // real ground; at normal zoom the value map reads as before.
      const zoomFade = clamp(1 - (v.zoom - 10) / 12, 0, 1);
      const fillAlpha = tc ? Math.max(0, Math.min(1, p.overlay)) * zoomFade : 1;
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
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${p.style.atmosphere},0.10)`;
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
  // After interaction stops, force one more draw so the sharp (non-"moving")
  // high-resolution texture slice gets rendered and cached.
  function settle() {
    if (settleTimer.current != null) clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      requestRender();
    }, 260);
  }

  // Zoom so the geographic point under (clientX, clientY) stays put — i.e. zoom
  // toward the cursor instead of the screen center. The globe is always centred,
  // so we set the new zoom and then rotate to re-anchor that point under the
  // cursor (same screen-delta → rotation linearization used for dragging).
  function zoomAt(clientX: number, clientY: number, nextZoom: number) {
    const v = view.current;
    const canvas = canvasRef.current;
    if (!canvas) {
      v.zoom = nextZoom;
      requestRender();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const ll = makeProjection().invert?.([px, py]);
    v.zoom = nextZoom;
    if (ll && !Number.isNaN(ll[0])) {
      for (let iter = 0; iter < 4; iter++) {
        const sp = makeProjection()([ll[0], ll[1]]);
        if (!sp) break;
        const dx = px - sp[0];
        const dy = py - sp[1];
        if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) break;
        const k = 57.29577951 / (v.baseScale * v.zoom);
        v.rotation = [v.rotation[0] + dx * k, clamp(v.rotation[1] - dy * k, -89, 89), 0];
      }
    }
    lastRotate.current = performance.now();
    requestRender();
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
        if (g.pinchDist > 0) {
          const pts = [...pointers.current.values()];
          const midX = (pts[0].x + pts[1].x) / 2;
          const midY = (pts[0].y + pts[1].y) / 2;
          const target = clamp(v.zoom * (d / g.pinchDist), MIN_ZOOM, maxZoom.current);
          zoomAt(midX, midY, target);
        }
        g.pinchDist = d;
        g.moved += 50;
        if (!g.interacted) {
          g.interacted = true;
          onInteractRef.current();
        }
        settle();
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
      settle();
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
      settle();
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const v = view.current;
      const target = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, maxZoom.current);
      zoomAt(e.clientX, e.clientY, target);
      lastInteraction.current = performance.now();
      onInteractRef.current();
      settle();
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
  }, [features, borders, colorForId, selectedId, style, backgroundBodies, textureSrc, tileUrl, overlay, hideData]);

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

  // Deep zoom is only unlocked while satellite tiles are in play; otherwise keep
  // the zoom within the cap the base texture can support.
  useEffect(() => {
    if (!tileUrl) {
      maxZoom.current = MAX_ZOOM_BASE;
      if (view.current.zoom > MAX_ZOOM_BASE) {
        view.current.zoom = MAX_ZOOM_BASE;
        requestRender();
      }
    } else if (tilesEverLoaded.current) {
      maxZoom.current = MAX_ZOOM_TILES;
    }
  }, [tileUrl]);

  useEffect(() => {
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      if (settleTimer.current != null) clearTimeout(settleTimer.current);
      tileCache.current.clear();
    };
  }, []);

  return (
    <div ref={containerRef} className="globe-stage">
      <canvas ref={canvasRef} className="globe-canvas" />
    </div>
  );
}
