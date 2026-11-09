import type { CardRow } from "../cards/routes";
import { serializeCard } from "../cards/routes";
import {
  buildStudyQueue,
  type QueueCandidate,
  type QueueResult,
  type StudyPrefs,
} from "../../src/study/policyQueue";
import type { ScheduleRowLike } from "./fsrs";
import { loadIntrosUsedToday } from "./dayStats";
import { loadStudyPrefs } from "./prefs";
import { serverUtcDay, serverUtcDayStartIso } from "../../src/study/localDay";
import { prepareDueOnlyUpdate } from "./scheduleWrite";

export type DueSqlRow = CardRow &
  ScheduleRowLike & {
    due: string;
    again_14d: number;
  };

export type DueScope = {
  deckId: string | null;
  subjectId: string | null;
};

/** Load due candidates for the user (optional deck/subject scope). */
export async function loadDueCandidates(
  db: D1Database,
  userId: string,
  nowIso: string,
  scope: DueScope,
): Promise<DueSqlRow[]> {
  const now = new Date(nowIso);
  const since14d = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let sql = `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at,
              s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
              s.learning_steps, s.reps, s.lapses, s.state, s.last_review,
              (
                SELECT COUNT(*) FROM review_logs rl
                WHERE rl.card_id = c.id
                  AND rl.rating = 1
                  AND rl.reviewed_at >= ?
              ) AS again_14d
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?`;
  const binds: unknown[] = [since14d, userId, "accepted", nowIso];

  if (scope.deckId) {
    sql += " AND c.deck_id = ?";
    binds.push(scope.deckId);
  } else if (scope.subjectId) {
    sql += " AND d.subject_id = ?";
    binds.push(scope.subjectId);
  }

  sql += " ORDER BY s.due ASC";

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<DueSqlRow>();
  return results ?? [];
}

export function rowsToCandidates(rows: DueSqlRow[]): QueueCandidate[] {
  return rows.map((row) => ({
    id: row.id,
    deck_id: row.deck_id,
    due: row.due,
    state: row.state,
    reps: row.reps,
    last_review: row.last_review,
    lapses: row.lapses,
    again_14d: Number(row.again_14d) || 0,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
  }));
}

export async function buildDueQueueForUser(
  db: D1Database,
  userId: string,
  now: Date,
  scope: DueScope,
  introBonusSlices: number,
  /** Local day key for intro ledger (client YYYY-MM-DD); falls back to UTC day. */
  introDay: string | null,
): Promise<{ rows: DueSqlRow[]; queue: QueueResult; prefs: StudyPrefs }> {
  const nowIso = now.toISOString();
  const rows = await loadDueCandidates(db, userId, nowIso, scope);
  const prefs = await loadStudyPrefs(db, userId);
  const day =
    introDay && /^\d{4}-\d{2}-\d{2}$/.test(introDay)
      ? introDay
      : serverUtcDay(now);
  const introAlreadyUsedToday = await loadIntrosUsedToday(db, userId, day);
  // Mutations / overdue: always server UTC day start (not client-forgable).
  const overdueDayStartIso = serverUtcDayStartIso(now);
  const queue = buildStudyQueue(rowsToCandidates(rows), prefs, now, {
    overdueDayStartIso,
    introBonusSlices,
    introAlreadyUsedToday,
  });
  return { rows, queue, prefs };
}

export function serializeDueCards(
  rows: DueSqlRow[],
  selectedIds: string[],
): Array<ReturnType<typeof serializeCard> & { due: string }> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return selectedIds.map((id) => {
    const row = byId.get(id)!;
    return { ...serializeCard(row), due: row.due };
  });
}

export async function applyDeferrals(
  db: D1Database,
  userId: string,
  deferrals: { id: string; newDue: string }[],
): Promise<void> {
  if (deferrals.length === 0) return;
  const stmts = deferrals.map((d) =>
    prepareDueOnlyUpdate(db, d.newDue, d.id, userId),
  );
  await db.batch(stmts);
}
