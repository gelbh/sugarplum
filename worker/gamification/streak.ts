import { STREAK_FREEZE, utcDay } from "./constants";
import { ensureUserGamification } from "./xp";

export function utcPreviousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return utcDay(dt);
}

/** Pure streak from sorted distinct UTC days (ascending). No DB I/O. */
export function computeStreakFromSortedDays(days: string[]): {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
} {
  if (days.length === 0) {
    return { streakCurrent: 0, streakBest: 0, streakDay: null };
  }

  let streakBest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] === utcPreviousDay(days[i]!)) {
      run += 1;
      if (run > streakBest) streakBest = run;
    } else {
      run = 1;
    }
  }

  let streakCurrent = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (days[i - 1] === utcPreviousDay(days[i]!)) {
      streakCurrent += 1;
    } else {
      break;
    }
  }

  return {
    streakCurrent,
    streakBest,
    streakDay: days[days.length - 1]!,
  };
}

/** Decay current streak when last study day is older than yesterday UTC. */
export function applyStreakExpiry(
  streak: {
    streakCurrent: number;
    streakBest: number;
    streakDay: string | null;
  },
  today = utcDay(),
): {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
} {
  if (
    streak.streakDay === today ||
    streak.streakDay === utcPreviousDay(today)
  ) {
    return streak;
  }
  return {
    streakCurrent: 0,
    streakBest: streak.streakBest,
    streakDay: streak.streakDay,
  };
}

export function wouldExpireStreak(
  streakDay: string | null,
  today = utcDay(),
): boolean {
  if (streakDay == null) return false;
  return (
    streakDay !== today && streakDay !== utcPreviousDay(today)
  );
}

/** Whole UTC days between streakDay and yesterday (each needs one freeze). */
export function missedDaysNeedingFreeze(
  streakDay: string,
  today = utcDay(),
): number {
  const yesterday = utcPreviousDay(today);
  if (streakDay >= yesterday) return 0;
  let count = 0;
  let cursor = streakDay;
  while (cursor < yesterday) {
    const [y, m, d] = cursor.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    cursor = utcDay(dt);
    count += 1;
    if (count > 366) break;
  }
  return count;
}

/**
 * If the streak would expire, consume one freeze per missed UTC day (up to
 * stock). Else persist streak_current = 0 only when still expired and freezes
 * are 0 (avoids racing a concurrent study write).
 * Freeze is not a study day for medals.
 */
export async function reconcileStreakWithFreeze(
  db: D1Database,
  userId: string,
  today = utcDay(),
): Promise<{ consumedFreeze: boolean; consumedCount: number }> {
  await ensureUserGamification(db, userId);

  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day, streak_freezes
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      streak_current: number;
      streak_best: number;
      streak_day: string | null;
      streak_freezes: number | null;
    }>();

  if (!row || row.streak_day == null || !wouldExpireStreak(row.streak_day, today)) {
    return { consumedFreeze: false, consumedCount: 0 };
  }

  const freezes = row.streak_freezes ?? 0;
  const needed = missedDaysNeedingFreeze(row.streak_day, today);
  const now = new Date().toISOString();
  const yesterday = utcPreviousDay(today);

  if (needed > 0 && freezes >= needed && row.streak_current > 0) {
    const upd = await db
      .prepare(
        `UPDATE user_gamification
         SET streak_freezes = streak_freezes - ?,
             streak_day = ?,
             updated_at = ?
         WHERE user_id = ?
           AND streak_freezes >= ?
           AND streak_day = ?`,
      )
      .bind(needed, yesterday, now, userId, needed, row.streak_day)
      .run();

    if ((upd.meta.changes ?? 0) > 0) {
      for (let i = 0; i < needed; i++) {
        await db
          .prepare(
            `INSERT INTO streak_freeze_events (
               id, user_id, consumed_at, streak_at_consume
             ) VALUES (?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), userId, now, row.streak_current)
          .run();
      }
      return { consumedFreeze: true, consumedCount: needed };
    }
  }

  // Only clear when still expired and out of freezes (or not enough).
  await db
    .prepare(
      `UPDATE user_gamification
       SET streak_current = 0, updated_at = ?
       WHERE user_id = ?
         AND streak_current > 0
         AND streak_day IS NOT NULL
         AND streak_day < ?
         AND streak_freezes < ?`,
    )
    .bind(now, userId, yesterday, needed > 0 ? needed : 1)
    .run();

  return { consumedFreeze: false, consumedCount: 0 };
}

/** Earn one freeze when crossing a multiple of earnEveryDays, up to maxStored. */
export async function maybeEarnStreakFreeze(
  db: D1Database,
  userId: string,
  previousStreak: number,
  newStreak: number,
): Promise<{ earned: boolean }> {
  if (newStreak <= previousStreak) return { earned: false };
  const step = STREAK_FREEZE.earnEveryDays;
  const crossed =
    Math.floor(previousStreak / step) < Math.floor(newStreak / step);
  if (!crossed) return { earned: false };

  const upd = await db
    .prepare(
      `UPDATE user_gamification
       SET streak_freezes = MIN(streak_freezes + 1, ?),
           updated_at = ?
       WHERE user_id = ? AND streak_freezes < ?`,
    )
    .bind(
      STREAK_FREEZE.maxStored,
      new Date().toISOString(),
      userId,
      STREAK_FREEZE.maxStored,
    )
    .run();

  return { earned: (upd.meta.changes ?? 0) > 0 };
}

export async function applyStudyDayStreak(
  db: D1Database,
  userId: string,
  day: string,
): Promise<{
  streakCurrent: number;
  streakBest: number;
  isFirstReviewOfDay: boolean;
}> {
  await ensureUserGamification(db, userId);
  await reconcileStreakWithFreeze(db, userId, day);

  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      streak_current: number;
      streak_best: number;
      streak_day: string | null;
    }>();

  const streakDay = row?.streak_day ?? null;
  if (streakDay === day) {
    return {
      streakCurrent: row?.streak_current ?? 0,
      streakBest: row?.streak_best ?? 0,
      isFirstReviewOfDay: false,
    };
  }

  const yesterday = utcPreviousDay(day);
  const previousStreak = row?.streak_current ?? 0;
  let streakCurrent = 1;
  if (streakDay === yesterday) {
    streakCurrent = previousStreak + 1;
  }

  const streakBest = Math.max(row?.streak_best ?? 0, streakCurrent);
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE user_gamification
       SET streak_current = ?, streak_best = ?, streak_day = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(streakCurrent, streakBest, day, updatedAt, userId)
    .run();

  await maybeEarnStreakFreeze(db, userId, previousStreak, streakCurrent);

  return { streakCurrent, streakBest, isFirstReviewOfDay: true };
}
