import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade,
  type ReviewLog,
} from "ts-fsrs";

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
): Card {
  return fsrs().next(card, now, rating).card;
}

/** Full FSRS step including the review log (for persistence). */
export function reviewWithLog(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): { card: Card; log: ReviewLog } {
  return fsrs().next(card, now, rating);
}

export {
  cardFromScheduleRow,
  retrievability,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "../../src/study/retrievability";
