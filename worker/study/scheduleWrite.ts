import { Rating, type Grade } from "ts-fsrs";

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
};

/** Map numeric review rating to ts-fsrs Grade; null when not 1–4. */
export function ratingToGrade(rating: number): Grade | null {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
    default:
      return null;
  }
}

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
           state = ?, last_review = ?
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
