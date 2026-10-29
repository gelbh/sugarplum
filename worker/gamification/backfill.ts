import {
  loadActiveDefs,
  loadStudyMetrics,
  metricValue,
  tryUnlock,
} from "./evaluate";
import { applyStudyDayStreak } from "./streak";
import { creditXp, ensureUserGamification } from "./xp";

function backfillKey(userId: string): string {
  return `backfill:v1:${userId}`;
}

async function alreadyBackfilled(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS ok FROM xp_ledger
       WHERE user_id = ? AND idempotency_key = ?`,
    )
    .bind(userId, backfillKey(userId))
    .first<{ ok: number }>();
  return row != null;
}

async function listStudyDaysAscending(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT substr(rl.reviewed_at, 1, 10) AS study_day
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`,
    )
    .bind(userId)
    .all<{ study_day: string }>();
  return (results ?? [])
    .map((r) => r.study_day)
    .filter(Boolean)
    .sort();
}

async function rebuildStreakFromHistory(
  db: D1Database,
  userId: string,
): Promise<void> {
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE user_gamification
       SET streak_current = 0, streak_best = 0, streak_day = NULL, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(updatedAt, userId)
    .run();

  const days = await listStudyDaysAscending(db, userId);
  for (const day of days) {
    await applyStudyDayStreak(db, userId, day);
  }
}

/** Silent historical unlocks + streak_best; idempotent via ledger marker. */
export async function backfillUser(
  db: D1Database,
  userId: string,
): Promise<void> {
  await ensureUserGamification(db, userId);
  if (await alreadyBackfilled(db, userId)) return;

  await rebuildStreakFromHistory(db, userId);

  const nowIso = new Date().toISOString();
  const defs = await loadActiveDefs(db);
  const metrics = await loadStudyMetrics(db, userId, nowIso);

  for (const def of defs) {
    const value = metricValue(def, metrics);
    await tryUnlock(db, userId, def, value, null, 1);
  }

  await creditXp(db, userId, 0, "backfill", backfillKey(userId));
}
