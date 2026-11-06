import type { StudyRating } from "../api/client";

export const SWIPE_THRESHOLD_PX = 64;

export type CardGestureResult =
  | { type: "reveal" }
  | { type: "grade"; rating: StudyRating }
  | { type: "none" };

export function resolveCardGesture(input: {
  revealed: boolean;
  dx: number;
  dy: number;
  threshold?: number;
}): CardGestureResult {
  const threshold = input.threshold ?? SWIPE_THRESHOLD_PX;
  const ax = Math.abs(input.dx);
  const ay = Math.abs(input.dy);
  if (ax < threshold && ay < threshold) return { type: "none" };

  if (!input.revealed) return { type: "reveal" };

  if (ax >= ay) {
    const rating: StudyRating = input.dx < 0 ? 1 : 3;
    return { type: "grade", rating };
  }
  const rating: StudyRating = input.dy > 0 ? 2 : 4;
  return { type: "grade", rating };
}

export const REVIEW_SWIPE_THRESHOLD_PX = 96;
export const REVIEW_DRAG_SLOP_PX = 8;
export const REVIEW_FLY_MS = 200;

export type ReviewSwipeResult = "accept" | "reject" | "none";
export type ReviewSwipeDecision = Exclude<ReviewSwipeResult, "none">;

/** Draft review: horizontal swipe only; vertical drags stay scroll. */
export function resolveReviewSwipe(input: {
  dx: number;
  dy: number;
}): ReviewSwipeResult {
  const ax = Math.abs(input.dx);
  if (ax < REVIEW_SWIPE_THRESHOLD_PX || ax <= Math.abs(input.dy)) return "none";
  return input.dx > 0 ? "accept" : "reject";
}

export function reviewSwipeVisual(input: {
  dx: number;
  leaving: ReviewSwipeDecision | null;
  reduceMotion: boolean;
}): {
  transform: string;
  stamp: ReviewSwipeDecision | null;
  stampOpacity: number;
  dimmed: boolean;
} {
  const { dx, leaving, reduceMotion } = input;
  const sign = leaving === "accept" ? 1 : -1;
  const transform =
    leaving && !reduceMotion
      ? `translateX(${sign * 150}%) rotate(${sign * 18}deg)`
      : reduceMotion
        ? `translateX(${dx}px)`
        : `translateX(${dx}px) rotate(${dx / 20}deg)`;
  const stamp =
    leaving ??
    (dx >= REVIEW_DRAG_SLOP_PX
      ? "accept"
      : dx <= -REVIEW_DRAG_SLOP_PX
        ? "reject"
        : null);
  return {
    transform,
    stamp,
    stampOpacity: leaving
      ? 1
      : Math.min(1, Math.abs(dx) / REVIEW_SWIPE_THRESHOLD_PX),
    dimmed: leaving !== null && reduceMotion,
  };
}
