import { utcDay } from "./constants";
import { ensureUserGamification } from "./xp";

export function utcPreviousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return utcDay(dt);
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
  let streakCurrent = 1;
  if (streakDay === yesterday) {
    streakCurrent = (row?.streak_current ?? 0) + 1;
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

  return { streakCurrent, streakBest, isFirstReviewOfDay: true };
}
