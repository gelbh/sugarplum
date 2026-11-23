import type { StudyRating } from "./studyRating";

/** User-facing FSRS grade copy (ratings stay 1–4 / Again–Easy under the hood). */
export const GRADE_LABELS: Record<StudyRating, string> = {
  1: "No Idea",
  2: "Tough Cookie",
  3: "Good Enough",
  4: "Easy Peasy",
};

/** Two-line button label; keeps the four tiles the same height. */
export function gradeLabelMultiline(rating: StudyRating): string {
  return GRADE_LABELS[rating].replace(" ", "\n");
}
