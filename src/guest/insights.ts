import {
  buildGradeCounts,
  buildReviewsPerDay,
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

  const logs = store.reviewLogs.map((l) => ({
    reviewed_at: l.at,
    rating: l.rating as number,
  }));
  const reviewsPerDay = buildReviewsPerDay(
    logs.map((l) => l.reviewed_at),
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

  return {
    window: {
      reviewsDays: INSIGHTS_REVIEWS_DAYS,
      gradeDays: INSIGHTS_GRADE_DAYS,
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
    gamification: null,
    reviewsPerDay,
    gradeCounts,
  };
}
