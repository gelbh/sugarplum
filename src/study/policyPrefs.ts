import {
  DEFAULT_STUDY_PREFS,
  type StudyPrefs,
} from "./policyQueue";

export { DEFAULT_STUDY_PREFS, type StudyPrefs };

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampRFloor(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_STUDY_PREFS.rFloor;
  return Math.min(0.99, Math.max(0.5, n));
}

/**
 * Clamp prefs. Missing keys keep `base` (defaults when base omitted).
 * Partial PUT merges with existing row via base = loadStudyPrefs().
 */
export function clampStudyPrefs(
  input: {
    introBudget?: unknown;
    reviewBudget?: unknown;
    rFloor?: unknown;
  },
  base: StudyPrefs = DEFAULT_STUDY_PREFS,
): StudyPrefs {
  const introBudget =
    typeof input.introBudget === "number"
      ? clampInt(input.introBudget, 1, 200)
      : base.introBudget;
  const reviewBudget =
    typeof input.reviewBudget === "number"
      ? clampInt(input.reviewBudget, 1, 2000)
      : base.reviewBudget;
  const rFloor =
    typeof input.rFloor === "number" ? clampRFloor(input.rFloor) : base.rFloor;
  return { introBudget, reviewBudget, rFloor };
}
