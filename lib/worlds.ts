// Each "world" is a globe you can spin and assign values to. Earth uses real
// country geometry; the Moon and Mars use a hand-picked set of named regions,
// rendered as spherical caps (geoCircle polygons) so they fill and select with
// exactly the same pipeline as countries.

import { geoCircle } from "d3-geo";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { WorldId } from "./values";

export interface WorldStyle {
  sphereInner: string;
  sphereOuter: string;
  atmosphere: string; // "r,g,b"
  graticule: boolean;
  outlineFeatures: boolean; // stroke each region (Moon/Mars) so they're findable
}

export interface BodyColors {
  inner: string;
  outer: string;
}

export interface RegionDef {
  id: string;
  name: string;
  lng: number;
  lat: number;
  r: number; // angular radius, degrees
}

export interface World {
  id: WorldId;
  name: string;
  tagline: string;
  kind: "countries" | "regions";
  hasReference: boolean;
  defaultSource: string;
  style: WorldStyle;
  body: BodyColors; // how it looks as a small background disc
  initialRotation: [number, number, number];
  regions?: RegionDef[];
}

const MOON_REGIONS: RegionDef[] = [
  { id: "tranquillitatis", name: "Mare Tranquillitatis", lng: 31, lat: 8, r: 13 },
  { id: "tranquility-base", name: "Tranquility Base (Apollo 11)", lng: 23, lat: 1, r: 4 },
  { id: "serenitatis", name: "Mare Serenitatis", lng: 17, lat: 28, r: 11 },
  { id: "imbrium", name: "Mare Imbrium", lng: -16, lat: 33, r: 15 },
  { id: "procellarum", name: "Oceanus Procellarum", lng: -57, lat: 19, r: 19 },
  { id: "crisium", name: "Mare Crisium", lng: 59, lat: 17, r: 9 },
  { id: "nectaris", name: "Mare Nectaris", lng: 34, lat: -15, r: 8 },
  { id: "frigoris", name: "Mare Frigoris", lng: 0, lat: 56, r: 14 },
  { id: "humorum", name: "Mare Humorum", lng: -38, lat: -24, r: 8 },
  { id: "tycho", name: "Tycho", lng: -11, lat: -43, r: 6 },
  { id: "copernicus", name: "Copernicus", lng: -20, lat: 10, r: 5 },
  { id: "plato", name: "Plato", lng: -9, lat: 51, r: 5 },
  { id: "clavius", name: "Clavius", lng: -14, lat: -58, r: 7 },
  { id: "aristarchus", name: "Aristarchus", lng: -47, lat: 24, r: 4 },
  { id: "orientale", name: "Mare Orientale", lng: -95, lat: -20, r: 10 },
  { id: "sp-aitken", name: "South Pole–Aitken", lng: 170, lat: -75, r: 16 },
  { id: "farside", name: "Far-Side Highlands", lng: 150, lat: 5, r: 18 },
  { id: "north-pole-moon", name: "North Polar Region", lng: 0, lat: 85, r: 11 },
];

const MARS_REGIONS: RegionDef[] = [
  { id: "olympus", name: "Olympus Mons", lng: -134, lat: 18, r: 7 },
  { id: "tharsis", name: "Tharsis Montes", lng: -112, lat: 1, r: 10 },
  { id: "marineris", name: "Valles Marineris", lng: -70, lat: -11, r: 12 },
  { id: "hellas", name: "Hellas Planitia", lng: 70, lat: -42, r: 14 },
  { id: "argyre", name: "Argyre Planitia", lng: -43, lat: -50, r: 9 },
  { id: "arabia", name: "Arabia Terra", lng: 5, lat: 21, r: 16 },
  { id: "elysium", name: "Elysium", lng: 147, lat: 25, r: 9 },
  { id: "utopia", name: "Utopia Planitia", lng: 118, lat: 47, r: 15 },
  { id: "amazonis", name: "Amazonis Planitia", lng: -160, lat: 25, r: 12 },
  { id: "syrtis", name: "Syrtis Major", lng: 70, lat: 8, r: 8 },
  { id: "isidis", name: "Isidis Planitia", lng: 88, lat: 13, r: 8 },
  { id: "gale", name: "Gale Crater (Curiosity)", lng: 137, lat: -5, r: 4 },
  { id: "jezero", name: "Jezero Crater (Perseverance)", lng: 77, lat: 18, r: 3 },
  { id: "chryse", name: "Chryse Planitia (Viking 1)", lng: -50, lat: 23, r: 10 },
  { id: "meridiani", name: "Meridiani Planum (Opportunity)", lng: -6, lat: -2, r: 7 },
  { id: "tempe", name: "Tempe Terra", lng: -71, lat: 40, r: 9 },
  { id: "north-pole-mars", name: "North Polar Cap", lng: 0, lat: 85, r: 12 },
  { id: "south-pole-mars", name: "South Polar Cap", lng: 0, lat: -85, r: 12 },
];

export const WORLDS: World[] = [
  {
    id: "earth",
    name: "Earth",
    tagline: "What does the world actually want?",
    kind: "countries",
    hasReference: true,
    defaultSource: "happiness",
    style: {
      sphereInner: "#16304d",
      sphereOuter: "#08111c",
      atmosphere: "64,128,235",
      graticule: true,
      outlineFeatures: false,
    },
    body: { inner: "#2a5a86", outer: "#0a1a2e" },
    initialRotation: [70, -18, 0],
  },
  {
    id: "moon",
    name: "The Moon",
    tagline: "If we settle here, what should it stand for?",
    kind: "regions",
    hasReference: false,
    defaultSource: "community",
    style: {
      sphereInner: "#6b6f78",
      sphereOuter: "#26282d",
      atmosphere: "200,205,215",
      graticule: false,
      outlineFeatures: true,
    },
    body: { inner: "#8a8e96", outer: "#34363b" },
    initialRotation: [-20, -10, 0],
    regions: MOON_REGIONS,
  },
  {
    id: "mars",
    name: "Mars",
    tagline: "A fresh start — what do we want it to be?",
    kind: "regions",
    hasReference: false,
    defaultSource: "community",
    style: {
      sphereInner: "#b15a3c",
      sphereOuter: "#4e2418",
      atmosphere: "235,140,90",
      graticule: false,
      outlineFeatures: true,
    },
    body: { inner: "#c06a48", outer: "#4e2418" },
    initialRotation: [40, -12, 0],
    regions: MARS_REGIONS,
  },
];

export const WORLD_BY_ID: Record<string, World> = Object.fromEntries(
  WORLDS.map((w) => [w.id, w])
);

/** Build GeoJSON features (spherical caps) for a regions-based world. */
export function regionFeatures(world: World): Feature<Geometry, GeoJsonProperties>[] {
  if (!world.regions) return [];
  return world.regions.map((r) => ({
    type: "Feature",
    id: r.id,
    properties: { name: r.name },
    geometry: geoCircle().center([r.lng, r.lat]).radius(r.r)(),
  }));
}

export function regionCentroids(world: World): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const r of world.regions ?? []) m.set(r.id, [r.lng, r.lat]);
  return m;
}

export function regionNames(world: World): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of world.regions ?? []) m.set(r.id, r.name);
  return m;
}
