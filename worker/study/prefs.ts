import {
  clampStudyPrefs,
  DEFAULT_STUDY_PREFS,
  type StudyPrefs,
} from "../../src/study/policyPrefs";

export { clampStudyPrefs, DEFAULT_STUDY_PREFS, type StudyPrefs };

type PrefsRow = {
  intro_budget: number;
  review_budget: number;
  r_floor: number;
};

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
