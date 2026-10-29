import { DEFAULT_STUDY_PREFS, type StudyPrefs } from "./policyQueue";

export { DEFAULT_STUDY_PREFS, type StudyPrefs };

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampRFloor(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_STUDY_PREFS.rFloor;
  return Math.min(0.99, Math.max(0.5, n));
}

/** Clamp prefs to sane ranges (intro 1–200, review 1–2000, rFloor 0.50–0.99). */
export function clampStudyPrefs(input: {
  introBudget?: unknown;
  reviewBudget?: unknown;
  rFloor?: unknown;
}): StudyPrefs {
  const introBudget =
    typeof input.introBudget === "number"
      ? clampInt(input.introBudget, 1, 200)
      : DEFAULT_STUDY_PREFS.introBudget;
  const reviewBudget =
    typeof input.reviewBudget === "number"
      ? clampInt(input.reviewBudget, 1, 2000)
      : DEFAULT_STUDY_PREFS.reviewBudget;
  const rFloor =
    typeof input.rFloor === "number"
      ? clampRFloor(input.rFloor)
      : DEFAULT_STUDY_PREFS.rFloor;
  return { introBudget, reviewBudget, rFloor };
}
