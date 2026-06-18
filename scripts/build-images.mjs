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

function ogSvg() {
  const W = 1200;
  const H = 630;
  const cx = 905;
  const cy = 312;
  const r = 250;
  const grat =
    [0.34, 0.62, 0.86]
      .map(
        (f) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * f).toFixed(
            1
          )}" fill="none" stroke="rgba(210,228,250,0.12)" stroke-width="1"/>`
      )
      .join("") +
    [0.34, 0.62, 0.86]
      .map(
        (f) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="${(r * f).toFixed(
            1
          )}" ry="${r}" fill="none" stroke="rgba(210,228,250,0.12)" stroke-width="1"/>`
      )
      .join("") +
    `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="rgba(210,228,250,0.12)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="space" cx="62%" cy="44%" r="85%">
      <stop offset="0%" stop-color="#0a0d14"/><stop offset="55%" stop-color="#04060a"/><stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <radialGradient id="ocean" cx="38%" cy="32%" r="80%">
      <stop offset="0%" stop-color="#4a93cf"/><stop offset="55%" stop-color="#1d5e9c"/><stop offset="100%" stop-color="#08243f"/>
    </radialGradient>
    <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
      <stop offset="86%" stop-color="rgba(200,222,250,0)"/><stop offset="96%" stop-color="rgba(200,222,250,0.35)"/><stop offset="100%" stop-color="rgba(200,222,250,0)"/>
    </radialGradient>
    <radialGradient id="spec" cx="34%" cy="28%" r="42%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.4)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <radialGradient id="moon" cx="38%" cy="34%" r="78%"><stop offset="0%" stop-color="#b6bbc5"/><stop offset="100%" stop-color="#3a3d44"/></radialGradient>
    <radialGradient id="mars" cx="38%" cy="34%" r="78%"><stop offset="0%" stop-color="#d2764f"/><stop offset="100%" stop-color="#4e2418"/></radialGradient>
    <clipPath id="globe"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#space)"/>
  ${stars(W, H, 150, 7)}
  <circle cx="1120" cy="120" r="19" fill="url(#moon)" opacity="0.85"/>
  <circle cx="1150" cy="190" r="11" fill="url(#mars)" opacity="0.85"/>
  <circle cx="${cx}" cy="${cy}" r="${(r * 1.12).toFixed(1)}" fill="url(#atmo)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#ocean)"/>
  <g clip-path="url(#globe)">${grat}<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#spec)"/></g>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(200,222,250,0.4)" stroke-width="1.25"/>
  <text x="82" y="206" font-family="${FONT}" font-size="20" letter-spacing="6" fill="#8b96ad">EARTH · MOON · MARS</text>
  <text x="78" y="300" font-family="${FONT}" font-weight="bold" font-size="80" letter-spacing="4" fill="#ffffff">VALUE MAPS</text>
  <text x="82" y="352" font-family="${FONT}" font-size="31" fill="#d5dae3">What the world actually wants.</text>
  <text x="82" y="394" font-family="${FONT}" font-size="22" fill="#8b8890">No left–right boxes — pick every hope you hold.</text>
</svg>`;
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
  await render(ogSvg(), 1200, 630, "opengraph-image.jpg");
  await render(ogSvg(), 1200, 630, "twitter-image.jpg");
  await render(starSvg(180, true), 180, 180, "apple-icon.png");
  await render(starSvg(48, false), 48, 48, "icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
