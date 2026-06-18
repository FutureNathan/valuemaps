// Generates the social-share image and app icons from SVG, using sharp.
//
//   npm run build:images
//
// Outputs (committed) are read by Next's file-based metadata convention:
//   app/opengraph-image.png  app/twitter-image.png  app/apple-icon.png  app/icon.png

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");
const FONT = "DejaVu Sans, sans-serif";

function stars(w, h, n, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (rnd() * w).toFixed(1);
    const y = (rnd() * h).toFixed(1);
    const big = rnd() > 0.9;
    const r = (big ? rnd() * 1.5 + 1.1 : rnd() * 1.1 + 0.4).toFixed(2);
    const op = (big ? rnd() * 0.3 + 0.7 : rnd() * 0.5 + 0.2).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#e8eefb" opacity="${op}"/>`;
  }
  return out;
}

// Real Earth imagery (Solar System Scope, CC BY 4.0) for the share card globe.
const EARTH_URL =
  "https://media.githubusercontent.com/media/computationalcore/worldline-kinematics/bda6e586435fc5956b3a350bde88766a14e3b7b6/apps/web/public/textures/8k_earth_daymap.jpg";
const D = Math.PI / 180;
const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

function sampleBilinear(map, lon, lat, out) {
  let u = ((lon + 180) / 360) * map.w;
  let v = ((90 - lat) / 180) * map.h;
  u = ((u % map.w) + map.w) % map.w;
  v = clampv(v, 0, map.h - 1);
  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const u1 = (u0 + 1) % map.w;
  const v1 = Math.min(v0 + 1, map.h - 1);
  const fu = u - u0;
  const fv = v - v0;
  for (let c = 0; c < 3; c++) {
    const a = map.data[(v0 * map.w + u0) * map.ch + c];
    const b = map.data[(v0 * map.w + u1) * map.ch + c];
    const d = map.data[(v1 * map.w + u0) * map.ch + c];
    const e = map.data[(v1 * map.w + u1) * map.ch + c];
    out[c] = a * (1 - fu) * (1 - fv) + b * fu * (1 - fv) + d * (1 - fu) * fv + e * fu * fv;
  }
}

// Orthographically project the real Earth map to a shaded sphere (supersampled),
// transparent outside the disc so the atmosphere glow shows around it.
async function renderEarth(size) {
  const map = await loadMap(EARTH_URL);
  const SS = 2;
  const N = size * SS;
  const R = N / 2;
  const lon0 = -42 * D;
  const lat0 = 20 * D;
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  const L = [-0.42, 0.5, 0.76];
  const Ll = Math.hypot(...L);
  const lx = L[0] / Ll;
  const ly = L[1] / Ll;
  const lz = L[2] / Ll;
  const ambient = 0.58;
  const px = new Uint8ClampedArray(N * N * 4);
  const rgb = [0, 0, 0];
  for (let j = 0; j < N; j++) {
    const Y = (R - j - 0.5) / R;
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5 - R) / R;
      const rho = Math.hypot(x, Y);
      const o = (j * N + i) * 4;
      if (rho > 1.002) continue;
      const c = Math.asin(clampv(rho, 0, 1));
      const sinc = Math.sin(c);
      const cosc = Math.cos(c);
      let lat;
      let lon;
      if (rho < 1e-6) {
        lat = lat0;
        lon = lon0;
      } else {
        lat = Math.asin(clampv(cosc * sinLat0 + (Y * sinc * cosLat0) / rho, -1, 1));
        lon = lon0 + Math.atan2(x * sinc, rho * cosLat0 * cosc - Y * sinLat0 * sinc);
      }
      sampleBilinear(map, ((lon / D + 540) % 360) - 180, lat / D, rgb);
      const z = Math.sqrt(Math.max(0, 1 - rho * rho));
      const diff = Math.max(0, x * lx + Y * ly + z * lz);
      const shade = ambient + (1 - ambient) * diff;
      const edge = clampv((1 - rho) * R, 0, 1);
      px[o] = rgb[0] * shade;
      px[o + 1] = rgb[1] * shade;
      px[o + 2] = rgb[2] * shade;
      px[o + 3] = 255 * edge;
    }
  }
  return sharp(Buffer.from(px.buffer), { raw: { width: N, height: N, channels: 4 } })
    .resize(size, size)
    .png()
    .toBuffer();
}

