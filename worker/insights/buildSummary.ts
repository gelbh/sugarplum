import {
  buildGradeCounts,
  buildReviewsPerDay,
  insightDayKeys,
  INSIGHTS_ACTIVITY_DAYS,
  INSIGHTS_GRADE_DAYS,
  INSIGHTS_REVIEWS_DAYS,
  ratingsInLocalWindow,
} from "../../src/insights/buildSeries";
import type { InsightsSummary } from "../../src/insights/types";
import { resolveLocalDayStartIso } from "../../src/study/localDay";
import {
  composeSubjectKnowledge,
  type CompositionScheduleInput,
} from "../../src/study/subjectKnowledge";
import { ensureUserGamification } from "../gamification/xp";

export type InsightsSummaryOpts = {
  now: Date;
  tzOffsetMinutes: number;
  localDay?: string | null;
};

type ReviewRow = {
  card_id: string;
  reviewed_at: string;
  rating: number;
};

type ScheduleRow = CompositionScheduleInput;

export async function buildInsightsSummary(
  db: D1Database,
  userId: string,
  opts: InsightsSummaryOpts,
): Promise<InsightsSummary> {
  const { now, tzOffsetMinutes, localDay } = opts;
  const todayKey =
    localDay && /^\d{4}-\d{2}-\d{2}$/.test(localDay)
      ? localDay
      : insightDayKeys(now, tzOffsetMinutes, 1)[0]!;
  const activityDayKeys = insightDayKeys(
    now,
    tzOffsetMinutes,
    INSIGHTS_ACTIVITY_DAYS,
    todayKey,
  );
  const windowStartIso = resolveLocalDayStartIso(now, {
    localDay: activityDayKeys[0],
    tzOffsetMinutes,
  });

  const { results: reviewRows } = await db
    .prepare(
      `SELECT rl.card_id AS card_id, rl.reviewed_at AS reviewed_at, rl.rating AS rating
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
         AND rl.reviewed_at >= ?
       ORDER BY rl.reviewed_at ASC`,
    )
    .bind(userId, windowStartIso)
    .all<ReviewRow>();

  const logs = reviewRows ?? [];
  const reviewedAts = logs.map((r) => r.reviewed_at);
  const activityByDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    INSIGHTS_ACTIVITY_DAYS,
    todayKey,
  );
  const reviewsPerDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    INSIGHTS_REVIEWS_DAYS,
    todayKey,
  );
  const gradeCounts = buildGradeCounts(
    ratingsInLocalWindow(
      logs,
      now,
      tzOffsetMinutes,
      INSIGHTS_GRADE_DAYS,
      todayKey,
    ),
  );
  const reviewedToday =
    reviewsPerDay.find((d) => d.day === todayKey)?.count ?? 0;
  const reviewsInWindow = reviewsPerDay.reduce((sum, d) => sum + d.count, 0);

  const { results: scheduleRows } = await db
    .prepare(
      `-- sugarplum:insights-composition
       SELECT s.state AS state,
              s.scheduled_days AS scheduled_days,
              s.due AS due,
              s.stability AS stability,
              s.difficulty AS difficulty,
              s.elapsed_days AS elapsed_days,
              s.learning_steps AS learning_steps,
              s.reps AS reps,
              s.lapses AS lapses,
              s.last_review AS last_review
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN card_schedules s ON s.card_id = c.id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .all<ScheduleRow>();

  const knowledge = composeSubjectKnowledge(
    (scheduleRows ?? []).map((row) => ({
      state: row.state ?? null,
      scheduled_days: row.scheduled_days ?? null,
      due: row.due ?? null,
      stability: row.stability ?? null,
      difficulty: row.difficulty ?? null,
      elapsed_days: row.elapsed_days ?? null,
      learning_steps: row.learning_steps ?? null,
      reps: row.reps ?? null,
      lapses: row.lapses ?? null,
      last_review: row.last_review ?? null,
    })),
    now,
  );

  await ensureUserGamification(db, userId);
  const gamRow = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day, xp_total, level,
              display_name, board_opt_in
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      streak_current: number;
      streak_best: number;
      xp_total: number;
      level: number;
    }>();

  return {
    window: {
      reviewsDays: INSIGHTS_REVIEWS_DAYS,
      gradeDays: INSIGHTS_GRADE_DAYS,
      activityDays: INSIGHTS_ACTIVITY_DAYS,
    },
    kpis: {
      reviewsInWindow,
      reviewedToday,
      avgRetrievability: knowledge.avgRetrievability,
      etk: knowledge.etk,
      composition: {
        new: knowledge.new,
        learning: knowledge.learning,
        young: knowledge.young,
        mature: knowledge.mature,
        total: knowledge.total,
        graduated: knowledge.graduated,
        graduatedPct: knowledge.graduatedPct,
      },
    },
    gamification: {
      streakCurrent: gamRow?.streak_current ?? 0,
      streakBest: gamRow?.streak_best ?? 0,
      xpTotal: gamRow?.xp_total ?? 0,
      level: gamRow?.level ?? 1,
    },
    reviewsPerDay,
    activityByDay,
    gradeCounts,
  };
}
