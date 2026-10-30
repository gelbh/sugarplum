import type { FruitType } from "../../src/achievements/catalog";
import type { CompositePart, UnlockView } from "../../src/achievements/wire";
import { utcDay, XP, type Rarity } from "./constants";
import { traitsForAchievement } from "./traits";
import { creditXp, ensureUserGamification } from "./xp";

export const TRIGGER_KINDS = [
  "reviews_total",
  "accepts_total",
  "study_days_total",
  "streak_current",
  "distinct_types",
  "composite",
  "library_decks",
  "clear_due_days",
  "long_reviews",
  "mature_cards",
  "level_reached",
] as const;

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export type AchievementDefRow = {
  id: string;
  rarity: Rarity;
  trigger_kind: TriggerKind;
  threshold: number | null;
  params_json: string | null;
  title: string;
  fruit_type: FruitType;
};

type ReviewMetrics = {
  reviewsTotal: number;
  studyDaysTotal: number;
  longReviews: number;
};

type CardMetrics = {
  acceptsTotal: number;
  distinctTypes: number;
  libraryDecks: number;
};

export type ScheduleMetrics = { dueAccepted: number; matureCards: number };

type GamificationMetrics = {
  streakCurrent: number;
  streakBest: number;
  level: number;
  clearDueDays: number;
};

export type StudyMetrics = ReviewMetrics &
  CardMetrics &
  ScheduleMetrics &
  GamificationMetrics;

type MetricGroup = "review" | "card" | "schedule" | "gamification";

const METRIC_GROUPS: Record<TriggerKind, readonly MetricGroup[]> = {
  reviews_total: ["review"],
  study_days_total: ["review"],
  long_reviews: ["review"],
  accepts_total: ["card"],
  distinct_types: ["card"],
  library_decks: ["card"],
  mature_cards: ["schedule"],
  streak_current: ["gamification"],
  clear_due_days: ["gamification"],
  level_reached: ["gamification"],
  composite: ["review", "gamification"],
};

const ZERO_METRICS: StudyMetrics = {
  reviewsTotal: 0,
  studyDaysTotal: 0,
  longReviews: 0,
  acceptsTotal: 0,
  distinctTypes: 0,
  libraryDecks: 0,
  dueAccepted: 0,
  matureCards: 0,
  streakCurrent: 0,
  streakBest: 0,
  level: 1,
  clearDueDays: 0,
};

const REVIEW_TRIGGERS = new Set<TriggerKind>([
  "reviews_total",
  "study_days_total",
  "streak_current",
  "long_reviews",
  "mature_cards",
  "clear_due_days",
  "level_reached",
  "composite",
]);

const ACCEPT_TRIGGERS = new Set<TriggerKind>([
  "accepts_total",
  "distinct_types",
  "library_decks",
  "level_reached",
  "composite",
]);

/** Interval (days) at which a card counts as mature. */
const MATURE_DAYS = 21;
/** Gap (days) since last sight for a long-haul review. */
const LONG_REVIEW_DAYS = 30;

const UPSERT_PROGRESS = `INSERT INTO achievement_progress (user_id, achievement_id, current_value, threshold)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(user_id, achievement_id) DO UPDATE SET
     current_value = excluded.current_value,
     threshold = excluded.threshold`;

async function loadActiveDefs(db: D1Database): Promise<AchievementDefRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, rarity, trigger_kind, threshold, params_json, title, fruit_type
       FROM achievement_defs WHERE active = 1`,
    )
    .all<AchievementDefRow>();
  return results ?? [];
}

async function loadCompletedIds(
  db: D1Database,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      `SELECT achievement_id FROM achievement_completions WHERE user_id = ?`,
    )
    .bind(userId)
    .all<{ achievement_id: string }>();
  return new Set((results ?? []).map((r) => r.achievement_id));
}

async function loadProgress(
  db: D1Database,
  userId: string,
): Promise<Map<string, { current_value: number; threshold: number }>> {
  const { results } = await db
    .prepare(
      `SELECT achievement_id, current_value, threshold
       FROM achievement_progress WHERE user_id = ?`,
    )
    .bind(userId)
    .all<{
      achievement_id: string;
      current_value: number;
      threshold: number;
    }>();
  return new Map((results ?? []).map((r) => [r.achievement_id, r]));
}

async function loadReviewMetrics(
  db: D1Database,
  userId: string,
): Promise<ReviewMetrics> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS reviews_total,
              COUNT(DISTINCT substr(rl.reviewed_at, 1, 10)) AS study_days_total,
              COALESCE(SUM(CASE WHEN rl.elapsed_days >= ${LONG_REVIEW_DAYS} THEN 1 ELSE 0 END), 0) AS long_reviews
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?`,
    )
    .bind(userId)
    .first<{
      reviews_total: number;
      study_days_total: number;
      long_reviews: number;
    }>();
  return {
    reviewsTotal: Number(row?.reviews_total ?? 0),
    studyDaysTotal: Number(row?.study_days_total ?? 0),
    longReviews: Number(row?.long_reviews ?? 0),
  };
}

