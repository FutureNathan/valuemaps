/** Everything we keep for one region. Only anonymous tallies are stored. */
export interface Aggregate {
  count: number;
  wants: Record<string, number>; // how many people want each thing
  pairs: Record<string, number>; // how many want both halves of a "tension pair"
}

export type RegionAggregates = Record<string, Aggregate>;

/** One person's response: the things they want for a place. */
export interface Submission {
  worldId: string;
  regionId: string;
  wants: string[];
}
