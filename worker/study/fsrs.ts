import {
  createEmptyCard,
  Rating,
  type Card,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";
import { fsrsForPrefs, type FsrsPrefs } from "../../src/study/fsrsFactory";
import { DEFAULT_STUDY_PREFS } from "../../src/study/policyPrefs";

export type { Card, Grade, ReviewLog };
export { Rating };

/** Fresh FSRS schedule card for an accepted draft (due defaults to now). */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/** Apply an FSRS grade; returns the updated schedule card. */
export function review(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
  prefs: FsrsPrefs = DEFAULT_STUDY_PREFS,
): Card {
  return fsrsForPrefs(prefs).next(card, now, rating).card;
}

/** Full FSRS step including the review log (for persistence). */
export function reviewWithLog(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
  prefs: FsrsPrefs = DEFAULT_STUDY_PREFS,
): { card: Card; log: ReviewLog } {
  return fsrsForPrefs(prefs).next(card, now, rating);
}

export {
  cardFromScheduleRow,
  retrievability,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "../../src/study/retrievability";
