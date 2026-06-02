// The value dimensions people position themselves on. These are intentionally
// independent axes (not a single left/right line) so a region can read, say,
// market-leaning on the economy but progressive socially.

export type AxisId =
  | "economic"
  | "social"
  | "governance"
  | "environment"
  | "openness";

export interface Axis {
  id: AxisId;
  /** Short name used in the map's "color by" selector. */
  label: string;
  /** Prompt shown above the slider in the share form. */
  question: string;
  /** Label at the -100 end. */
  left: string;
  /** Label at the +100 end. */
  right: string;
  /** Color for strongly-left regions. */
  leftColor: string;
  /** Color for strongly-right regions. */
  rightColor: string;
}

export const AXES: Axis[] = [
  {
    id: "economic",
    label: "Economy",
    question: "How should the economy work?",
    left: "Public & shared",
    right: "Market & private",
    leftColor: "#ef4444",
    rightColor: "#3b82f6",
  },
  {
    id: "social",
    label: "Social",
    question: "How should society change?",
    left: "Traditional",
    right: "Progressive",
    leftColor: "#f59e0b",
    rightColor: "#14b8a6",
  },
  {
    id: "governance",
    label: "Power",
    question: "Who should hold power?",
    left: "Strong state",
    right: "Personal liberty",
    leftColor: "#a855f7",
    rightColor: "#22c55e",
  },
  {
    id: "environment",
    label: "Environment",
    question: "Growth or the planet?",
    left: "Growth first",
    right: "Planet first",
    leftColor: "#a16207",
    rightColor: "#16a34a",
  },
  {
    id: "openness",
    label: "Borders",
    question: "How open should we be to the world?",
    left: "National & local",
    right: "Global & open",
    leftColor: "#f97316",
    rightColor: "#0ea5e9",
  },
];

export const AXIS_BY_ID: Record<AxisId, Axis> = Object.fromEntries(
  AXES.map((a) => [a.id, a])
) as Record<AxisId, Axis>;

// The concrete things people say they care about. Aggregated into a per-region
// "top concerns" list.
export const TOPICS: string[] = [
  "Healthcare",
  "Education",
  "Jobs & Economy",
  "Housing",
  "Environment",
  "Public Safety",
  "Privacy & Rights",
  "Immigration",
  "Taxes",
  "Infrastructure",
  "Family & Community",
  "Faith & Tradition",
  "Equality",
  "Technology",
  "Democracy",
];

export const MAX_TOPICS = 5;
