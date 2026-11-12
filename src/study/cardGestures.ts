import type { StudyRating } from "../api/client";
import { GRADE_LABELS } from "./gradeLabels";

export const DRAG_SLOP_PX = 8;
export const SWIPE_THRESHOLD_PX = 96;
export const REVIEW_FLY_MS = 200;

export type CardGestureResult =
  | { type: "reveal" }
  | { type: "grade"; rating: StudyRating }
  | { type: "none" };

export function gesturePassedSlop(input: {
  dx: number;
  dy: number;
}): boolean {
  return Math.hypot(input.dx, input.dy) >= DRAG_SLOP_PX;
}

/** Sticky arm: once past slop, stays armed for the rest of the gesture. */
export function armGesture(armed: boolean, dx: number, dy: number): boolean {
  return armed || gesturePassedSlop({ dx, dy });
}

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

export type ReviewSwipeResult = "accept" | "reject" | "none";
export type ReviewSwipeDecision = Exclude<ReviewSwipeResult, "none">;

/** Draft review: horizontal swipe only; vertical drags stay scroll. */
export function resolveReviewSwipe(input: {
  dx: number;
  dy: number;
}): ReviewSwipeResult {
  const ax = Math.abs(input.dx);
  if (ax < SWIPE_THRESHOLD_PX || ax <= Math.abs(input.dy)) return "none";
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
    (dx >= DRAG_SLOP_PX
      ? "accept"
      : dx <= -DRAG_SLOP_PX
        ? "reject"
        : null);
  return {
    transform,
    stamp,
    stampOpacity: leaving
      ? 1
      : Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD_PX),
    dimmed: leaving !== null && reduceMotion,
  };
}

export const STUDY_REVEAL_STAMP = "Show";

/** Live study drag paint only; mailbox owns the leave after grade. */
export function studySwipeVisual(input: {
  dx: number;
  dy: number;
  revealed: boolean;
  reduceMotion: boolean;
}): {
  transform: string;
  stampLabel: string | null;
  stampRating: StudyRating | null;
  stampOpacity: number;
} {
  const { dx, dy, revealed, reduceMotion } = input;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const transform = reduceMotion
    ? `translate(${dx}px, ${dy}px)`
    : `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;

  if (!gesturePassedSlop({ dx, dy })) {
    return {
      transform,
      stampLabel: null,
      stampRating: null,
      stampOpacity: 0,
    };
  }

  if (!revealed) {
    return {
      transform,
      stampLabel: STUDY_REVEAL_STAMP,
      stampRating: null,
      stampOpacity: Math.min(1, Math.max(ax, ay) / SWIPE_THRESHOLD_PX),
    };
  }

  const rating: StudyRating =
    ax >= ay ? (dx < 0 ? 1 : 3) : dy > 0 ? 2 : 4;
  return {
    transform,
    stampLabel: GRADE_LABELS[rating],
    stampRating: rating,
    stampOpacity: Math.min(1, Math.max(ax, ay) / SWIPE_THRESHOLD_PX),
  };
}

/** Notes mute + portal containment (React portals bubble through the tree). */
export function studyPointerAllowed(input: {
  blocked: boolean;
  targetInHost: boolean;
}): boolean {
  return !input.blocked && input.targetInHost;
}
