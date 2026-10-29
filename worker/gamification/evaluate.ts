import { XP, type Rarity } from "./constants";
import { creditXp } from "./xp";

type AchievementDefRow = {
  id: string;
  rarity: Rarity;
  trigger_kind: string;
  threshold: number | null;
  params_json: string | null;
};

type StudyMetrics = {
  reviewsTotal: number;
  acceptsTotal: number;
  studyDaysTotal: number;
  streakCurrent: number;
  streakBest: number;
  dueAccepted: number;
  distinctTypes: number;
};

const REVIEW_TRIGGERS = new Set([
  "reviews_total",
  "study_days_total",
  "streak_current",
  "clear_due_once",
  "composite",
]);

const ACCEPT_TRIGGERS = new Set([
  "accepts_total",
  "distinct_types",
  "composite",
]);

async function loadActiveDefs(db: D1Database): Promise<AchievementDefRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, rarity, trigger_kind, threshold, params_json
       FROM achievement_defs WHERE active = 1`,
    )
    .all<AchievementDefRow>();
  return results ?? [];
}

async function countReviewsTotal(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`,
    )
    .bind(userId)
    .first<{ cnt: number }>();
  return countFromRow(row);
}

function countFromRow(row: { cnt?: number; count?: number } | null): number {
  return Number(row?.cnt ?? row?.count ?? 0);
}

async function countAcceptsTotal(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .first<{ cnt: number; count?: number }>();
  return countFromRow(row);
}

async function countStudyDaysTotal(
  db: D1Database,
  userId: string,
): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT substr(rl.reviewed_at, 1, 10) AS study_day
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`,
    )
    .bind(userId)
    .all<{ study_day: string }>();
  return results?.length ?? 0;
}

async function countDistinctAcceptedTypes(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT c.type) AS cnt FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .first<{ cnt: number; count?: number }>();
  return countFromRow(row);
}

async function countDueAcceptedCards(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted' AND s.due <= ?`,
    )
    .bind(userId, nowIso)
    .first<{ cnt: number; count?: number }>();
  return countFromRow(row);
}

async function readStreakCurrent(
  db: D1Database,
  userId: string,
): Promise<{ streakCurrent: number; streakBest: number }> {
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ streak_current: number; streak_best: number }>();
  return {
    streakCurrent: row?.streak_current ?? 0,
    streakBest: row?.streak_best ?? 0,
  };
}

function effectiveThreshold(def: AchievementDefRow): number {
  return def.threshold ?? 1;
}

async function loadStudyMetrics(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<StudyMetrics> {
  const [reviewsTotal, acceptsTotal, studyDaysTotal, streak, dueAccepted, distinctTypes] =
    await Promise.all([
      countReviewsTotal(db, userId),
      countAcceptsTotal(db, userId),
      countStudyDaysTotal(db, userId),
      readStreakCurrent(db, userId),
      countDueAcceptedCards(db, userId, nowIso),
      countDistinctAcceptedTypes(db, userId),
    ]);
  return {
    reviewsTotal,
    acceptsTotal,
    studyDaysTotal,
    streakCurrent: streak.streakCurrent,
    streakBest: streak.streakBest,
    dueAccepted,
    distinctTypes,
  };
}

function metricValue(def: AchievementDefRow, metrics: StudyMetrics): number {
  switch (def.trigger_kind) {
    case "reviews_total":
      return metrics.reviewsTotal;
    case "accepts_total":
      return metrics.acceptsTotal;
    case "study_days_total":
      return metrics.studyDaysTotal;
    case "streak_current":
      return metrics.streakCurrent;
    case "clear_due_once":
      return metrics.dueAccepted === 0 ? 1 : 0;
    case "distinct_types":
      return metrics.distinctTypes;
    case "composite": {
      let params: { streak_best_min?: number; reviews_min?: number } = {};
      try {
        params = JSON.parse(def.params_json ?? "{}") as typeof params;
      } catch {
        params = {};
      }
      const ok =
        metrics.streakBest >= (params.streak_best_min ?? 0) &&
        metrics.reviewsTotal >= (params.reviews_min ?? 0);
      return ok ? 1 : 0;
    }
    default:
      return 0;
  }
}

async function tryUnlock(
  db: D1Database,
  userId: string,
  def: AchievementDefRow,
  currentValue: number,
  triggerEventId: string | null,
): Promise<string | null> {
  const threshold = effectiveThreshold(def);
  await db
    .prepare(
      `INSERT INTO achievement_progress (user_id, achievement_id, current_value, threshold)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, achievement_id) DO UPDATE SET
         current_value = excluded.current_value,
         threshold = excluded.threshold`,
    )
    .bind(userId, def.id, currentValue, threshold)
    .run();

  if (currentValue < threshold) return null;

  const completedAt = new Date().toISOString();
  const insert = await db
    .prepare(
      `INSERT OR IGNORE INTO achievement_completions (
         user_id, achievement_id, completed_at, trigger_event_id, backdated
       ) VALUES (?, ?, ?, ?, 0)`,
    )
    .bind(userId, def.id, completedAt, triggerEventId)
    .run();

  if ((insert.meta.changes ?? 0) === 0) return null;

  const bonus = XP.unlock[def.rarity];
  await creditXp(db, userId, bonus, "unlock", `unlock:${def.id}`);
  return def.id;
}

async function evaluateKinds(
  db: D1Database,
  userId: string,
  kinds: Set<string>,
  triggerEventId: string | null,
  nowIso: string,
): Promise<string[]> {
  const defs = await loadActiveDefs(db);
  const metrics = await loadStudyMetrics(db, userId, nowIso);
  const unlocks: string[] = [];
  for (const def of defs) {
    if (!kinds.has(def.trigger_kind)) continue;
    const value = metricValue(def, metrics);
    const unlocked = await tryUnlock(db, userId, def, value, triggerEventId);
    if (unlocked) unlocks.push(unlocked);
  }
  return unlocks;
}

export async function evaluateAfterReview(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<{ unlocks: string[] }> {
  const nowIso = args.reviewedAt.toISOString();
  const unlocks = await evaluateKinds(
    db,
    userId,
    REVIEW_TRIGGERS,
    args.reviewLogId,
    nowIso,
  );
  return { unlocks };
}

export async function evaluateAfterAccept(
  db: D1Database,
  userId: string,
  args: { cardId: string; cardType: string },
): Promise<{ unlocks: string[] }> {
  void args.cardType;
  const nowIso = new Date().toISOString();
  const unlocks = await evaluateKinds(
    db,
    userId,
    ACCEPT_TRIGGERS,
    args.cardId,
    nowIso,
  );
  return { unlocks };
}
