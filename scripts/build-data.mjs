// Builds public/reference-data.json from authoritative open datasets.
//
// Run with:  npm run build:data
//
// The output is COMMITTED to the repo so the app ships with real data even if a
// deploy environment can't reach GitHub. Re-run this to refresh the snapshot.
//
// Sources (all open / publicly mirrored):
//   - ISO country-code crosswalk ......... datasets/country-codes
//   - Hofstede cultural dimensions ....... plotly/datasets
//   - World Happiness Report 2024 ........ Sustainable Development Solutions Network
//   - Human Development Index (UNDP) ..... openwashdata/worldhdi
//
// Everything is pre-joined to the world-atlas numeric country ids the globe
// uses, so the client needs zero mapping logic at runtime.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const URLS = {
  countryCodes:
    "https://raw.githubusercontent.com/datasets/country-codes/master/data/country-codes.csv",
  hofstede:
    "https://raw.githubusercontent.com/plotly/datasets/master/hofstede-cultural-dimensions.csv",
  happiness:
    "https://raw.githubusercontent.com/Escavine/World-Happiness/main/World-happiness-report-2024.csv",
  hdi: "https://raw.githubusercontent.com/openwashdata/worldhdi/main/inst/extdata/worldhdi.csv",
};

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} fetching ${url}`);
  return r.text();
}

// Minimal RFC-4180-ish CSV parser with a configurable delimiter.
function parseCSV(text, delim = ",") {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => {
      const o = {};
      header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      return o;
    });
}

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Names that differ between the happiness report and the ISO crosswalk.
const NAME_ALIASES = {
  "taiwan province of china": "TWN",
  "hong kong s a r of china": "HKG",
  "congo brazzaville": "COG",
  "congo kinshasa": "COD",
  "palestinian territories": "PSE",
  "state of palestine": "PSE",
  turkiye: "TUR",
  "north macedonia": "MKD",
  "great britain": "GBR",
  "u s a": "USA",
  "korea south": "KOR",
  "korea north": "PRK",
  "czech rep": "CZE",
  "slovak rep": "SVK",
  "ivory coast": "CIV",
  swaziland: "SWZ",
  "cape verde": "CPV",
  "south korea": "KOR",
  "north korea": "PRK",
  laos: "LAO",
  syria: "SYR",
  moldova: "MDA",
  tanzania: "TZA",
  bolivia: "BOL",
  venezuela: "VEN",
  vietnam: "VNM",
  russia: "RUS",
  "united states": "USA",
};

async function main() {
  // World-atlas ids the globe actually renders (numeric -> exact id string).
  const topo = JSON.parse(readFileSync(join(ROOT, "public/countries-110m.json"), "utf8"));
  const atlasByNumeric = new Map();
  const atlasName = new Map();
  for (const g of topo.objects.countries.geometries) {
    atlasByNumeric.set(parseInt(String(g.id), 10), String(g.id));
    atlasName.set(String(g.id), g.properties?.name || String(g.id));
  }
  const toAtlas = (numeric) => atlasByNumeric.get(parseInt(numeric, 10)) || null;

  // Crosswalk: ISO3 / names -> world-atlas id.
  const cc = parseCSV(await get(URLS.countryCodes));
  const alpha3ToAtlas = {};
  const nameToAtlas = {};
  for (const r of cc) {
    const a3 = r["ISO3166-1-Alpha-3"];
    const numeric = r["ISO3166-1-numeric"];
    if (!a3 || !numeric) continue;
    const atlas = toAtlas(numeric);
    if (!atlas) continue;
    alpha3ToAtlas[a3.toUpperCase()] = atlas;
    for (const col of ["official_name_en", "CLDR display name", "UNTERM English Short"]) {
      const nm = norm(r[col]);
      if (nm) nameToAtlas[nm] = atlas;
    }
  }
  // Also let the globe's own country names resolve.
  for (const [id, name] of atlasName) nameToAtlas[norm(name)] = nameToAtlas[norm(name)] || id;

  const data = { hofstede: {}, happiness: {}, hdi: {} };
  const report = {};

  // --- Hofstede (note: `ctr` uses Hofstede's own codes, e.g. GER/CHI/AUL, so
  //     match by country NAME via the crosswalk, with a code fallback) ---
  {
    const rows = parseCSV(await get(URLS.hofstede), ";");
    const dims = { pdi: "pdi", idv: "idv", mas: "mas", uai: "uai", ltowvs: "lto", ivr: "ivr" };
    let matched = 0;
    const missed = [];
    for (const r of rows) {
      const n = norm(r.country);
      const atlas =
        nameToAtlas[n] ||
        alpha3ToAtlas[NAME_ALIASES[n] || ""] ||
        alpha3ToAtlas[(r.ctr || "").toUpperCase()] ||
        null;
      if (!atlas) {
        if (r.country) missed.push(r.country);
        continue;
      }
      const rec = {};
      for (const [src, key] of Object.entries(dims)) {
        const v = num(r[src]);
        if (v != null) rec[key] = v;
      }
      // Don't overwrite a better (country-level) record with a sub-region row.
      if (Object.keys(rec).length && !data.hofstede[atlas]) {
        data.hofstede[atlas] = rec;
        matched++;
      }
    }
    report.hofstede = matched;
    report.hofstedeMissed = missed;
  }

  // --- World Happiness Report 2024 (country names) ---
  {
    const rows = parseCSV(await get(URLS.happiness));
    let matched = 0;
    const missed = [];
    for (const r of rows) {
      const name = r["Country name"];
      const n = norm(name);
      const atlas = nameToAtlas[n] || alpha3ToAtlas[NAME_ALIASES[n] || ""] || null;
      if (!atlas) {
        if (name) missed.push(name);
        continue;
      }
      const rec = {};
      const ladder = num(r["Ladder score"]);
      const social = num(r["Social support"]);
      const freedom = num(r["Freedom to make life choices"]);
      const generosity = num(r["Generosity"]);
      if (ladder != null) rec.ladder = ladder;
      if (social != null) rec.social = social;
      if (freedom != null) rec.freedom = freedom;
      if (generosity != null) rec.generosity = generosity;
      if (Object.keys(rec).length) {
        data.happiness[atlas] = rec;
        matched++;
      }
    }
    report.happiness = matched;
    report.happinessMissed = missed;
  }

  // --- Human Development Index 2022 (UNDP, ISO3 in `iso3c`) ---
  {
    const rows = parseCSV(await get(URLS.hdi));
    let matched = 0;
    for (const r of rows) {
      const atlas = alpha3ToAtlas[(r.iso3c || "").toUpperCase()];
      if (!atlas) continue;
      const v = num(r.hdi_2022) ?? num(r.hdi_2021);
      if (v != null) {
        data.hdi[atlas] = { hdi: v };
        matched++;
      }
    }
    report.hdi = matched;
  }

  const out = {
    meta: { generatedAt: new Date().toISOString().slice(0, 10), counts: report },
    data,
  };
  writeFileSync(join(ROOT, "public/reference-data.json"), JSON.stringify(out));

  console.log("Reference data built:");
  console.log("  Hofstede countries:", report.hofstede);
  console.log("  Happiness countries:", report.happiness);
  console.log("  HDI countries:", report.hdi);
  if (report.happinessMissed.length)
    console.log("  Happiness UNMATCHED:", report.happinessMissed.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
