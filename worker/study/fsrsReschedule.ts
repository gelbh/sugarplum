import { createEmptyCard, Rating, type Card, type Grade } from "ts-fsrs";
import { fsrsForPrefs, type FsrsPrefs } from "../../src/study/fsrsFactory";
import { scheduleColumnsFromCard } from "../../src/study/retrievability";

const D1_BATCH_SIZE = 50;

export type ReviewLogReplayRow = {
  reviewed_at: string;
  rating: number;
};

export type RescheduleSummary = {
  cardsUpdated: number;
  cardsSkipped: number;
};

function ratingToGrade(rating: number): Grade | null {
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

export function replayCardFromLogs(
  logs: readonly ReviewLogReplayRow[],
  prefs: FsrsPrefs,
): Card | null {
  const scheduler = fsrsForPrefs({ ...prefs, enableFuzz: false });
  const ordered = [...logs].sort((a, b) =>
    a.reviewed_at.localeCompare(b.reviewed_at),
  );
  let card: Card | null = null;
  for (const row of ordered) {
    const when = Date.parse(row.reviewed_at);
    if (!Number.isFinite(when)) continue;
    const grade = ratingToGrade(row.rating);
    if (grade == null) continue;
    const now = new Date(when);
    const base: Card = card ?? createEmptyCard(now);
    card = scheduler.next(base, now, grade).card;
  }
  return card;
}

type LogRow = {
  card_id: string;
  reviewed_at: string;
  rating: number;
  schedule_card_id: string | null;
};

/** Leaves review_logs immutable; skips cards with no schedule or no valid logs. */
export async function rescheduleUserSchedules(
  db: D1Database,
  userId: string,
  prefs: FsrsPrefs,
): Promise<RescheduleSummary> {
  const { results } = await db
    .prepare(
      `SELECT rl.card_id AS card_id,
              rl.reviewed_at AS reviewed_at,
              rl.rating AS rating,
              cs.card_id AS schedule_card_id
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN card_schedules cs ON cs.card_id = rl.card_id
       WHERE d.user_id = ?
       ORDER BY rl.reviewed_at ASC`,
    )
    .bind(userId)
    .all<LogRow>();

  const byCard = new Map<string, ReviewLogReplayRow[]>();
  const hasSchedule = new Set<string>();
  for (const row of results ?? []) {
    if (row.schedule_card_id != null) hasSchedule.add(row.card_id);
    const list = byCard.get(row.card_id) ?? [];
    list.push({ reviewed_at: row.reviewed_at, rating: row.rating });
    byCard.set(row.card_id, list);
  }

  let cardsUpdated = 0;
  let cardsSkipped = 0;
  const statements: D1PreparedStatement[] = [];

  for (const [cardId, logs] of byCard) {
    if (!hasSchedule.has(cardId)) {
      cardsSkipped += 1;
      continue;
    }
    const next = replayCardFromLogs(logs, prefs);
    if (!next) {
      cardsSkipped += 1;
      continue;
    }
    const cols = scheduleColumnsFromCard(next);
    statements.push(
      db
        .prepare(
          `UPDATE card_schedules SET
             due = ?, stability = ?, difficulty = ?, elapsed_days = ?,
             scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
             state = ?, last_review = ?
           WHERE card_id = ?
             AND EXISTS (
               SELECT 1 FROM cards c
               INNER JOIN decks d ON d.id = c.deck_id
               WHERE c.id = card_schedules.card_id AND d.user_id = ?
             )`,
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
        ),
    );
    cardsUpdated += 1;
  }

  for (let i = 0; i < statements.length; i += D1_BATCH_SIZE) {
    await db.batch(statements.slice(i, i + D1_BATCH_SIZE));
  }

  return { cardsUpdated, cardsSkipped };
}
