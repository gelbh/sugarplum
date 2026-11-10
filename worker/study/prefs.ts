import {
  clampStudyPrefs,
  DEFAULT_STUDY_PREFS,
  type StudyPrefs,
} from "../../src/study/policyPrefs";
import {
  isLegacyFsrs6W,
  parseFsrsWJson,
} from "../../src/study/fsrsWeights";

export { clampStudyPrefs, DEFAULT_STUDY_PREFS, type StudyPrefs };

/** Study pacing prefs plus optional personal FSRS-7 weights for scheduling. */
export type StudyPrefsLoaded = StudyPrefs & {
  w?: number[];
  fsrsLastOptimizedAt?: string | null;
  fsrsOptimizePending?: boolean;
};

type PrefsRow = {
  intro_budget: number;
  review_budget: number;
  r_floor: number;
  desired_retention: number;
  enable_fuzz: number;
  fsrs_w_json?: string | null;
  fsrs_last_optimized_at?: string | null;
  fsrs_optimize_pending?: number | null;
};

export function prefsFromRow(row: PrefsRow | null | undefined): StudyPrefsLoaded {
  if (!row) return { ...DEFAULT_STUDY_PREFS };
  const base = clampStudyPrefs({
    introBudget: row.intro_budget,
    reviewBudget: row.review_budget,
    rFloor: row.r_floor,
    desiredRetention: row.desired_retention,
    enableFuzz: row.enable_fuzz,
  });
  const w = parseFsrsWJson(row.fsrs_w_json ?? null);
  return {
    ...base,
    ...(w ? { w } : {}),
    fsrsLastOptimizedAt: row.fsrs_last_optimized_at ?? null,
    fsrsOptimizePending: (row.fsrs_optimize_pending ?? 0) === 1,
  };
}

/** Public settings JSON (no weight vector dump). */
export function studyPrefsResponse(prefs: StudyPrefsLoaded): StudyPrefs {
  return {
    introBudget: prefs.introBudget,
    reviewBudget: prefs.reviewBudget,
    rFloor: prefs.rFloor,
    desiredRetention: prefs.desiredRetention,
    enableFuzz: prefs.enableFuzz,
    enableLoadBalance: prefs.enableLoadBalance,
    easyDays: [...prefs.easyDays],
  };
}

export async function loadStudyPrefs(
  db: D1Database,
  userId: string,
): Promise<StudyPrefsLoaded> {
  const row = await db
    .prepare(
      `SELECT intro_budget, review_budget, r_floor, desired_retention, enable_fuzz,
              fsrs_w_json, fsrs_last_optimized_at, fsrs_optimize_pending
       FROM user_study_prefs WHERE user_id = ?`,
    )
    .bind(userId)
    .first<PrefsRow>();
  // Clear legacy FSRS-6 (21) weights so they cannot linger as opaque JSON.
  if (row?.fsrs_w_json) {
    try {
      const parsed: unknown = JSON.parse(row.fsrs_w_json);
      if (isLegacyFsrs6W(parsed)) {
        await db
          .prepare(
            `UPDATE user_study_prefs SET fsrs_w_json = NULL WHERE user_id = ?`,
          )
          .bind(userId)
          .run();
        row.fsrs_w_json = null;
      }
    } catch {
      // leave invalid JSON for parseFsrsWJson to ignore
    }
  }
  return prefsFromRow(row);
}

/** Budget / retention / fuzz only. Never touches FSRS weight / optimize columns. */
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
         (user_id, intro_budget, review_budget, r_floor, desired_retention, enable_fuzz, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         intro_budget = excluded.intro_budget,
         review_budget = excluded.review_budget,
         r_floor = excluded.r_floor,
         desired_retention = excluded.desired_retention,
         enable_fuzz = excluded.enable_fuzz,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      clamped.introBudget,
      clamped.reviewBudget,
      clamped.rFloor,
      clamped.desiredRetention,
      clamped.enableFuzz ? 1 : 0,
      now,
    )
    .run();
  return clamped;
}
