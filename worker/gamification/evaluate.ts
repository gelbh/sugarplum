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
  | "distinct_types"
  | "composite"
  | "library_decks"
  | "clear_due_days"
  | "long_reviews"
  | "mature_cards"
  | "level_reached";

export type AchievementDefRow = {
  id: string;
  rarity: Rarity;
  trigger_kind: TriggerKind;
  threshold: number | null;
  params_json: string | null;
  title: string;
  fruit_type: FruitType;
  catalog_version: number;
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

type ScheduleMetrics = { matureCards: number };

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

/** Aggregates loaded on demand; the user_gamification read always runs. */
type MetricGroup = "review" | "card" | "schedule";

type StudyEvent = "review" | "accept";

const TRIGGERS: Record<
  TriggerKind,
  {
    groups: readonly MetricGroup[];
    on: readonly StudyEvent[];
    value: (m: StudyMetrics, def: AchievementDefRow) => number;
  }
> = {
  reviews_total: {
    groups: ["review"],
    on: ["review"],
    value: (m) => m.reviewsTotal,
  },
  study_days_total: {
    groups: ["review"],
    on: ["review"],
    value: (m) => m.studyDaysTotal,
  },
  long_reviews: {
    groups: ["review"],
    on: ["review"],
    value: (m) => m.longReviews,
  },
  accepts_total: {
    groups: ["card"],
    on: ["accept"],
    value: (m) => m.acceptsTotal,
  },
  distinct_types: {
    groups: ["card"],
    on: ["accept"],
    value: (m) => m.distinctTypes,
  },
  library_decks: {
    groups: ["card"],
    on: ["accept"],
    value: (m) => m.libraryDecks,
  },
  mature_cards: {
    groups: ["schedule"],
    on: ["review"],
    value: (m) => m.matureCards,
  },
  streak_current: {
    groups: [],
    on: ["review"],
    value: (m) => m.streakCurrent,
  },
  clear_due_days: {
    groups: [],
    on: ["review"],
    value: (m) => m.clearDueDays,
  },
  level_reached: {
    groups: [],
    on: ["review", "accept"],
    value: (m) => m.level,
  },
  composite: {
    groups: ["review"],
    on: ["review", "accept"],
    value: (m, def) =>
      compositeParts(def.params_json, m).every((p) => p.current >= p.target)
        ? 1
        : 0,
  },
};

export const TRIGGER_KINDS = Object.keys(TRIGGERS) as TriggerKind[];

const ZERO_METRICS: StudyMetrics = {
  reviewsTotal: 0,
  studyDaysTotal: 0,
  longReviews: 0,
  acceptsTotal: 0,
  distinctTypes: 0,
  libraryDecks: 0,
  matureCards: 0,
  streakCurrent: 0,
  streakBest: 0,
  level: 1,
  clearDueDays: 0,
};

/** Interval (days) at which a card counts as mature. */
export const MATURE_DAYS = 21;
/** Gap (days) since last sight for a long-haul review. */
export const LONG_REVIEW_DAYS = 30;

const UPSERT_PROGRESS = `INSERT INTO achievement_progress (user_id, achievement_id, current_value, threshold)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(user_id, achievement_id) DO UPDATE SET
     current_value = excluded.current_value,
     threshold = excluded.threshold`;

const INSERT_COMPLETION = `INSERT OR IGNORE INTO achievement_completions (
     user_id, achievement_id, completed_at, trigger_event_id, backdated
   ) VALUES (?, ?, ?, ?, ?)`;

function isTriggerKind(kind: string): kind is TriggerKind {
  return Object.hasOwn(TRIGGERS, kind);
}

async function loadActiveDefs(db: D1Database): Promise<AchievementDefRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, rarity, trigger_kind, threshold, params_json, title, fruit_type, catalog_version
       FROM achievement_defs WHERE active = 1`,
    )
    .all<Omit<AchievementDefRow, "trigger_kind"> & { trigger_kind: string }>();
  return (results ?? []).filter((d): d is AchievementDefRow =>
    isTriggerKind(d.trigger_kind),
  );
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
): Promise<ScheduleMetrics> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS mature_cards
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'
         AND s.scheduled_days >= ${MATURE_DAYS}`,
    )
    .bind(userId)
    .first<{ mature_cards: number }>();
  return { matureCards: Number(row?.mature_cards ?? 0) };
}

type GamificationRead = GamificationMetrics & {
  /** Null when the user has no row yet. */
  catalogVersion: number | null;
};

async function loadGamification(
  db: D1Database,
  userId: string,
): Promise<GamificationRead> {
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, level, clear_due_days, catalog_version
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      streak_current: number;
      streak_best: number;
      level: number;
      clear_due_days: number;
      catalog_version: number;
    }>();
  return {
    streakCurrent: row?.streak_current ?? 0,
    streakBest: row?.streak_best ?? 0,
    level: row?.level ?? 1,
    clearDueDays: row?.clear_due_days ?? 0,
    catalogVersion: row?.catalog_version ?? null,
  };
}

