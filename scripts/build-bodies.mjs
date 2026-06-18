// Renders beautiful little shaded planets for the background "travel" bodies by
// orthographically projecting public-domain equirectangular maps onto a sphere.
//
//   npm run build:bodies
//
// Outputs (committed): public/body-earth.png, body-moon.png, body-mars.png
// Source maps: jeromeetienne/threex.planets (1000x500 equirectangular).

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const COMPUTE = 512; // supersampled, then downscaled for crisp edges
const OUT = 256;

const BODIES = [
  { id: "earth", url: "8k_earth_daymap.jpg", lon0: -32, lat0: 18, ambient: 0.4 },
  { id: "moon", url: "8k_moon.jpg", lon0: 0, lat0: 0, ambient: 0.32 },
  { id: "mars", url: "8k_mars.jpg", lon0: -60, lat0: 6, ambient: 0.36 },
];
// Solar System Scope textures (CC BY 4.0, based on NASA imagery), 8192x4096,
// pulled from a public mirror (Git LFS media endpoint).
const BASE =
  "https://media.githubusercontent.com/media/computationalcore/worldline-kinematics/bda6e586435fc5956b3a350bde88766a14e3b7b6/apps/web/public/textures/";

const D = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

async function loadMap(file) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`${res.status} ${file}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { buf, data, w: info.width, h: info.height, ch: info.channels };
}

function sampleBilinear(map, lon, lat, out) {
  let u = ((lon + 180) / 360) * map.w;
  let v = ((90 - lat) / 180) * map.h;
  u = ((u % map.w) + map.w) % map.w;
  v = clamp(v, 0, map.h - 1);
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

async function render(body) {
  const map = await loadMap(body.url);
  const N = COMPUTE;
  const R = N / 2;
  const lon0 = body.lon0 * D;
  const lat0 = body.lat0 * D;
  const sinLat0 = Math.sin(lat0);
  const cosLat0 = Math.cos(lat0);
  // Light from upper-left, toward viewer.
  const L = [-0.35, 0.45, 0.82];
  const Ll = Math.hypot(...L);
  const lx = L[0] / Ll;
  const ly = L[1] / Ll;
  const lz = L[2] / Ll;

  const px = new Uint8ClampedArray(N * N * 4);
  const rgb = [0, 0, 0];
  for (let j = 0; j < N; j++) {
    const Y = (R - j - 0.5) / R; // up-positive, normalized
    for (let i = 0; i < N; i++) {
      const x = (i + 0.5 - R) / R; // right-positive
      const rho = Math.hypot(x, Y);
      const o = (j * N + i) * 4;
      if (rho > 1.002) continue; // transparent outside disc
      const c = Math.asin(clamp(rho, 0, 1));
      const sinc = Math.sin(c);
      const cosc = Math.cos(c);
      let lat;
      let lon;
      if (rho < 1e-6) {
        lat = lat0;
        lon = lon0;
      } else {
        lat = Math.asin(clamp(cosc * sinLat0 + (Y * sinc * cosLat0) / rho, -1, 1));
        lon = lon0 + Math.atan2(x * sinc, rho * cosLat0 * cosc - Y * sinLat0 * sinc);
      }
      sampleBilinear(map, (lon / D + 540) % 360 - 180, lat / D, rgb);

      // Shade: diffuse from a sphere normal (x, Y, z) with z toward viewer.
      const z = Math.sqrt(Math.max(0, 1 - rho * rho));
      const diff = Math.max(0, x * lx + Y * ly + z * lz);
      const shade = body.ambient + (1 - body.ambient) * diff;
      const edge = clamp((1 - rho) * R, 0, 1); // ~1px feather

      px[o] = rgb[0] * shade;
      px[o + 1] = rgb[1] * shade;
      px[o + 2] = rgb[2] * shade;
      px[o + 3] = 255 * edge;
    }
  }

  await sharp(Buffer.from(px.buffer), { raw: { width: N, height: N, channels: 4 } })
    .resize(OUT, OUT)
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, `body-${body.id}.png`));
  console.log(`  wrote public/body-${body.id}.png (${OUT}x${OUT})`);

  // Equirectangular textures for the interactive "satellite" overlay, in two
  // tiers: a small one for an instant first paint, and a 4k one that the client
  // swaps in progressively for crisp detail when zoomed in.
  await sharp(map.buf)
    .resize(1024, 512, { fit: "fill" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(PUBLIC, `tex-${body.id}.jpg`));
  await sharp(map.buf)
    .resize(4096, 2048, { fit: "fill" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(PUBLIC, `tex-${body.id}-hi.jpg`));
  console.log(`  wrote public/tex-${body.id}.jpg (1024x512) + -hi (4096x2048)`);
}

async function main() {
  console.log("Rendering celestial bodies…");
  for (const b of BODIES) await render(b);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
