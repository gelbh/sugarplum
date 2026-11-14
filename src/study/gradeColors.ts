import type { StudyRating } from "../api/client";

export type GradeColorVars = {
  border: string;
  fg: string;
  wash: string;
};

const BY_RATING: Record<StudyRating, GradeColorVars> = {
  1: {
    border: "var(--sp-grade-again-border)",
    fg: "var(--sp-grade-again-fg)",
    wash: "var(--sp-grade-again-wash)",
  },
  2: {
    border: "var(--sp-grade-hard-border)",
    fg: "var(--sp-grade-hard-fg)",
    wash: "var(--sp-grade-hard-wash)",
  },
  3: {
    border: "var(--sp-grade-good-border)",
    fg: "var(--sp-grade-good-fg)",
    wash: "var(--sp-grade-good-wash)",
  },
  4: {
    border: "var(--sp-grade-easy-border)",
    fg: "var(--sp-grade-easy-fg)",
    wash: "var(--sp-grade-easy-wash)",
  },
};

export function gradeColorVars(rating: StudyRating): GradeColorVars {
  return BY_RATING[rating];
}

/** Solid chart fills; mirrors `--sp-grade-*-border` in brand.css. */
const CHART_FILL: Record<StudyRating, string> = {
  1: "#c45c6a",
  2: "#c4a574",
  3: "#8b5a9e",
  4: "#6a9e8b",
};

export function gradeChartFill(rating: StudyRating): string {
  return CHART_FILL[rating];
}
