import {
  FSRS_CRON_MARK_LIMIT,
  FSRS_MIN_REVIEWS,
  FSRS_RETRAIN_DAYS,
} from "../../src/study/fsrsOptimizeConstants";
import { isOptimizeDue } from "../../src/study/fsrsOptimizeDue";
import type { FsrsOptimizeStatus } from "../../src/study/fsrsOptimizeTypes";
import { validateFsrsW } from "../../src/study/fsrsWeights";
import {
  rescheduleUserSchedules,
  type RescheduleSummary,
} from "./fsrsReschedule";
import { DEFAULT_STUDY_PREFS, loadStudyPrefs } from "./prefs";

export type { FsrsOptimizeStatus, RescheduleSummary };
export { isOptimizeDue };

const MS_PER_DAY = 86_400_000;

export class InvalidFsrsWeightsError extends Error {
  constructor(message = "Invalid FSRS weights") {
    super(message);
    this.name = "InvalidFsrsWeightsError";
  }
}

export class FsrsRescheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FsrsRescheduleError";
  }
}

export async function countUserReviews(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`,
    )
    .bind(userId)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

export async function getFsrsOptimizeStatus(
  db: D1Database,
  userId: string,
  _now: Date = new Date(),
): Promise<FsrsOptimizeStatus> {
  const prefs = await loadStudyPrefs(db, userId);
  // Best-effort FSRS-7 memory cutover (preserve dues) when Settings/status loads.
  try {
    const { cutoverUserSchedulesToFsrs7 } = await import("./fsrsCutover");
    await cutoverUserSchedulesToFsrs7(db, userId, {
      desiredRetention: prefs.desiredRetention,
      enableFuzz: false,
      modelVersion: "FSRS-7",
      ...(prefs.w ? { w: prefs.w } : {}),
    });
  } catch {
    // Cutover must not block optimize status.
  }
  const reviewCount = await countUserReviews(db, userId);
  const lastOptimizedAt = prefs.fsrsLastOptimizedAt ?? null;
  // Run now: enough history. Cron/auto still use isOptimizeDue (30-day gate).
  const eligible = reviewCount >= FSRS_MIN_REVIEWS;
  return {
    pending: prefs.fsrsOptimizePending === true,
    lastOptimizedAt,
    reviewCount,
    hasCustomW: Array.isArray(prefs.w) && prefs.w.length > 0,
    eligible,
  };
}

/** Ensure a prefs row exists so optimize columns can be updated. */
async function ensurePrefsRow(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_study_prefs
         (user_id, intro_budget, review_budget, r_floor, desired_retention, enable_fuzz, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
    )
    .bind(
      userId,
      DEFAULT_STUDY_PREFS.introBudget,
      DEFAULT_STUDY_PREFS.reviewBudget,
      DEFAULT_STUDY_PREFS.rFloor,
      DEFAULT_STUDY_PREFS.desiredRetention,
      DEFAULT_STUDY_PREFS.enableFuzz ? 1 : 0,
      nowIso,
    )
    .run();
}

export async function setOptimizePending(
  db: D1Database,
  userId: string,
  pending: boolean,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await ensurePrefsRow(db, userId, nowIso);
  await db
    .prepare(
      `UPDATE user_study_prefs
       SET fsrs_optimize_pending = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(pending ? 1 : 0, nowIso, userId)
    .run();
}

