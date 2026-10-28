import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";

export type { Card, Grade, ReviewLog };
export { Rating };

/** Fresh FSRS schedule card for an accepted draft (due defaults to now). */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Apply an FSRS grade; returns the updated schedule card. */
export function review(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): Card {
  return fsrs().next(card, now, rating).card;
}

/** Full FSRS step including the review log (for persistence). */
export function reviewWithLog(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): { card: Card; log: ReviewLog } {
  return fsrs().next(card, now, rating);
}

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

function toIso(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Numeric FSRS retrievability at `now`, or null when unavailable / on error.
 * Uses `get_retrievability(..., false)` from ts-fsrs ^5.
 */
export function retrievability(
  card: Card,
  now: Date = new Date(),
): number | null {
  try {
    const r = fsrs().get_retrievability(card, now, false);
    if (typeof r !== "number" || Number.isNaN(r)) return null;
    return r;
  } catch {
    return null;
  }
}

/** Map a ts-fsrs Card into card_schedules column values. */
export function scheduleColumnsFromCard(card: Card): {
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
} {
  const due = toIso(card.due);
  if (!due) throw new Error("FSRS card missing due");
  return {
    due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: Number(card.state),
    last_review: toIso(card.last_review ?? null),
  };
}
