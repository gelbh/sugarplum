import { ratingToGrade } from "../../src/study/fsrsReplay";

export { ratingToGrade };

const OWNERSHIP_EXISTS = `AND EXISTS (
               SELECT 1 FROM cards c
               INNER JOIN decks d ON d.id = c.deck_id
               WHERE c.id = card_schedules.card_id AND d.user_id = ?
             )`;

export type ScheduleWriteCols = {
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
  stability_fast?: number | null;
};

/** Owned full-column card_schedules UPDATE (reschedule + grade). */
export function prepareFullScheduleUpdate(
  db: D1Database,
  cols: ScheduleWriteCols,
  cardId: string,
  userId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE card_schedules SET
           due = ?, stability = ?, difficulty = ?, elapsed_days = ?,
           scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
           state = ?, last_review = ?, stability_fast = ?
         WHERE card_id = ?
           ${OWNERSHIP_EXISTS}`,
    )
    .bind(
      cols.due,
      cols.stability,
      cols.difficulty,
      cols.elapsed_days,
      cols.scheduled_days,
      cols.learning_steps,
      cols.reps,
      cols.lapses,
      cols.state,
      cols.last_review,
      cols.stability_fast ?? null,
      cardId,
      userId,
    );
}

/** Owned FSRS-7 cutover memory-only UPDATE (preserves counters/due). */
export function prepareCutoverMemoryUpdate(
  db: D1Database,
  memory: {
    stability: number;
    difficulty: number;
    stability_fast: number;
  },
  cardId: string,
  userId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE card_schedules SET
           stability = ?, difficulty = ?, stability_fast = ?
         WHERE card_id = ?
           AND (stability_fast IS NULL OR stability_fast = 0)
           ${OWNERSHIP_EXISTS}`,
    )
    .bind(
      memory.stability,
      memory.difficulty,
      memory.stability_fast,
      cardId,
      userId,
    );
}

/** Owned due-only card_schedules UPDATE (deferrals). */
export function prepareDueOnlyUpdate(
  db: D1Database,
  due: string,
  cardId: string,
  userId: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE card_schedules SET due = ?
         WHERE card_id = ?
           ${OWNERSHIP_EXISTS}`,
    )
    .bind(due, cardId, userId);
}
