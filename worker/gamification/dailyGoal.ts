import { DAILY_GOAL_REVIEWS, XP, utcDay } from "./constants";
import { creditXp } from "./xp";

export type DailyGoalProgress = {
  goal: number;
  current: number;
  met: boolean;
};

export function clampDailyGoalReviews(n: number): number {
  if (!Number.isFinite(n)) return DAILY_GOAL_REVIEWS.default;
  return Math.min(
    DAILY_GOAL_REVIEWS.max,
    Math.max(DAILY_GOAL_REVIEWS.min, Math.round(n)),
  );
}

export async function countReviewsOnUtcDay(
  db: D1Database,
  userId: string,
  day: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
         AND rl.reviewed_at >= ?
         AND rl.reviewed_at <= ?`,
    )
    .bind(userId, `${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function getDailyGoalProgress(
  db: D1Database,
  userId: string,
  day = utcDay(),
): Promise<DailyGoalProgress> {
  const row = await db
    .prepare(
      `SELECT daily_goal_reviews, daily_goal_day
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ daily_goal_reviews: number | null; daily_goal_day: string | null }>();

  const goal = clampDailyGoalReviews(
    row?.daily_goal_reviews ?? DAILY_GOAL_REVIEWS.default,
  );
  const current = await countReviewsOnUtcDay(db, userId, day);
  const met = row?.daily_goal_day === day || current >= goal;
  return { goal, current: Math.min(current, goal), met };
}

/** Once per UTC day when reviews hit the goal; independent of streak. */
export async function afterReviewMaybeCompleteDailyGoal(
  db: D1Database,
  userId: string,
  day: string,
): Promise<{ awarded: boolean }> {
  const row = await db
    .prepare(
      `SELECT daily_goal_reviews, daily_goal_day
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ daily_goal_reviews: number | null; daily_goal_day: string | null }>();

  if (row?.daily_goal_day === day) {
    return { awarded: false };
  }

  const goal = clampDailyGoalReviews(
    row?.daily_goal_reviews ?? DAILY_GOAL_REVIEWS.default,
  );
  const current = await countReviewsOnUtcDay(db, userId, day);
  if (current < goal) {
    return { awarded: false };
  }

  const result = await creditXp(
    db,
    userId,
    XP.dailyGoalComplete,
    "daily_goal",
    `daily_goal:${day}`,
  );

  if (result.awarded) {
    await db
      .prepare(
        `UPDATE user_gamification
         SET daily_goal_day = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(day, new Date().toISOString(), userId)
      .run();
  }

  return { awarded: result.awarded };
}
