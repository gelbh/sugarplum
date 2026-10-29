import { XP, type Rarity, utcDay } from "./constants";
import { creditXp } from "./xp";

type AchievementDefRow = {
  id: string;
  rarity: Rarity;
  trigger_kind: string;
  threshold: number | null;
  params_json: string | null;
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

async function metricValue(
  db: D1Database,
  userId: string,
  def: AchievementDefRow,
  nowIso: string,
): Promise<number> {
  switch (def.trigger_kind) {
    case "reviews_total":
      return countReviewsTotal(db, userId);
    case "accepts_total":
      return countAcceptsTotal(db, userId);
    case "study_days_total":
      return countStudyDaysTotal(db, userId);
    case "streak_current": {
      const { streakCurrent } = await readStreakCurrent(db, userId);
      return streakCurrent;
    }
    case "clear_due_once": {
      const due = await countDueAcceptedCards(db, userId, nowIso);
      return due === 0 ? 1 : 0;
    }
    case "distinct_types":
      return countDistinctAcceptedTypes(db, userId);
    case "composite": {
      const params = JSON.parse(def.params_json ?? "{}") as {
        streak_best_min?: number;
        reviews_min?: number;
      };
      const { streakBest } = await readStreakCurrent(db, userId);
      const reviews = await countReviewsTotal(db, userId);
      const ok =
        streakBest >= (params.streak_best_min ?? 0) &&
        reviews >= (params.reviews_min ?? 0);
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
  const unlocks: string[] = [];
  for (const def of defs) {
    if (!kinds.has(def.trigger_kind)) continue;
    const value = await metricValue(db, userId, def, nowIso);
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
  void utcDay(args.reviewedAt);
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
