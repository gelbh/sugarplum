import { State } from "ts-fsrs";

/** Interval days for Mature; same threshold as gamification `MATURE_DAYS`. */
export const MATURE_INTERVAL_DAYS = 21;

export type KnowledgeScheduleInput = {
  state: number | null;
  /** FSRS scheduled interval in days; used for Young vs Mature. */
  scheduled_days: number | null;
};

export type SubjectKnowledgeBuckets = {
  new: number;
  learning: number;
  young: number;
  mature: number;
};

export type SubjectKnowledge = SubjectKnowledgeBuckets & {
  total: number;
  graduated: number;
  graduatedPct: number | null;
  avgRetrievability: number | null;
  etk: number;
};

export type KnowledgeBucket = keyof SubjectKnowledgeBuckets;

export function classifyKnowledgeBucket(
  row: KnowledgeScheduleInput,
): KnowledgeBucket {
  if (row.state == null) return "new";
  if (row.state === State.New) return "new";
  if (row.state === State.Learning || row.state === State.Relearning) {
    return "learning";
  }
  if (row.state === State.Review) {
    const interval = row.scheduled_days ?? 0;
    return interval >= MATURE_INTERVAL_DAYS ? "mature" : "young";
  }
  return "new";
}

export function aggregateSubjectKnowledge(
  rows: KnowledgeScheduleInput[],
): Omit<SubjectKnowledge, "avgRetrievability" | "etk"> {
  const buckets: SubjectKnowledgeBuckets = {
    new: 0,
    learning: 0,
    young: 0,
    mature: 0,
  };
  for (const row of rows) {
    buckets[classifyKnowledgeBucket(row)] += 1;
  }
  const total =
    buckets.new + buckets.learning + buckets.young + buckets.mature;
  const graduated = buckets.young + buckets.mature;
  return {
    ...buckets,
    total,
    graduated,
    graduatedPct: total === 0 ? null : Math.round((100 * graduated) / total),
  };
}
