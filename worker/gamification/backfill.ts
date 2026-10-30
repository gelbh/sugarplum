import { evaluateAchievements } from "./evaluate";
import {
  applyStreakExpiry,
  computeStreakFromSortedDays,
} from "./streak";
import { creditXp, ensureUserGamification } from "./xp";

function backfillKey(userId: string): string {
  return `backfill:v1:${userId}`;
}

/** ponytail: keyed on active def count; swapping one def for another at the same count skips this. Upgrade: key on a catalog hash. */
async function catalogKey(db: D1Database, userId: string): Promise<string> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM achievement_defs WHERE active = 1`)
    .first<{ n: number }>();
  return `backfill:catalog:n${Number(row?.n ?? 0)}:${userId}`;
}

/**
 * Silently backdates medals added since an established user's last backfill.
 * Users without the v1 marker keep live unlocks; backfillUser covers them.
 */
export async function catalogBackfill(
  db: D1Database,
  userId: string,
): Promise<void> {
  const key = await catalogKey(db, userId);
  const { results } = await db
    .prepare(
      `SELECT idempotency_key FROM xp_ledger
       WHERE user_id = ? AND idempotency_key IN (?, ?)`,
    )
    .bind(userId, backfillKey(userId), key)
    .all<{ idempotency_key: string }>();
  const held = new Set((results ?? []).map((r) => r.idempotency_key));
  if (!held.has(backfillKey(userId)) || held.has(key)) return;

  await evaluateAchievements(db, userId, {
    triggerEventId: null,
    nowIso: new Date().toISOString(),
    backdated: 1,
  });
  await creditXp(db, userId, 0, "backfill", key);
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

/** Silent historical unlocks + streak_best; idempotent via ledger marker. */
export async function backfillUser(
  db: D1Database,
  userId: string,
): Promise<void> {
  // ponytail: no single-flight; concurrent runs repeat reads, but every write
  // is an upsert or idempotent key. An in-memory promise shared across Worker
  // requests can hang if its request is cancelled. Upgrade: a D1 lease row.
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
  await creditXp(db, userId, 0, "backfill", await catalogKey(db, userId));
}
