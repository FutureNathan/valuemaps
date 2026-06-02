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
const PALETTE = ["#34d399", "#38bdf8", "#fbbf24", "#a78bfa", "#f472b6"];

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
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#eaf1ff" opacity="${op}"/>`;
  }
  return out;
}

function ogSvg() {
  const W = 1200;
  const H = 630;
  const cx = 905;
  const cy = 312;
  const r = 250;
  const blobs = [
    [cx - 95, cy - 70, 150, "#38bdf8"],
    [cx + 55, cy - 115, 130, "#34d399"],
    [cx + 100, cy + 70, 140, "#a78bfa"],
    [cx - 60, cy + 100, 135, "#fbbf24"],
    [cx + 5, cy + 5, 120, "#f472b6"],
  ]
    .map(([x, y, rr, c]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${c}" opacity="0.5"/>`)
    .join("");
  const grat =
    [0.34, 0.62, 0.86]
      .map(
        (f) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * f).toFixed(
            1
          )}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>`
      )
      .join("") +
    [0.34, 0.62, 0.86]
      .map(
        (f) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="${(r * f).toFixed(
            1
          )}" ry="${r}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>`
      )
      .join("") +
    `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="rgba(255,255,255,0.16)"/>`;
  const dots = PALETTE.map((c, i) => `<circle cx="${88 + i * 27}" cy="450" r="6.5" fill="${c}"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="space" cx="62%" cy="44%" r="82%">
      <stop offset="0%" stop-color="#0a0e18"/><stop offset="55%" stop-color="#05070d"/><stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <radialGradient id="ocean" cx="40%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#1e4067"/><stop offset="100%" stop-color="#07111d"/>
    </radialGradient>
    <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
      <stop offset="78%" stop-color="rgba(80,150,255,0)"/><stop offset="92%" stop-color="rgba(86,154,255,0.45)"/><stop offset="100%" stop-color="rgba(86,154,255,0)"/>
    </radialGradient>
    <radialGradient id="moon" cx="38%" cy="34%" r="78%"><stop offset="0%" stop-color="#b6bbc5"/><stop offset="100%" stop-color="#3a3d44"/></radialGradient>
    <radialGradient id="mars" cx="38%" cy="34%" r="78%"><stop offset="0%" stop-color="#d2764f"/><stop offset="100%" stop-color="#4e2418"/></radialGradient>
    <filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26"/></filter>
    <clipPath id="globe"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#space)"/>
  ${stars(W, H, 170, 7)}
  <circle cx="1118" cy="118" r="21" fill="url(#moon)" opacity="0.92"/>
  <circle cx="1152" cy="192" r="12" fill="url(#mars)" opacity="0.92"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.16}" fill="url(#atmo)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ocean)"/>
  <g clip-path="url(#globe)"><g filter="url(#blur)">${blobs}</g>${grat}</g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(120,170,255,0.4)" stroke-width="1.5"/>
  <text x="82" y="206" font-family="${FONT}" font-size="20" letter-spacing="6" fill="#6f7d96">EARTH · MOON · MARS</text>
  <text x="78" y="300" font-family="${FONT}" font-weight="bold" font-size="80" letter-spacing="4" fill="#ffffff">VALUE MAPS</text>
  <text x="82" y="352" font-family="${FONT}" font-size="31" fill="#b3bdd0">What the world actually wants.</text>
  <text x="82" y="394" font-family="${FONT}" font-size="22" fill="#7e8aa0">No left–right boxes — pick every hope you hold.</text>
  ${dots}
</svg>`;
}

function starSvg(size, withBg) {
  const k = size / 180;
  const p = (n) => (n * k).toFixed(2);
  const bg = withBg
    ? `<rect width="${size}" height="${size}" rx="${p(40)}" fill="#0a0e16"/>
       <rect width="${size}" height="${size}" rx="${p(40)}" fill="url(#bg)"/>
       ${stars(size, size, Math.round(size / 6), 11)}`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="star" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#cfe2ff"/><stop offset="100%" stop-color="#5aa0ff"/>
    </radialGradient>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="rgba(40,70,130,0.5)"/><stop offset="100%" stop-color="rgba(10,14,22,0)"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="rgba(120,170,255,0.55)"/><stop offset="100%" stop-color="rgba(120,170,255,0)"/></radialGradient>
  </defs>
  ${bg}
  <circle cx="${p(90)}" cy="${p(88)}" r="${p(70)}" fill="url(#glow)"/>
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
  await render(ogSvg(), 1200, 630, "opengraph-image.jpg");
  await render(ogSvg(), 1200, 630, "twitter-image.jpg");
  await render(starSvg(180, true), 180, 180, "apple-icon.png");
  await render(starSvg(48, false), 48, 48, "icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
