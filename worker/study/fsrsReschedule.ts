import type { FsrsPrefs } from "../../src/study/fsrs/fsrsFactory";
import {
  replayCardFromLogs,
  type RescheduleSummary,
  type ReviewLogReplayRow,
} from "../../src/study/fsrs/fsrsReplay";
import { scheduleColumnsFromCard } from "../../src/study/retrievability";
import { prepareFullScheduleUpdate } from "./scheduleWrite";

export {
  replayCardFromLogs,
  type RescheduleSummary,
  type ReviewLogReplayRow,
} from "../../src/study/fsrs/fsrsReplay";

const D1_BATCH_SIZE = 50;

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
    const next = await replayCardFromLogs(logs, prefs, cardId);
    if (!next) {
      cardsSkipped += 1;
      continue;
    }
    const cols = scheduleColumnsFromCard(next);
    statements.push(
      prepareFullScheduleUpdate(
        db,
        {
          due: cols.due,
          stability: cols.stability,
          difficulty: cols.difficulty,
          elapsed_days: cols.elapsed_days,
          scheduled_days: cols.scheduled_days,
          learning_steps: cols.learning_steps,
          reps: cols.reps,
          lapses: cols.lapses,
          state: cols.state,
          last_review: cols.last_review,
          stability_fast: cols.stability_fast,
        },
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
