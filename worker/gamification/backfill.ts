import { evaluateAchievements } from "./evaluate";
import {
  applyStreakExpiry,
  computeStreakFromSortedDays,
} from "./streak";
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

const inFlight = new Map<string, Promise<void>>();

/** Silent historical unlocks + streak_best. Concurrent calls share one run. */
export function backfillUser(db: D1Database, userId: string): Promise<void> {
  // ponytail: single-flight is per isolate; cross-isolate repeats stay safe
  // because every write is an upsert or idempotent key. Upgrade: a D1 lease row.
  const running = inFlight.get(userId);
  if (running) return running;
  const run = runBackfill(db, userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, run);
  return run;
}

/** Idempotent via the ledger marker. */
async function runBackfill(db: D1Database, userId: string): Promise<void> {
  await ensureUserGamification(db, userId);
  if (await alreadyBackfilled(db, userId)) return;

  const days = await listStudyDaysAscending(db, userId);
  const streak = applyStreakExpiry(computeStreakFromSortedDays(days));
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE user_gamification
       SET streak_current = ?, streak_best = ?, streak_day = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      streak.streakCurrent,
      streak.streakBest,
      streak.streakDay,
      updatedAt,
      userId,
    )
    .run();

  await evaluateAchievements(db, userId, {
    triggerEventId: null,
    nowIso: updatedAt,
    backdated: 1,
  });

  await creditXp(db, userId, 0, "backfill", backfillKey(userId));
}
