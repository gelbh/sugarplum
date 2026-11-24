import { State } from "ts-fsrs";
import { cardFromScheduleRow, retrievability } from "../fsrs/retrievability";
import { aggregateSubjectRecall } from "./subjectRecall";

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

/** Buckets + graduated derived fields (no recall). */
export type SubjectKnowledgeBucketsAggregate = SubjectKnowledgeBuckets & {
  total: number;
  graduated: number;
  graduatedPct: number | null;
};

export type SubjectKnowledge = SubjectKnowledgeBucketsAggregate & {
  avgRetrievability: number | null;
  etk: number;
  recallCardCount: number;
};

/** Schedule row for shared composition (buckets + R). Nulls → null R. */
export type CompositionScheduleInput = KnowledgeScheduleInput & {
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  last_review: string | null;
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
): SubjectKnowledgeBucketsAggregate {
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

export function composeSubjectKnowledge(
  rows: CompositionScheduleInput[],
  now: Date = new Date(),
): SubjectKnowledge {
  const bucketRows = rows.map((r) => ({
    state: r.state,
    scheduled_days: r.scheduled_days,
  }));
  const rValues = rows.map((row) => {
    if (
      row.due == null ||
      row.stability == null ||
      row.difficulty == null ||
      row.elapsed_days == null ||
      row.scheduled_days == null ||
      row.learning_steps == null ||
      row.reps == null ||
      row.lapses == null ||
      row.state == null
    ) {
      return null;
    }
    try {
      return retrievability(
        cardFromScheduleRow({
          due: row.due,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsed_days: row.elapsed_days,
          scheduled_days: row.scheduled_days,
          learning_steps: row.learning_steps,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          last_review: row.last_review,
        }),
        now,
      );
    } catch {
      return null;
    }
  });
  return {
    ...aggregateSubjectKnowledge(bucketRows),
    ...aggregateSubjectRecall(rValues),
  };
}
