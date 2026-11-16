import { State } from "ts-fsrs";
import { assembleInsightsAnkiMetrics } from "../insights/assembleAnkiMetrics";
import type { InsightsReviewLogRow } from "../insights/buildMetrics";
import {
  buildGradeCounts,
  buildReviewsPerDay,
  INSIGHTS_ACTIVITY_DAYS,
  INSIGHTS_GRADE_DAYS,
  INSIGHTS_REVIEWS_DAYS,
  ratingsInLocalWindow,
} from "../insights/buildSeries";
import type { InsightsSummary } from "../insights/types";
import { localDayKey } from "../study/loadBalance";
import {
  composeSubjectKnowledge,
  type CompositionScheduleInput,
} from "../study/subjectKnowledge";
import { ensureGuestStore, peekGuestStore } from "./store";

type GuestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function guestInsightsSummary(
  opts?: {
    now?: Date;
    tzOffsetMinutes?: number;
  },
  storage?: GuestStorage,
): InsightsSummary {
  ensureGuestStore(storage);
  const store = peekGuestStore(storage);
  if (!store) {
    throw new Error("Guest store missing");
  }
  const now = opts?.now ?? new Date();
  const tzOffsetMinutes =
    opts?.tzOffsetMinutes ?? new Date().getTimezoneOffset();

  const metricLogs: InsightsReviewLogRow[] = store.reviewLogs.map((l) => ({
    card_id: l.cardId,
    reviewed_at: l.at,
    rating: l.rating as number,
    scheduled_days:
      typeof l.scheduledDays === "number" && Number.isFinite(l.scheduledDays)
        ? l.scheduledDays
        : null,
    state: typeof l.state === "number" ? l.state : null,
  }));
  const logs = metricLogs.map((l) => ({
    reviewed_at: l.reviewed_at,
    rating: l.rating,
  }));
  const reviewedAts = logs.map((l) => l.reviewed_at);
  const activityByDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    INSIGHTS_ACTIVITY_DAYS,
  );
  const reviewsPerDay = buildReviewsPerDay(
    reviewedAts,
    now,
    tzOffsetMinutes,
    INSIGHTS_REVIEWS_DAYS,
  );
  const gradeCounts = buildGradeCounts(
    ratingsInLocalWindow(logs, now, tzOffsetMinutes, INSIGHTS_GRADE_DAYS),
  );
  const todayKey = localDayKey(now, tzOffsetMinutes);
  const reviewedToday =
    reviewsPerDay.find((d) => d.day === todayKey)?.count ?? 0;
  const reviewsInWindow = reviewsPerDay.reduce((sum, d) => sum + d.count, 0);

  const scheduleRows: CompositionScheduleInput[] = store.cards
    .filter((c) => c.status === "accepted")
    .map((c) => {
      const s = store.schedules[c.id];
      return {
        state: s?.state ?? null,
        scheduled_days: s?.scheduled_days ?? null,
        due: typeof c.due === "string" ? c.due : null,
        stability: s?.stability ?? null,
        difficulty: s?.difficulty ?? null,
        elapsed_days: s?.elapsed_days ?? null,
        learning_steps: s?.learning_steps ?? null,
        reps: s?.reps ?? null,
        lapses: s?.lapses ?? null,
        last_review: s?.last_review ?? null,
      };
    });
  const knowledge = composeSubjectKnowledge(scheduleRows, now);

  const dues = scheduleRows
    .map((r) => r.due)
    .filter((d): d is string => typeof d === "string" && d.length > 0);
  const reviewIntervals = scheduleRows
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
    difficulties: scheduleRows.map((r) => r.difficulty),
    stabilities: scheduleRows.map((r) => r.stability),
    now,
    tzOffsetMinutes,
  });

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
      dueToday: anki.dueToday,
      overdue: anki.overdue,
      dailyLoad: anki.dailyLoad,
      trueRetention: anki.trueRetention,
      consistency: anki.consistency,
      difficulty: anki.difficulty,
      stability: anki.stability,
    },
    gamification: null,
    reviewsPerDay,
    activityByDay,
    futureDue: anki.futureDue,
    hourlySuccess: anki.hourlySuccess,
    gradeCounts,
    gradeCountsByMaturity: anki.gradeCountsByMaturity,
  };
}
