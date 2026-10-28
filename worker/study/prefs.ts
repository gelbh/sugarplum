import type { StudyPrefs } from "./queue";

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  introBudget: 20,
  reviewBudget: 200,
  rFloor: 0.8,
};

type PrefsRow = {
  intro_budget: number;
  review_budget: number;
  r_floor: number;
};

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

export function prefsFromRow(row: PrefsRow | null | undefined): StudyPrefs {
  if (!row) return { ...DEFAULT_STUDY_PREFS };
  return clampStudyPrefs({
    introBudget: row.intro_budget,
    reviewBudget: row.review_budget,
    rFloor: row.r_floor,
  });
}

export async function loadStudyPrefs(
  db: D1Database,
  userId: string,
): Promise<StudyPrefs> {
  const row = await db
    .prepare(
      `SELECT intro_budget, review_budget, r_floor
       FROM user_study_prefs WHERE user_id = ?`,
    )
    .bind(userId)
    .first<PrefsRow>();
  return prefsFromRow(row);
}

export async function saveStudyPrefs(
  db: D1Database,
  userId: string,
  prefs: StudyPrefs,
): Promise<StudyPrefs> {
  const clamped = clampStudyPrefs(prefs);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO user_study_prefs
         (user_id, intro_budget, review_budget, r_floor, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         intro_budget = excluded.intro_budget,
         review_budget = excluded.review_budget,
         r_floor = excluded.r_floor,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      clamped.introBudget,
      clamped.reviewBudget,
      clamped.rFloor,
      now,
    )
    .run();
  return clamped;
}
