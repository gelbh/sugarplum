import { Rating, type Grade } from "ts-fsrs";
import {
  schedulerForPrefs,
  type FsrsPrefs,
} from "../../src/study/fsrs/fsrsFactory";
import { DEFAULT_STUDY_PREFS } from "../../src/study/queue/policyPrefs";
import { normalizeSchedulerCard } from "../../src/study/fsrs/fsrsReplay";
import {
  emptyFsrsCard,
  type FsrsSchedulerCard,
} from "../../src/study/fsrs/retrievability";

export type { FsrsSchedulerCard as Card, Grade };
export { Rating };

export type ReviewLogCompat = {
  rating: number;
  state: number;
  scheduled_days: number;
  elapsed_days: number;
  review: Date;
  stability: number;
  difficulty: number;
  due: Date;
  last_review: Date | null;
};

/** Fresh FSRS schedule card for an accepted draft (due defaults to now). */
export function newCard(
  now: Date = new Date(),
  cardId?: string,
): FsrsSchedulerCard {
  return emptyFsrsCard(now, cardId);
}

/** Apply an FSRS grade; returns the updated schedule card. */
export async function review(
  card: FsrsSchedulerCard,
  rating: Grade,
  now: Date = new Date(),
  prefs: FsrsPrefs = DEFAULT_STUDY_PREFS,
): Promise<FsrsSchedulerCard> {
  const scheduler = await schedulerForPrefs(prefs);
  return normalizeSchedulerCard(
    scheduler.review({ card: card as never, grade: rating, now }).card,
  );
}

/** Full FSRS step including a legacy-shaped review log (for persistence). */
export async function reviewWithLog(
  card: FsrsSchedulerCard,
  rating: Grade,
  now: Date = new Date(),
  prefs: FsrsPrefs = DEFAULT_STUDY_PREFS,
): Promise<{ card: FsrsSchedulerCard; log: ReviewLogCompat }> {
  const preLast = card.lastReviewAt;
  const scheduler = await schedulerForPrefs(prefs);
  const { card: next, revlog } = scheduler.review({
    card: card as never,
    grade: rating,
    now,
  });
  const elapsedDays =
    preLast != null
      ? Math.max(
          0,
          Math.floor((now.getTime() - preLast.getTime()) / 86_400_000),
        )
      : 0;
  return {
    card: normalizeSchedulerCard(next),
    log: {
      rating: revlog.rating,
      state: Number(revlog.state),
      scheduled_days: revlog.scheduledDays,
      elapsed_days: elapsedDays,
      review: revlog.reviewTime,
      stability: revlog.stability,
      difficulty: revlog.difficulty,
      due: revlog.dueAt,
      last_review: revlog.lastReviewAt,
    },
  };
}

export {
  cardFromScheduleRow,
  retrievability,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "../../src/study/fsrs/retrievability";
