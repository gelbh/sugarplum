import { fsrs, State, type Card } from "ts-fsrs";

export type ScheduleRowLike = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

/** Rebuild a ts-fsrs Card from card_schedules columns. */
export function cardFromScheduleRow(row: ScheduleRowLike): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/**
 * Numeric FSRS retrievability at `now`, or null when unavailable / on error.
 * Uses `get_retrievability(..., false)` from ts-fsrs ^5.
 */
export function retrievability(
  card: Card,
  now: Date = new Date(),
): number | null {
  // New / never-reviewed: FSRS often reports R=0, which is not a real recall
  // probability for Insights (would score every new card as weakness 2).
  if (card.state === State.New || card.last_review == null) return null;
  try {
    const r = fsrs().get_retrievability(card, now, false);
    if (typeof r !== "number" || Number.isNaN(r)) return null;
    return r;
  } catch {
    return null;
  }
}
