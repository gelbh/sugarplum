import { createEmptyCard, type Card } from "ts-fsrs";

export type { Card };

/** Fresh FSRS schedule card for an accepted draft (due defaults to now). */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

function toIso(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
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
