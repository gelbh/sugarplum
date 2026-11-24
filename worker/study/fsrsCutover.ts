import { replayMemoryFromLogs } from "../../src/study/fsrs/fsrsCutover";
import type { FsrsPrefs } from "../../src/study/fsrs/fsrsFactory";
import type { ReviewLogReplayRow } from "../../src/study/fsrs/fsrsReplay";
import type { ScheduleRowLike } from "../../src/study/fsrs/retrievability";
import { prepareCutoverMemoryUpdate } from "./scheduleWrite";

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
 * Skips cards that already have positive stability_fast or lack usable history.
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
    if (
      row.stability_fast != null &&
      Number.isFinite(row.stability_fast) &&
      row.stability_fast > 0
    ) {
      continue;
    }
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
    statements.push(
      prepareCutoverMemoryUpdate(
        db,
        {
          stability: memory.stability,
          difficulty: memory.difficulty,
          stability_fast: memory.stabilityFast,
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
