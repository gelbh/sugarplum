import type { FruitType } from "../../src/achievements/catalog";
import type { CompositePart, UnlockView } from "../../src/achievements/wire";
import { XP, type Rarity } from "./constants";
import { traitsForAchievement } from "./traits";
import { creditXp } from "./xp";

export type TriggerKind =
  | "reviews_total"
  | "accepts_total"
  | "study_days_total"
  | "streak_current"
  | "clear_due_once"
  | "distinct_types"
  | "composite";

export type AchievementDefRow = {
  id: string;
  rarity: Rarity;
  trigger_kind: TriggerKind;
  threshold: number | null;
  params_json: string | null;
  title: string;
  fruit_type: FruitType;
};

export type StudyMetrics = {
  reviewsTotal: number;
  acceptsTotal: number;
  studyDaysTotal: number;
  streakCurrent: number;
  streakBest: number;
  dueAccepted: number;
  distinctTypes: number;
};

const REVIEW_TRIGGERS = new Set<TriggerKind>([
  "reviews_total",
  "study_days_total",
  "streak_current",
  "clear_due_once",
  "composite",
]);

const ACCEPT_TRIGGERS = new Set<TriggerKind>([
  "accepts_total",
  "distinct_types",
  "composite",
]);

async function loadActiveDefs(
  db: D1Database,
): Promise<AchievementDefRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, rarity, trigger_kind, threshold, params_json, title, fruit_type
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

export async function loadCompositeMetrics(
  db: D1Database,
  userId: string,
): Promise<{ streakBest: number; reviewsTotal: number }> {
  const [streak, reviewsTotal] = await Promise.all([
    readStreakCurrent(db, userId),
    countReviewsTotal(db, userId),
  ]);
  return { streakBest: streak.streakBest, reviewsTotal };
}

export function compositeParts(
  paramsJson: string | null,
  metrics: Pick<StudyMetrics, "streakBest" | "reviewsTotal">,
): CompositePart[] {
  let params: { streak_best_min?: number; reviews_min?: number } = {};
  try {
    params = JSON.parse(paramsJson ?? "{}") as typeof params;
  } catch {
    params = {};
  }
  return [
    {
      key: "streak_best",
      current: metrics.streakBest,
      target: params.streak_best_min ?? 0,
    },
    {
      key: "reviews",
      current: metrics.reviewsTotal,
      target: params.reviews_min ?? 0,
    },
  ];
}

function metricValue(
  def: AchievementDefRow,
  metrics: StudyMetrics,
): number {
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
    case "composite":
      return compositeParts(def.params_json, metrics).every(
        (p) => p.current >= p.target,
      )
        ? 1
        : 0;
    default: {
      const unhandled: never = def.trigger_kind;
      void unhandled;
      return 0;
    }
  }
}

async function tryUnlock(
  db: D1Database,
  userId: string,
  def: AchievementDefRow,
  currentValue: number,
  triggerEventId: string | null,
  backdated: 0 | 1 = 0,
): Promise<UnlockView | null> {
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
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(userId, def.id, completedAt, triggerEventId, backdated)
    .run();

  if ((insert.meta.changes ?? 0) === 0) return null;

  // Backdated unlocks must not stamp unlock XP into "now" (weekly board pollution).
  if (backdated === 0) {
    const bonus = XP.unlock[def.rarity];
    await creditXp(db, userId, bonus, "unlock", `unlock:${def.id}`);
  }
  return {
    id: def.id,
    title: def.title,
    fruitType: def.fruit_type,
    rarity: def.rarity,
    traits: traitsForAchievement(def.id, def.rarity),
  };
}

export async function evaluateAchievements(
  db: D1Database,
  userId: string,
  opts: {
    kinds?: Set<TriggerKind>;
    triggerEventId: string | null;
    nowIso: string;
    backdated?: 0 | 1;
  },
): Promise<UnlockView[]> {
  const defs = await loadActiveDefs(db);
  const metrics = await loadStudyMetrics(db, userId, opts.nowIso);
  const backdated = opts.backdated ?? 0;
  const unlocks: UnlockView[] = [];
  for (const def of defs) {
    if (opts.kinds && !opts.kinds.has(def.trigger_kind)) continue;
    // clear_due is event-shaped; empty due queues are not historical proof.
    if (backdated === 1 && def.trigger_kind === "clear_due_once") continue;
    let value = metricValue(def, metrics);
    // Historical streak fruits use peak, not the (possibly expired) live current.
    if (backdated === 1 && def.trigger_kind === "streak_current") {
      value = metrics.streakBest;
    }
    const unlocked = await tryUnlock(
      db,
      userId,
      def,
      value,
      opts.triggerEventId,
      backdated,
    );
    if (unlocked) unlocks.push(unlocked);
  }
  return unlocks;
}

export async function evaluateAfterReview(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<{ unlocks: UnlockView[] }> {
  const nowIso = args.reviewedAt.toISOString();
  const unlocks = await evaluateAchievements(db, userId, {
    kinds: REVIEW_TRIGGERS,
    triggerEventId: args.reviewLogId,
    nowIso,
  });
  return { unlocks };
}

export async function evaluateAfterAccept(
  db: D1Database,
  userId: string,
  args: { cardId: string; cardType: string },
): Promise<{ unlocks: UnlockView[] }> {
  void args.cardType;
  const nowIso = new Date().toISOString();
  const unlocks = await evaluateAchievements(db, userId, {
    kinds: ACCEPT_TRIGGERS,
    triggerEventId: args.cardId,
    nowIso,
  });
  return { unlocks };
}
