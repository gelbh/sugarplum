import {
  buildConsistency,
  buildDifficultyMix,
  buildGradeCountsByMaturity,
  buildHourlySuccess,
  buildStabilitySnapshot,
  buildTrueRetention,
  buildWorkloadFromDues,
  reviewRowsInLocalWindow,
  type InsightsReviewLogRow,
} from "./buildMetrics";
import { INSIGHTS_GRADE_DAYS } from "./buildSeries";
import type {
  InsightsConsistency,
  InsightsDifficultyMix,
  InsightsGradeByMaturity,
  InsightsHourlySuccessPoint,
  InsightsStabilitySnapshot,
  InsightsTrueRetention,
} from "./types";

export type AssembleInsightsAnkiMetricsInput = {
  metricLogs: readonly InsightsReviewLogRow[];
  reviewsPerDay: ReadonlyArray<{ day: string; count: number }>;
  dues: readonly string[];
  reviewIntervals: readonly number[];
  difficulties: readonly (number | null | undefined)[];
  stabilities: readonly (number | null | undefined)[];
  now: Date;
  tzOffsetMinutes: number;
  todayKeyOverride?: string | null;
  /** Retention / hourly / consistency window; defaults to reviews series length. */
  reviewsDays?: number;
  gradeDays?: number;
};

export type AssembledInsightsAnkiMetrics = {
  dueToday: number;
  overdue: number;
  dailyLoad: number | null;
  futureDue: Array<{ day: string; count: number }>;
  hourlySuccess: InsightsHourlySuccessPoint[];
  trueRetention: InsightsTrueRetention;
  consistency: InsightsConsistency;
  difficulty: InsightsDifficultyMix;
  stability: InsightsStabilitySnapshot;
  gradeCountsByMaturity: InsightsGradeByMaturity;
};

export function assembleInsightsAnkiMetrics(
  input: AssembleInsightsAnkiMetricsInput,
): AssembledInsightsAnkiMetrics {
  const gradeDays = input.gradeDays ?? INSIGHTS_GRADE_DAYS;
  const reviewsDays = input.reviewsDays ?? input.reviewsPerDay.length;
  const todayKey = input.todayKeyOverride;
  const workload = buildWorkloadFromDues(
    input.dues,
    input.now,
    input.tzOffsetMinutes,
    input.reviewIntervals,
    undefined,
    todayKey,
  );
  const trueRetention = buildTrueRetention(
    input.metricLogs,
    input.now,
    input.tzOffsetMinutes,
    reviewsDays,
    todayKey,
  );
  const gradeCountsByMaturity = buildGradeCountsByMaturity(
    reviewRowsInLocalWindow(
      input.metricLogs,
      input.now,
      input.tzOffsetMinutes,
      gradeDays,
      todayKey,
    ),
  );
  return {
    dueToday: workload.dueToday,
    overdue: workload.overdue,
    dailyLoad: workload.dailyLoad,
    futureDue: workload.futureDue,
    hourlySuccess: buildHourlySuccess(
      input.metricLogs,
      input.now,
      input.tzOffsetMinutes,
      reviewsDays,
      todayKey,
    ),
    trueRetention,
    consistency: buildConsistency(input.reviewsPerDay),
    difficulty: buildDifficultyMix(input.difficulties),
    stability: buildStabilitySnapshot(input.stabilities),
    gradeCountsByMaturity,
  };
}
