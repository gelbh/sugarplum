import {
  applyCutoverMemory,
  replayMemoryFromLogs,
} from "../../src/study/fsrsCutover";
import type { FsrsPrefs } from "../../src/study/fsrsFactory";
import type { ReviewLogReplayRow } from "../../src/study/fsrsReplay";
import {
  cardFromScheduleRow,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "../../src/study/retrievability";
import { prepareFullScheduleUpdate } from "./scheduleWrite";

const D1_BATCH_SIZE = 50;

export type CutoverSummary = {
  cardsUpdated: number;
  cardsSkipped: number;
};

type LogRow = {
  card_id: string;
  reviewed_at: string;
  rating: number;
  schedule_card_id: string | null;
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  learning_steps: number | null;
  reps: number | null;
  lapses: number | null;
  state: number | null;
  last_review: string | null;
  stability_fast: number | null;
};

/**
 * FSRS-7 cutover: rebuild memory via Reschedule.replay; preserve dues.
 * Skips cards that already have stability_fast or lack usable history.
 */
export async function cutoverUserSchedulesToFsrs7(
  db: D1Database,
  userId: string,
  prefs: FsrsPrefs,
): Promise<CutoverSummary> {
  const { results } = await db
    .prepare(
      `SELECT rl.card_id AS card_id,
              rl.reviewed_at AS reviewed_at,
              rl.rating AS rating,
              cs.card_id AS schedule_card_id,
              cs.due AS due,
              cs.stability AS stability,
              cs.difficulty AS difficulty,
              cs.elapsed_days AS elapsed_days,
              cs.scheduled_days AS scheduled_days,
              cs.learning_steps AS learning_steps,
              cs.reps AS reps,
              cs.lapses AS lapses,
              cs.state AS state,
              cs.last_review AS last_review,
              cs.stability_fast AS stability_fast
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN card_schedules cs ON cs.card_id = rl.card_id
       WHERE d.user_id = ?
       ORDER BY rl.reviewed_at ASC`,
    )
    .bind(userId)
    .all<LogRow>();

  const logsByCard = new Map<string, ReviewLogReplayRow[]>();
  const scheduleByCard = new Map<string, ScheduleRowLike>();
  for (const row of results ?? []) {
    if (row.schedule_card_id == null || row.due == null) continue;
    if (row.stability_fast != null) continue;
    const list = logsByCard.get(row.card_id) ?? [];
    list.push({ reviewed_at: row.reviewed_at, rating: row.rating });
    logsByCard.set(row.card_id, list);
    scheduleByCard.set(row.card_id, {
      due: row.due,
      stability: row.stability ?? 0,
      difficulty: row.difficulty ?? 0,
      elapsed_days: row.elapsed_days ?? 0,
      scheduled_days: row.scheduled_days ?? 0,
      learning_steps: row.learning_steps ?? 0,
      reps: row.reps ?? 0,
      lapses: row.lapses ?? 0,
      state: row.state ?? 0,
      last_review: row.last_review,
      stability_fast: row.stability_fast,
      card_id: row.card_id,
    });
  }

  let cardsUpdated = 0;
  let cardsSkipped = 0;
  const statements: D1PreparedStatement[] = [];

  for (const [cardId, logs] of logsByCard) {
    const schedule = scheduleByCard.get(cardId);
    if (!schedule) {
      cardsSkipped += 1;
      continue;
    }
    const memory = await replayMemoryFromLogs(logs, {
      ...prefs,
      enableFuzz: false,
      modelVersion: "FSRS-7",
    });
    if (!memory) {
      cardsSkipped += 1;
      continue;
    }
    const dueBefore = schedule.due;
    const next = applyCutoverMemory(cardFromScheduleRow(schedule), memory);
    const cols = scheduleColumnsFromCard(next);
    if (cols.due !== dueBefore) {
      cols.due = dueBefore;
    }
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
