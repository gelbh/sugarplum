import { State } from "ts-fsrs";
import { assembleInsightsAnkiMetrics } from "../../src/insights/assembleAnkiMetrics";
import {
  buildSubjectDifficultyStability,
  type InsightsReviewLogRow,
} from "../../src/insights/buildMetrics";
import {
  buildGradeCounts,
  buildReviewsPerDay,
  insightDayKeys,
  isInsightsRangePreset,
  ratingsInLocalWindow,
  resolveInsightsWindows,
  type InsightsRangePreset,
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
  rangeDays?: InsightsRangePreset;
  /** View-as: do not INSERT gamification rows for the source user. */
  readOnly?: boolean;
};

type ReviewRow = {
  card_id: string;
  reviewed_at: string;
  rating: number;
  scheduled_days: number | null;
  state_json: string | null;
};

type ScheduleRow = CompositionScheduleInput & {
  subject_id: string | null;
  subject_title: string | null;
};

function stateFromLogJson(raw: string | null): number | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "state" in parsed &&
      typeof (parsed as { state: unknown }).state === "number" &&
      Number.isFinite((parsed as { state: number }).state)
    ) {
      return (parsed as { state: number }).state;
    }
  } catch {
    return null;
  }
  return null;
}

function toMetricLogs(rows: ReviewRow[]): InsightsReviewLogRow[] {
  return rows.map((r) => ({
    card_id: r.card_id,
    reviewed_at: r.reviewed_at,
    rating: r.rating,
    scheduled_days:
      r.scheduled_days == null || !Number.isFinite(r.scheduled_days)
        ? null
        : r.scheduled_days,
    state: stateFromLogJson(r.state_json),
  }));
}

export async function buildInsightsSummary(
  db: D1Database,
  userId: string,
  opts: InsightsSummaryOpts,
): Promise<InsightsSummary> {
  const { now, tzOffsetMinutes, localDay } = opts;
  const rangeDays: InsightsRangePreset =
    opts.rangeDays != null && isInsightsRangePreset(opts.rangeDays)
      ? opts.rangeDays
      : 30;
  const { reviewsDays, gradeDays, activityDays } =
    resolveInsightsWindows(rangeDays);
  const todayKey =
    localDay && /^\d{4}-\d{2}-\d{2}$/.test(localDay)
      ? localDay
      : insightDayKeys(now, tzOffsetMinutes, 1)[0]!;
  const activityDayKeys = insightDayKeys(
    now,
    tzOffsetMinutes,
    activityDays,
    todayKey,
  );
  const windowStartIso = resolveLocalDayStartIso(now, {
    localDay: activityDayKeys[0],
    tzOffsetMinutes,
  });

  const { results: reviewRows } = await db
    .prepare(
      `SELECT rl.card_id AS card_id,
              rl.reviewed_at AS reviewed_at,
              rl.rating AS rating,
              rl.scheduled_days AS scheduled_days,
              rl.state_json AS state_json
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
  const metricLogs = toMetricLogs(logs);
  const reviewedAts = logs.map((r) => r.reviewed_at);
  const activityByDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    activityDays,
    todayKey,
  );
  const reviewsPerDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    reviewsDays,
    todayKey,
  );
  const gradeCounts = buildGradeCounts(
    ratingsInLocalWindow(logs, now, tzOffsetMinutes, gradeDays, todayKey),
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
              s.last_review AS last_review,
              d.subject_id AS subject_id,
              sub.title AS subject_title
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN subjects sub ON sub.id = d.subject_id
       LEFT JOIN card_schedules s ON s.card_id = c.id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .all<ScheduleRow>();

  const schedules = scheduleRows ?? [];
  const knowledge = composeSubjectKnowledge(
    schedules.map((row) => ({
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
  const subjectDifficultyStability = buildSubjectDifficultyStability(
    schedules.map((row) => ({
      subjectId: row.subject_id ?? null,
      title: row.subject_title ?? "Unassigned",
      difficulty: row.difficulty,
      stability: row.stability,
    })),
  );

  const dues = schedules
    .map((r) => r.due)
    .filter((d): d is string => typeof d === "string" && d.length > 0);
  const reviewIntervals = schedules
    .filter(
      (r) =>
        r.state === State.Review &&
        r.scheduled_days != null &&
        Number.isFinite(r.scheduled_days),
    )
    .map((r) => r.scheduled_days as number);
  const anki = assembleInsightsAnkiMetrics({
    metricLogs,
    reviewsPerDay,
    dues,
    reviewIntervals,
    difficulties: schedules.map((r) => r.difficulty),
    stabilities: schedules.map((r) => r.stability),
    now,
    tzOffsetMinutes,
    todayKeyOverride: todayKey,
    reviewsDays,
    gradeDays,
  });

  if (!opts.readOnly) await ensureUserGamification(db, userId);
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
      reviewsDays,
      gradeDays,
      activityDays,
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
      dueToday: anki.dueToday,
      overdue: anki.overdue,
      dailyLoad: anki.dailyLoad,
      trueRetention: anki.trueRetention,
      consistency: anki.consistency,
      difficulty: anki.difficulty,
      stability: anki.stability,
      subjectDifficultyStability,
    },
    gamification: {
      streakCurrent: gamRow?.streak_current ?? 0,
      streakBest: gamRow?.streak_best ?? 0,
      xpTotal: gamRow?.xp_total ?? 0,
      level: gamRow?.level ?? 1,
    },
    reviewsPerDay,
    activityByDay,
    futureDue: anki.futureDue,
    hourlySuccess: anki.hourlySuccess,
    gradeCounts,
    gradeCountsByMaturity: anki.gradeCountsByMaturity,
  };
}
