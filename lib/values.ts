// People aren't points on a left–right line. Instead of opposing sliders, the
// platform asks a simpler, more honest question: "What do you want for where
// you live?" — and lets you pick *everything* you believe in, including hopes
// that the usual political framing insists you must choose between.

export interface Want {
  id: string;
  short: string; // for chips & legends
  label: string; // the full aspiration, phrased positively
  color: string; // accent used when the map is colored by this want
}

export const WANTS: Want[] = [
  { id: "nature", short: "Nature", label: "A thriving natural environment", color: "#34d399" },
  { id: "growth", short: "Growth", label: "A booming, innovative economy", color: "#38bdf8" },
  { id: "community", short: "Community", label: "Strong community & family", color: "#fbbf24" },
  { id: "freedom", short: "Freedom", label: "Personal freedom & rights", color: "#a78bfa" },
  { id: "care", short: "Basic needs", label: "Everyone's basic needs met", color: "#f472b6" },
  { id: "safety", short: "Safety", label: "Safety & low crime", color: "#f87171" },
  { id: "progress", short: "Progress", label: "Science & technology", color: "#22d3ee" },
  { id: "heritage", short: "Heritage", label: "Tradition & heritage", color: "#fb923c" },
  { id: "openness", short: "Openness", label: "Openness to the world", color: "#60a5fa" },
  { id: "beauty", short: "Beauty", label: "Beautiful, well-built places", color: "#c084fc" },
  { id: "fairness", short: "Fairness", label: "Fairness & equal opportunity", color: "#2dd4bf" },
  { id: "leanGov", short: "Lean gov", label: "Lean, efficient government", color: "#cbd5e1" },
  { id: "services", short: "Services", label: "Strong public services", color: "#818cf8" },
  { id: "health", short: "Health", label: "Good health & healthcare", color: "#4ade80" },
  { id: "peace", short: "Peace", label: "Peace & cooperation", color: "#7dd3fc" },
];

export const WANT_BY_ID: Record<string, Want> = Object.fromEntries(
  WANTS.map((w) => [w.id, w])
);

// Pairs the usual framing treats as "either/or" — but you can want both. We
// surface how many people hold both, to push back on the false choice.
export interface TensionPair {
  id: string;
  a: string;
  b: string;
  label: string; // "<a> and <b>"
}

export const TENSION_PAIRS: TensionPair[] = [
  { id: "green_growth", a: "nature", b: "growth", label: "a thriving environment and a booming economy" },
  { id: "free_together", a: "freedom", b: "community", label: "personal freedom and strong community" },
  { id: "roots_open", a: "heritage", b: "openness", label: "tradition and openness to the world" },
  { id: "lean_care", a: "leanGov", b: "services", label: "lean government and strong public services" },
];

// Server-safe (no d3) list of valid worlds, used to validate API input.
export const WORLD_IDS = ["earth", "moon", "mars"] as const;
export type WorldId = (typeof WORLD_IDS)[number];