async function loadCardMetrics(
  db: D1Database,
  userId: string,
): Promise<CardMetrics> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS accepts_total,
              COUNT(DISTINCT c.type) AS distinct_types,
              COUNT(DISTINCT c.deck_id) AS library_decks
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .first<{
      accepts_total: number;
      distinct_types: number;
      library_decks: number;
    }>();
  return {
    acceptsTotal: Number(row?.accepts_total ?? 0),
    distinctTypes: Number(row?.distinct_types ?? 0),
    libraryDecks: Number(row?.library_decks ?? 0),
  };
}

async function loadScheduleMetrics(
  db: D1Database,
  userId: string,
  nowIso: string,
): Promise<ScheduleMetrics> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN s.due <= ? THEN 1 ELSE 0 END), 0) AS due_accepted,
              COALESCE(SUM(CASE WHEN s.scheduled_days >= ${MATURE_DAYS} THEN 1 ELSE 0 END), 0) AS mature_cards
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(nowIso, userId)
    .first<{ due_accepted: number; mature_cards: number }>();
  return {
    dueAccepted: Number(row?.due_accepted ?? 0),
    matureCards: Number(row?.mature_cards ?? 0),
  };
}

async function loadGamificationMetrics(
  db: D1Database,
  userId: string,
): Promise<GamificationMetrics> {
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, level, clear_due_days
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      streak_current: number;
      streak_best: number;
      level: number;
      clear_due_days: number;
    }>();
  return {
    streakCurrent: row?.streak_current ?? 0,
    streakBest: row?.streak_best ?? 0,
    level: row?.level ?? 1,
    clearDueDays: row?.clear_due_days ?? 0,
  };
}

/** ponytail: aggregates rescan the user's history per event; upgrade to counters on user_gamification if D1 reads bite. */
async function loadMetrics(
  db: D1Database,
  userId: string,
  nowIso: string,
  groups: ReadonlySet<MetricGroup>,
  schedule?: ScheduleMetrics,
): Promise<StudyMetrics> {
  const [review, card, sched, gamification] = await Promise.all([
    groups.has("review") ? loadReviewMetrics(db, userId) : null,
    groups.has("card") ? loadCardMetrics(db, userId) : null,
    groups.has("schedule")
      ? (schedule ?? loadScheduleMetrics(db, userId, nowIso))
      : null,
    groups.has("gamification") ? loadGamificationMetrics(db, userId) : null,
  ]);
  return { ...ZERO_METRICS, ...review, ...card, ...sched, ...gamification };
}

export async function loadCompositeMetrics(
  db: D1Database,
  userId: string,
): Promise<{ streakBest: number; reviewsTotal: number }> {
  const [review, gamification] = await Promise.all([
    loadReviewMetrics(db, userId),
    loadGamificationMetrics(db, userId),
  ]);
  return {
    streakBest: gamification.streakBest,
    reviewsTotal: review.reviewsTotal,
  };
}