/** ponytail: aggregates rescan the user's history per event; upgrade to counters on user_gamification if D1 reads bite. */
async function loadMetrics(
  db: D1Database,
  userId: string,
  groups: ReadonlySet<MetricGroup>,
  gamification?: GamificationMetrics,
): Promise<StudyMetrics> {
  const [review, card, schedule, g] = await Promise.all([
    groups.has("review") ? loadReviewMetrics(db, userId) : null,
    groups.has("card") ? loadCardMetrics(db, userId) : null,
    groups.has("schedule") ? loadScheduleMetrics(db, userId) : null,
    gamification ?? loadGamification(db, userId),
  ]);
  return {
    ...ZERO_METRICS,
    ...review,
    ...card,
    ...schedule,
    streakCurrent: g.streakCurrent,
    streakBest: g.streakBest,
    level: g.level,
    clearDueDays: g.clearDueDays,
  };
}

export function loadCompositeMetrics(
  db: D1Database,
  userId: string,
): Promise<StudyMetrics> {
  return loadMetrics(db, userId, new Set(TRIGGERS.composite.groups));
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

function toUnlockView(def: AchievementDefRow): UnlockView {
  return {
    id: def.id,
    title: def.title,
    fruitType: def.fruit_type,
    rarity: def.rarity,
    traits: traitsForAchievement(def.id, def.rarity),
  };
}

async function evaluatePending(
  db: D1Database,
  userId: string,
  pending: AchievementDefRow[],
  gamification: GamificationMetrics,
  triggerEventId: string | null,
  isBackdated: (def: AchievementDefRow) => boolean,
): Promise<UnlockView[]> {
  const groups = new Set(
    pending.flatMap((d) => TRIGGERS[d.trigger_kind].groups),
  );
  const [metrics, progress] = await Promise.all([
    loadMetrics(db, userId, groups, gamification),
    loadProgress(db, userId),
  ]);

  const writes: D1PreparedStatement[] = [];
  const reached: { def: AchievementDefRow; backdated: boolean }[] = [];
  for (const def of pending) {
    const backdated = isBackdated(def);
    // Historical streak fruits use peak, not the (possibly expired) live current.
    const value =
      backdated && def.trigger_kind === "streak_current"
        ? metrics.streakBest
        : TRIGGERS[def.trigger_kind].value(metrics, def);
    const threshold = def.threshold ?? 1;
    // A missing progress row reads as 0 (the gallery falls back to the def threshold).
    const prev = progress.get(def.id) ?? { current_value: 0, threshold };
    if (prev.current_value !== value || prev.threshold !== threshold) {
      writes.push(
        db.prepare(UPSERT_PROGRESS).bind(userId, def.id, value, threshold),
      );
    }
    if (value >= threshold) reached.push({ def, backdated });
  }

  const completedAt = new Date().toISOString();
  const inserts = reached.map(({ def, backdated }) =>
    db
      .prepare(INSERT_COMPLETION)
      .bind(userId, def.id, completedAt, triggerEventId, backdated ? 1 : 0),
  );
  if (writes.length + inserts.length === 0) return [];
  const results = await db.batch([...writes, ...inserts]);
  const insertResults = results.slice(writes.length);

  const unlocks: UnlockView[] = [];
  for (const [i, { def, backdated }] of reached.entries()) {
    // Backdated unlocks must not stamp unlock XP into "now" (weekly board pollution).
    if (backdated || (insertResults[i]?.meta.changes ?? 0) === 0) continue;
    await creditXp(
      db,
      userId,
      XP.unlock[def.rarity],
      "unlock",
      `unlock:${def.id}`,
    );
    unlocks.push(toUnlockView(def));
  }
  return unlocks;
}

export async function evaluateAchievements(
  db: D1Database,
  userId: string,
  opts: {
    event?: StudyEvent;
    triggerEventId: string | null;
    nowIso: string;
    backdated?: 0 | 1;
  },
): Promise<UnlockView[]> {
  const [defs, completed, gamification] = await Promise.all([
    loadActiveDefs(db),
    loadCompletedIds(db, userId),
    loadGamification(db, userId),
  ]);
  const latest = Math.max(1, ...defs.map((d) => d.catalog_version));
  // No row yet: it is created at the latest version, so nothing is newer.
  const userVersion = gamification.catalogVersion ?? latest;
  const isNewer = (d: AchievementDefRow) => d.catalog_version > userVersion;
  const event = opts.event;

  const pending = defs.filter(
    (d) =>
      !completed.has(d.id) &&
      (!event || TRIGGERS[d.trigger_kind].on.includes(event) || isNewer(d)),
  );
  const unlocks =
    pending.length === 0
      ? []
      : await evaluatePending(
          db,
          userId,
          pending,
          gamification,
          opts.triggerEventId,
          (d) => opts.backdated === 1 || isNewer(d),
        );

  if (latest > userVersion) {
    await db
      .prepare(
        `UPDATE user_gamification SET catalog_version = ?, updated_at = ?
         WHERE user_id = ? AND catalog_version < ?`,
      )
      .bind(latest, opts.nowIso, userId, latest)
      .run();
  }
  return unlocks;
}

export async function evaluateAfterReview(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<{ unlocks: UnlockView[] }> {
  const unlocks = await evaluateAchievements(db, userId, {
    event: "review",
    triggerEventId: args.reviewLogId,
    nowIso: args.reviewedAt.toISOString(),
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
    event: "accept",
    triggerEventId: args.cardId,
    nowIso: new Date().toISOString(),
  });
  return { unlocks };
}
