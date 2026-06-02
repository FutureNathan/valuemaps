// A "data source" is one lens on the map. The Community source is the values
// people share on this site (the 5 axes from axes.ts). The others are real,
// reputable open datasets, pre-joined to the globe in public/reference-data.json
// by scripts/build-data.mjs.

import { AXES } from "./axes";
import {
  NEUTRAL_HEX,
  NO_DATA_COLOR,
  divergingColorDomain,
  sequentialColor,
} from "./colors";

export type Scale = "diverging" | "sequential";

export interface Metric {
  id: string;
  label: string;
  low: string; // legend label at the domain minimum
  high: string; // legend label at the domain maximum
  domain: [number, number];
  scale: Scale;
  lowColor: string;
  highColor: string;
  midColor?: string; // optional mid stop for sequential ramps
  decimals?: number;
  unit?: string;
}

export interface DataSource {
  id: string;
  label: string;
  kind: "community" | "reference";
  blurb: string;
  attribution?: string;
  url?: string;
  year?: string;
  metrics: Metric[];
}

// Community = the platform's own responses, one metric per value axis.
const communityMetrics: Metric[] = AXES.map((a) => ({
  id: a.id,
  label: a.label,
  low: a.left,
  high: a.right,
  domain: [-100, 100],
  scale: "diverging",
  lowColor: a.leftColor,
  highColor: a.rightColor,
  decimals: 0,
}));

const GOOD = { lowColor: "#b91c1c", midColor: "#f59e0b", highColor: "#16a34a" };

export const SOURCES: DataSource[] = [
  {
    id: "community",
    label: "Community",
    kind: "community",
    blurb: "What people on this site have shared about their own values.",
    metrics: communityMetrics,
  },
  {
    id: "happiness",
    label: "World Happiness",
    kind: "reference",
    blurb: "Self-reported life evaluations and what underpins them (2021–2023 avg).",
    attribution: "World Happiness Report 2024",
    url: "https://worldhappiness.report/",
    year: "2024",
    metrics: [
      { id: "ladder", label: "Happiness", low: "Lower", high: "Higher", domain: [2.5, 7.9], scale: "sequential", ...GOOD, decimals: 2 },
      { id: "social", label: "Social support", low: "Less", high: "More", domain: [0.4, 1.6], scale: "sequential", ...GOOD, decimals: 2 },
      { id: "freedom", label: "Freedom", low: "Less", high: "More", domain: [0.2, 0.9], scale: "sequential", ...GOOD, decimals: 2 },
      { id: "generosity", label: "Generosity", low: "Less", high: "More", domain: [-0.3, 0.5], scale: "sequential", ...GOOD, decimals: 2 },
    ],
  },
  {
    id: "hofstede",
    label: "Cultural values",
    kind: "reference",
    blurb: "Hofstede's six dimensions of national culture.",
    attribution: "Geert Hofstede — dimension data matrix",
    url: "https://geerthofstede.com/research-and-vsm/dimension-data-matrix/",
    metrics: [
      { id: "idv", label: "Individualism", low: "Collectivist", high: "Individualist", domain: [0, 100], scale: "diverging", lowColor: "#f59e0b", highColor: "#3b82f6", decimals: 0 },
      { id: "pdi", label: "Power distance", low: "Flat", high: "Hierarchical", domain: [0, 100], scale: "diverging", lowColor: "#0ea5e9", highColor: "#f97316", decimals: 0 },
      { id: "mas", label: "Competitiveness", low: "Cooperative", high: "Competitive", domain: [0, 100], scale: "diverging", lowColor: "#14b8a6", highColor: "#a855f7", decimals: 0 },
      { id: "uai", label: "Uncertainty avoidance", low: "Relaxed", high: "Avoidant", domain: [0, 100], scale: "diverging", lowColor: "#22c55e", highColor: "#ef4444", decimals: 0 },
      { id: "lto", label: "Long-term focus", low: "Short-term", high: "Long-term", domain: [0, 100], scale: "diverging", lowColor: "#f97316", highColor: "#0ea5e9", decimals: 0 },
      { id: "ivr", label: "Indulgence", low: "Restraint", high: "Indulgence", domain: [0, 100], scale: "diverging", lowColor: "#6366f1", highColor: "#f59e0b", decimals: 0 },
    ],
  },
  {
    id: "hdi",
    label: "Human Development",
    kind: "reference",
    blurb: "UNDP's Human Development Index — health, education and income.",
    attribution: "UNDP Human Development Report (HDI 2022)",
    url: "https://hdr.undp.org/data-center",
    year: "2022",
    metrics: [
      { id: "hdi", label: "HDI", low: "Lower", high: "Very high", domain: [0.38, 0.97], scale: "sequential", ...GOOD, decimals: 3 },
    ],
  },
];

export const SOURCE_BY_ID: Record<string, DataSource> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s])
);

export function metricColor(m: Metric, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NO_DATA_COLOR;
  return m.scale === "sequential"
    ? sequentialColor(v, m.domain, m.lowColor, m.highColor, m.midColor)
    : divergingColorDomain(v, m.domain, m.lowColor, m.highColor);
}

export function legendGradient(m: Metric): string {
  if (m.scale === "sequential") {
    return m.midColor
      ? `linear-gradient(90deg, ${m.lowColor}, ${m.midColor} 50%, ${m.highColor})`
      : `linear-gradient(90deg, ${m.lowColor}, ${m.highColor})`;
  }
  return `linear-gradient(90deg, ${m.lowColor}, ${NEUTRAL_HEX} 50%, ${m.highColor})`;
}

/** 0..1 position of a value within a metric's domain (for marker placement). */
export function normalizedPosition(m: Metric, v: number): number {
  const [min, max] = m.domain;
  return Math.max(0, Math.min(1, (v - min) / ((max - min) || 1)));
}

export function formatValue(m: Metric, v: number): string {
  return v.toFixed(m.decimals ?? 0) + (m.unit ?? "");
}