// Premium share card: a real topographic Earth on a calm starfield, minimal text.
async function ogImage() {
  const W = 1200;
  const H = 630;
  const dia = 512;
  const cx = 922;
  const cy = 315;
  const earth = await renderEarth(dia);
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="space" cx="64%" cy="46%" r="90%">
      <stop offset="0%" stop-color="#0a0d14"/><stop offset="55%" stop-color="#04060a"/><stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
      <stop offset="88%" stop-color="rgba(150,190,240,0)"/><stop offset="95%" stop-color="rgba(150,190,240,0.13)"/><stop offset="98%" stop-color="rgba(120,165,225,0.05)"/><stop offset="100%" stop-color="rgba(120,165,225,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#space)"/>
  ${stars(W, H, 150, 7)}
  <circle cx="${cx}" cy="${cy}" r="${(dia / 2) * 1.12}" fill="url(#atmo)"/>
  <text x="84" y="292" font-family="${FONT}" font-weight="bold" font-size="74" letter-spacing="2" fill="#ffffff">Value Maps</text>
  <text x="88" y="344" font-family="${FONT}" font-size="29" fill="#cdd5e3">Visualizing the world's values.</text>
</svg>`;
  const left = Math.round(cx - dia / 2);
  const top = Math.round(cy - dia / 2);
  return sharp(Buffer.from(bg))
    .composite([{ input: earth, left, top }])
    .jpeg({ quality: 88, mozjpeg: true });
}

function starSvg(size, withBg) {
  const k = size / 180;
  const p = (n) => (n * k).toFixed(2);
  const bg = withBg
    ? `<rect width="${size}" height="${size}" rx="${p(40)}" fill="#06070a"/>
       <rect width="${size}" height="${size}" rx="${p(40)}" fill="url(#bg)"/>
       ${stars(size, size, Math.round(size / 7), 11)}`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="star" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#eef1f6"/><stop offset="100%" stop-color="#cdd5e2"/>
    </radialGradient>
    <radialGradient id="bg" cx="50%" cy="38%" r="72%"><stop offset="0%" stop-color="rgba(36,52,84,0.45)"/><stop offset="100%" stop-color="rgba(6,7,10,0)"/></radialGradient>
  </defs>
  ${bg}
  <path d="M${p(90)} ${p(16)} Q${p(101)} ${p(79)} ${p(164)} ${p(90)} Q${p(101)} ${p(101)} ${p(90)} ${p(164)} Q${p(79)} ${p(101)} ${p(16)} ${p(90)} Q${p(79)} ${p(79)} ${p(90)} ${p(16)} Z" fill="url(#star)"/>
</svg>`;
}

async function render(svg, w, h, out) {
  let img = sharp(Buffer.from(svg)).resize(w, h);
  img = /\.jpe?g$/.test(out) ? img.jpeg({ quality: 84, mozjpeg: true }) : img.png();
  await img.toFile(join(APP, out));
  const { statSync } = await import("node:fs");
  console.log(`  wrote app/${out} (${w}x${h}, ${Math.round(statSync(join(APP, out)).size / 1024)}KB)`);
}

async function main() {
  console.log("Building social images…");
  // JPEG for the share card keeps it small enough for every chat app's preview.
  const og = await ogImage();
  await og.clone().toFile(join(APP, "opengraph-image.jpg"));
  await og.clone().toFile(join(APP, "twitter-image.jpg"));
  console.log("  wrote app/opengraph-image.jpg + twitter-image.jpg (1200x630)");
  await render(starSvg(180, true), 180, 180, "apple-icon.png");
  await render(starSvg(48, false), 48, 48, "icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