export async function saveFsrsWeights(
  db: D1Database,
  userId: string,
  w: unknown,
  now: Date = new Date(),
): Promise<{ w: number[]; rescheduled: RescheduleSummary }> {
  const validated = validateFsrsW(w);
  if (!validated) {
    throw new InvalidFsrsWeightsError();
  }
  const nowIso = now.toISOString();
  await ensurePrefsRow(db, userId, nowIso);
  await db
    .prepare(
      `UPDATE user_study_prefs
       SET fsrs_w_json = ?,
           fsrs_optimize_pending = 0,
           fsrs_last_optimized_at = ?,
           updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(JSON.stringify(validated), nowIso, nowIso, userId)
    .run();
  const prefs = await loadStudyPrefs(db, userId);
  try {
    const rescheduled = await rescheduleUserSchedules(db, userId, {
      desiredRetention: prefs.desiredRetention,
      enableFuzz: false,
      w: validated,
    });
    return { w: validated, rescheduled };
  } catch (err) {
    if (err instanceof FsrsRescheduleError) throw err;
    throw new FsrsRescheduleError(
      "Weights saved; schedule reschedule failed",
    );
  }
}

export async function resetFsrsWeights(
  db: D1Database,
  userId: string,
  now: Date = new Date(),
): Promise<{ rescheduled: RescheduleSummary }> {
  const nowIso = now.toISOString();
  await ensurePrefsRow(db, userId, nowIso);
  await db
    .prepare(
      `UPDATE user_study_prefs
       SET fsrs_w_json = NULL,
           fsrs_optimize_pending = 0,
           fsrs_last_optimized_at = ?,
           updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(nowIso, nowIso, userId)
    .run();
  const prefs = await loadStudyPrefs(db, userId);
  try {
    const rescheduled = await rescheduleUserSchedules(db, userId, {
      desiredRetention: prefs.desiredRetention,
      enableFuzz: false,
    });
    return { rescheduled };
  } catch (err) {
    if (err instanceof FsrsRescheduleError) throw err;
    throw new FsrsRescheduleError(
      "Weights reset; schedule reschedule failed",
    );
  }
}

export async function exportRevlogCsv(
  db: D1Database,
  userId: string,
): Promise<string> {
  const { results } = await db
    .prepare(
      `SELECT rl.card_id AS card_id,
              rl.reviewed_at AS reviewed_at,
              rl.rating AS rating,
              rl.state_json AS state_json
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
       ORDER BY rl.reviewed_at ASC`,
    )
    .bind(userId)
    .all<{
      card_id: string;
      reviewed_at: string;
      rating: number;
      state_json: string;
    }>();

  const lines = [
    "card_id,review_time,review_rating,review_duration,review_state",
  ];
  for (const row of results ?? []) {
    const reviewTime = Date.parse(row.reviewed_at);
    if (!Number.isFinite(reviewTime)) continue;
    let state = 0;
    try {
      const parsed: unknown = JSON.parse(row.state_json);
      if (
        parsed &&
        typeof parsed === "object" &&
        "state" in parsed &&
        typeof (parsed as { state: unknown }).state === "number"
      ) {
        state = (parsed as { state: number }).state;
      }
    } catch {
      state = 0;
    }
    lines.push(
      `${csvEscape(row.card_id)},${reviewTime},${row.rating},0,${state}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Mark up to `limit` users with due optimize as pending.
 * Returns how many rows were marked.
 */
export async function markOptimizePendingBatch(
  db: D1Database,
  now: Date = new Date(),
  limit: number = FSRS_CRON_MARK_LIMIT,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - FSRS_RETRAIN_DAYS * MS_PER_DAY,
  ).toISOString();
  const nowIso = now.toISOString();

  const { results } = await db
    .prepare(
      `SELECT d.user_id AS user_id, COUNT(rl.id) AS cnt
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN user_study_prefs p ON p.user_id = d.user_id
       WHERE IFNULL(p.fsrs_optimize_pending, 0) = 0
         AND (
           p.fsrs_last_optimized_at IS NULL
           OR p.fsrs_last_optimized_at <= ?
         )
       GROUP BY d.user_id
       HAVING cnt >= ?
       ORDER BY cnt DESC
       LIMIT ?`,
    )
    .bind(cutoff, FSRS_MIN_REVIEWS, limit)
    .all<{ user_id: string; cnt: number }>();

  let marked = 0;
  for (const row of results ?? []) {
    await ensurePrefsRow(db, row.user_id, nowIso);
    await db
      .prepare(
        `UPDATE user_study_prefs
         SET fsrs_optimize_pending = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(1, nowIso, row.user_id)
      .run();
    marked += 1;
  }
  return marked;
}
