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
    return {
      type: "grade",
      rating: (input.dx < 0 ? 1 : 3) as StudyRating,
    };
  }
  return {
    type: "grade",
    rating: (input.dy > 0 ? 2 : 4) as StudyRating,
  };
}
