import { State } from "ts-fsrs";

export const MATURE_STABILITY_DAYS = 21;

export type KnowledgeScheduleInput = {
  state: number | null;
  stability: number | null;
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
    const s = row.stability ?? 0;
    return s >= MATURE_STABILITY_DAYS ? "mature" : "young";
  }
  return "new";
}

export function aggregateSubjectKnowledge(
  rows: KnowledgeScheduleInput[],
): SubjectKnowledge {
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