export function compositeParts(
  paramsJson: string | null,
  metrics: Pick<StudyMetrics, "streakBest" | "reviewsTotal">,
): CompositePart[] {
  let params: { streak_best_min?: number; reviews_min?: number } = {};
  try {
    const parsed: unknown = JSON.parse(paramsJson ?? "{}");
    if (typeof parsed === "object" && parsed !== null) {
      params = parsed as typeof params;
    }
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

function metricValue(def: AchievementDefRow, m: StudyMetrics): number {
  switch (def.trigger_kind) {
    case "reviews_total":
      return m.reviewsTotal;
    case "accepts_total":
      return m.acceptsTotal;
    case "study_days_total":
      return m.studyDaysTotal;
    case "streak_current":
      return m.streakCurrent;
    case "distinct_types":
      return m.distinctTypes;
    case "library_decks":
      return m.libraryDecks;
    case "clear_due_days":
      return m.clearDueDays;
    case "long_reviews":
      return m.longReviews;
    case "mature_cards":
      return m.matureCards;
    case "level_reached":
      return m.level;
    case "composite":
      return compositeParts(def.params_json, m).every(
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

async function complete(
  db: D1Database,
  userId: string,
  def: AchievementDefRow,
  triggerEventId: string | null,
  backdated: 0 | 1,
): Promise<UnlockView | null> {
  const insert = await db
    .prepare(
      `INSERT OR IGNORE INTO achievement_completions (
         user_id, achievement_id, completed_at, trigger_event_id, backdated
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(userId, def.id, new Date().toISOString(), triggerEventId, backdated)
    .run();
  if ((insert.meta.changes ?? 0) === 0) return null;

  // Backdated unlocks must not stamp unlock XP into "now" (weekly board pollution).
  if (backdated === 0) {
    await creditXp(
      db,
      userId,
      XP.unlock[def.rarity],
      "unlock",
      `unlock:${def.id}`,
    );
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
    schedule?: ScheduleMetrics;
  },
): Promise<UnlockView[]> {
  const backdated = opts.backdated ?? 0;
  const [defs, completed] = await Promise.all([
    loadActiveDefs(db),
    loadCompletedIds(db, userId),
  ]);
  const pending = defs.filter(
    (d) =>
      !completed.has(d.id) && (!opts.kinds || opts.kinds.has(d.trigger_kind)),
  );
  if (pending.length === 0) return [];

  const groups = new Set(pending.flatMap((d) => METRIC_GROUPS[d.trigger_kind]));
  const [metrics, progress] = await Promise.all([
    loadMetrics(db, userId, opts.nowIso, groups, opts.schedule),
    loadProgress(db, userId),
  ]);

  const writes: D1PreparedStatement[] = [];
  const reached: AchievementDefRow[] = [];
  for (const def of pending) {
    // Historical streak fruits use peak, not the (possibly expired) live current.
    const value =
      backdated === 1 && def.trigger_kind === "streak_current"
        ? metrics.streakBest
        : metricValue(def, metrics);
    const threshold = def.threshold ?? 1;
    // A missing progress row reads as 0 (the gallery falls back to the def threshold).
    const prev = progress.get(def.id) ?? { current_value: 0, threshold };
    if (prev.current_value !== value || prev.threshold !== threshold) {
      writes.push(
        db.prepare(UPSERT_PROGRESS).bind(userId, def.id, value, threshold),
      );
    }
    if (value >= threshold) reached.push(def);
  }
  if (writes.length > 0) await db.batch(writes);

  const unlocks: UnlockView[] = [];
  for (const def of reached) {
    const unlock = await complete(
      db,
      userId,
      def,
      opts.triggerEventId,
      backdated,
    );
    if (unlock) unlocks.push(unlock);
  }
  return unlocks;
}

/** At most once per UTC day; the WHERE guard makes retries idempotent. */
async function bumpClearDueDay(
  db: D1Database,
  userId: string,
  day: string,
): Promise<void> {
  await ensureUserGamification(db, userId);
  await db
    .prepare(
      `UPDATE user_gamification
       SET clear_due_days = clear_due_days + 1, clear_due_last_day = ?, updated_at = ?
       WHERE user_id = ? AND clear_due_last_day IS NOT ?`,
    )
    .bind(day, new Date().toISOString(), userId, day)
    .run();
}

export async function evaluateAfterReview(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<{ unlocks: UnlockView[] }> {
  const nowIso = args.reviewedAt.toISOString();
  const schedule = await loadScheduleMetrics(db, userId, nowIso);
  if (schedule.dueAccepted === 0) {
    await bumpClearDueDay(db, userId, utcDay(args.reviewedAt));
  }
  const unlocks = await evaluateAchievements(db, userId, {
    kinds: REVIEW_TRIGGERS,
    triggerEventId: args.reviewLogId,
    nowIso,
    schedule,
  });
  return { unlocks };
}

export async function evaluateAfterAccept(
  db: D1Database,
  userId: string,
  args: { cardId: string; cardType: string },
): Promise<{ unlocks: UnlockView[] }> {
  void args.cardType;
  const unlocks = await evaluateAchievements(db, userId, {
    kinds: ACCEPT_TRIGGERS,
    triggerEventId: args.cardId,
    nowIso: new Date().toISOString(),
  });
  return { unlocks };
}
