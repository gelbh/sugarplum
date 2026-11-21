import {
  LONG_REVIEW_DAYS,
  MATURE_DAYS,
} from "../../worker/gamification/evaluate";
import {
  ACHIEVEMENT_DEF_SEEDS,
  type AchievementDefSeed,
} from "./gamification-seeds";
type DeckRow = { id: string; user_id: string };

type CardRowLike = {
  id: string;
  deck_id: string;
  type: string;
  status: string;
};

type ScheduleRowLike = { card_id: string; due: string; scheduled_days: number };

type ReviewLogRowLike = {
  id: string;
  card_id: string;
  reviewed_at: string;
  elapsed_days: number;
};

export type UserGamificationRow = {
  user_id: string;
  streak_current: number;
  streak_best: number;
  streak_day: string | null;
  xp_total: number;
  level: number;
  display_name: string | null;
  board_opt_in: number;
  updated_at: string;
  clear_due_days: number;
  clear_due_last_day: string | null;
  catalog_version: number;
  streak_freezes: number;
  daily_goal_reviews: number;
  daily_goal_day: string | null;
};

export type AchievementProgressRow = {
  user_id: string;
  achievement_id: string;
  current_value: number;
  threshold: number;
};

export type AchievementCompletionRow = {
  user_id: string;
  achievement_id: string;
  completed_at: string;
  trigger_event_id: string | null;
  backdated: number;
};

export type XpLedgerRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  idempotency_key: string;
  created_at: string;
};

export type StreakFreezeEventRow = {
  id: string;
  user_id: string;
  consumed_at: string;
  streak_at_consume: number;
};

export type GamificationTestState = {
  achievementDefs: Map<string, AchievementDefSeed>;
  userGamification: Map<string, UserGamificationRow>;
  achievementProgress: Map<string, AchievementProgressRow>;
  achievementCompletions: Map<string, AchievementCompletionRow>;
  xpLedger: XpLedgerRow[];
  xpLedgerKeys: Set<string>;
  streakFreezeEvents: StreakFreezeEventRow[];
  cards: Map<string, CardRowLike>;
  decks: Map<string, DeckRow>;
  schedules: Map<string, ScheduleRowLike>;
  reviewLogs: ReviewLogRowLike[];
  progressWrites: string[];
};

function progressKey(userId: string, achievementId: string): string {
  return `${userId}\0${achievementId}`;
}

function completionKey(userId: string, achievementId: string): string {
  return `${userId}\0${achievementId}`;
}

function ledgerKey(userId: string, idempotencyKey: string): string {
  return `${userId}\0${idempotencyKey}`;
}

function userCardsForUser(state: GamificationTestState, userId: string) {
  return [...state.cards.values()].filter((c) => {
    const deck = state.decks.get(c.deck_id);
    return deck?.user_id === userId;
  });
}

function acceptedSchedulesForUser(
  state: GamificationTestState,
  userId: string,
): ScheduleRowLike[] {
  return userCardsForUser(state, userId)
    .filter((c) => c.status === "accepted")
    .map((c) => state.schedules.get(c.id))
    .filter((s): s is ScheduleRowLike => s != null);
}

function latestCatalogVersion(state: GamificationTestState): number {
  return Math.max(
    1,
    ...[...state.achievementDefs.values()]
      .filter((d) => d.active === 1)
      .map((d) => d.catalog_version),
  );
}

function reviewLogsForUser(state: GamificationTestState, userId: string) {
  return state.reviewLogs.filter((rl) => {
    const card = state.cards.get(rl.card_id);
    return card != null && state.decks.get(card.deck_id)?.user_id === userId;
  });
}

export function gamificationFirst<T>(
  state: GamificationTestState,
  normalized: string,
  bound: unknown[],
): T | null {
  if (
    normalized.startsWith(
      "SELECT streak_current, streak_best, streak_day, streak_freezes FROM user_gamification",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          streak_day: row.streak_day,
          streak_freezes: row.streak_freezes,
        } as T)
      : null;
  }
  if (
    normalized.startsWith(
      "SELECT streak_current, streak_best, streak_day FROM user_gamification",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          streak_day: row.streak_day,
        } as T)
      : null;
  }
  if (
    normalized.startsWith(
      "SELECT daily_goal_reviews, daily_goal_day FROM user_gamification",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          daily_goal_reviews: row.daily_goal_reviews,
          daily_goal_day: row.daily_goal_day,
        } as T)
      : null;
  }
  if (
    normalized.startsWith("SELECT COUNT(*) AS n FROM review_logs rl") &&
    normalized.includes("rl.reviewed_at >=")
  ) {
    const [userId, start, end] = bound as [string, string, string];
    const n = reviewLogsForUser(state, userId).filter(
      (l) => l.reviewed_at >= start && l.reviewed_at <= end,
    ).length;
    return { n } as T;
  }
  if (
    normalized.startsWith(
      "SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger",
    ) &&
    normalized.includes("created_at >=")
  ) {
    const [userId, start, end] = bound as [string, string, string];
    const xp = state.xpLedger
      .filter(
        (r) =>
          r.user_id === userId &&
          r.created_at >= start &&
          r.created_at < end,
      )
      .reduce((sum, r) => sum + r.amount, 0);
    return { xp } as T;
  }
  if (
    normalized.startsWith(
      "SELECT board_opt_in, xp_total FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({ board_opt_in: row.board_opt_in, xp_total: row.xp_total } as T)
      : null;
  }
  if (
    normalized.startsWith(
      "SELECT board_opt_in FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row ? ({ board_opt_in: row.board_opt_in } as T) : null;
  }
  if (
    normalized.startsWith(
      "SELECT xp_total, level FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row ? ({ xp_total: row.xp_total, level: row.level } as T) : null;
  }
  if (
    normalized.includes("COALESCE(streak_freezes, 0) AS streak_freezes") &&
    normalized.includes("FROM user_gamification WHERE user_id =")
  ) {
    const userId = bound[bound.length - 1] as string;
    const row = state.userGamification.get(userId);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          streak_day: row.streak_day,
          xp_total: row.xp_total,
          level: row.level,
          display_name: row.display_name,
          board_opt_in: row.board_opt_in,
          streak_freezes: row.streak_freezes,
          daily_goal_reviews: row.daily_goal_reviews,
        } as T)
      : null;
  }
  if (
    normalized.startsWith(
      "SELECT streak_current, streak_best, streak_day, xp_total, level, display_name, board_opt_in FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          streak_day: row.streak_day,
          xp_total: row.xp_total,
          level: row.level,
          display_name: row.display_name,
          board_opt_in: row.board_opt_in,
        } as T)
      : null;
  }
  if (
    normalized.includes("FROM user_gamification WHERE user_id =") &&
    normalized.includes("clear_due_days") &&
    normalized.includes("catalog_version") &&
    normalized.includes("board_opt_in")
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          streak_day: row.streak_day,
          xp_total: row.xp_total,
          level: row.level,
          display_name: row.display_name,
          board_opt_in: row.board_opt_in,
          updated_at: row.updated_at,
          clear_due_days: row.clear_due_days,
          clear_due_last_day: row.clear_due_last_day,
          catalog_version: row.catalog_version,
        } as T)
      : null;
  }
  if (
    normalized.startsWith(
      "SELECT xp_total FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row ? ({ xp_total: row.xp_total } as T) : null;
  }
  if (
    normalized.startsWith("SELECT 1 AS ok FROM xp_ledger") &&
    normalized.includes("idempotency_key =")
  ) {
    const [userId, idempotencyKey] = bound as [string, string];
    const key = ledgerKey(userId, idempotencyKey);
    return state.xpLedgerKeys.has(key) ? ({ ok: 1 } as T) : null;
  }
  if (normalized.startsWith("SELECT COUNT(*) AS reviews_total")) {
    const logs = reviewLogsForUser(state, bound[0] as string);
    return {
      reviews_total: logs.length,
      study_days_total: new Set(logs.map((l) => l.reviewed_at.slice(0, 10)))
        .size,
      long_reviews: logs.filter((l) => l.elapsed_days >= LONG_REVIEW_DAYS)
        .length,
    } as T;
  }
  if (normalized.startsWith("SELECT COUNT(*) AS accepts_total")) {
    const accepted = userCardsForUser(state, bound[0] as string).filter(
      (c) => c.status === "accepted",
    );
    return {
      accepts_total: accepted.length,
      distinct_types: new Set(accepted.map((c) => c.type)).size,
      library_decks: new Set(accepted.map((c) => c.deck_id)).size,
    } as T;
  }
  if (normalized.startsWith("SELECT COUNT(*) AS mature_cards")) {
    const schedules = acceptedSchedulesForUser(state, bound[0] as string);
    return {
      mature_cards: schedules.filter((s) => s.scheduled_days >= MATURE_DAYS)
        .length,
    } as T;
  }
  if (
    normalized.startsWith(
      "SELECT streak_current, streak_best, level, clear_due_days, catalog_version FROM user_gamification",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
          level: row.level,
          clear_due_days: row.clear_due_days,
          catalog_version: row.catalog_version,
        } as T)
      : null;
  }
  return null;
}

export function gamificationAll<T>(
  state: GamificationTestState,
  normalized: string,
  bound: unknown[],
): { results: T[] } | null {
  if (
    normalized.includes("LEFT JOIN achievement_progress") &&
    normalized.includes("FROM achievement_defs d")
  ) {
    const userId = bound[0] as string;
    const rows = [...state.achievementDefs.values()]
      .filter((d) => d.active === 1)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => {
        const progress = state.achievementProgress.get(
          progressKey(userId, d.id),
        );
        const completion = state.achievementCompletions.get(
          completionKey(userId, d.id),
        );
        return {
          id: d.id,
          category: d.category,
          fruit_type: d.fruit_type,
          rarity: d.rarity,
          title: d.title,
          description: d.description,
          sort_order: d.sort_order,
          trigger_kind: d.trigger_kind,
          params_json: d.params_json,
          def_threshold: d.threshold,
          progress_current: progress?.current_value ?? null,
          progress_threshold: progress?.threshold ?? null,
          completed_at: completion?.completed_at ?? null,
        };
      });
    return { results: rows as T[] };
  }
  if (
    normalized.includes("FROM achievement_defs WHERE active = 1")
  ) {
    const rows = [...state.achievementDefs.values()]
      .filter((d) => d.active === 1)
      .map((d) => ({
        id: d.id,
        rarity: d.rarity,
        trigger_kind: d.trigger_kind,
        threshold: d.threshold,
        params_json: d.params_json,
        title: d.title,
        fruit_type: d.fruit_type,
        catalog_version: d.catalog_version,
      }));
    return { results: rows as T[] };
  }
  if (
    normalized.includes("ug.xp_total AS xp") &&
    normalized.includes("FROM user_gamification ug") &&
    normalized.includes("board_opt_in = 1")
  ) {
    const results = [...state.userGamification.values()]
      .filter((row) => row.board_opt_in === 1 && row.xp_total > 0)
      .map((row) => ({
        user_id: row.user_id,
        display_name: row.display_name,
        xp: row.xp_total,
      }))
      .sort((a, b) => {
        if (b.xp !== a.xp) return b.xp - a.xp;
        return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
      });
    return { results: results as T[] };
  }
  if (
    normalized.includes("FROM user_gamification ug") &&
    normalized.includes("INNER JOIN xp_ledger xl") &&
    normalized.includes("board_opt_in = 1")
  ) {
    const [startIso, endIso] = bound as [string, string];
    const byUser = new Map<
      string,
      { user_id: string; display_name: string | null; xp: number }
    >();
    for (const row of state.userGamification.values()) {
      if (row.board_opt_in !== 1) continue;
      byUser.set(row.user_id, {
        user_id: row.user_id,
        display_name: row.display_name,
        xp: 0,
      });
    }
    for (const entry of state.xpLedger) {
      if (entry.created_at < startIso || entry.created_at >= endIso) continue;
      const agg = byUser.get(entry.user_id);
      if (!agg) continue;
      agg.xp += entry.amount;
    }
    const results = [...byUser.values()]
      .filter((r) => r.xp > 0)
      .sort((a, b) => {
        if (b.xp !== a.xp) return b.xp - a.xp;
        return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
      });
    return { results: results as T[] };
  }
  if (
    normalized.startsWith(
      "SELECT achievement_id FROM achievement_completions WHERE user_id =",
    )
  ) {
    const userId = bound[0] as string;
    const results = [...state.achievementCompletions.values()]
      .filter((c) => c.user_id === userId)
      .map((c) => ({ achievement_id: c.achievement_id }));
    return { results: results as T[] };
  }
  if (
    normalized.startsWith(
      "SELECT achievement_id, current_value, threshold FROM achievement_progress WHERE user_id =",
    )
  ) {
    const userId = bound[0] as string;
    const results = [...state.achievementProgress.values()]
      .filter((p) => p.user_id === userId)
      .map(({ achievement_id, current_value, threshold }) => ({
        achievement_id,
        current_value,
        threshold,
      }));
    return { results: results as T[] };
  }
  if (
    normalized.includes("SELECT DISTINCT substr(rl.reviewed_at, 1, 10) AS study_day")
  ) {
    const userId = bound[0] as string;
    const days = new Set<string>();
    for (const rl of state.reviewLogs) {
      const card = state.cards.get(rl.card_id);
      if (!card) continue;
      const deck = state.decks.get(card.deck_id);
      if (deck?.user_id !== userId) continue;
      days.add(rl.reviewed_at.slice(0, 10));
    }
    return { results: [...days].map((study_day) => ({ study_day })) as T[] };
  }
  return null;
}

export function gamificationRun(
  state: GamificationTestState,
  normalized: string,
  bound: unknown[],
): D1Result | null {
  if (
    normalized.startsWith("INSERT INTO user_gamification") &&
    normalized.includes("board_opt_in") &&
    normalized.includes("clear_due_days")
  ) {
    const [
      userId,
      streak_current,
      streak_best,
      streak_day,
      xp_total,
      level,
      display_name,
      board_opt_in,
      updated_at,
      clear_due_days,
      clear_due_last_day,
      catalog_version,
    ] = bound as [
      string,
      number,
      number,
      string | null,
      number,
      number,
      string | null,
      number,
      string,
      number,
      string | null,
      number,
    ];
    state.userGamification.set(userId, {
      user_id: userId,
      streak_current,
      streak_best,
      streak_day,
      xp_total,
      level,
      display_name,
      board_opt_in,
      updated_at,
      clear_due_days,
      clear_due_last_day,
      catalog_version,
      streak_freezes: 0,
      daily_goal_reviews: 20,
      daily_goal_day: null,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("INSERT OR IGNORE INTO user_gamification")) {
    const [userId, updatedAt] = bound as [string, string];
    if (!state.userGamification.has(userId)) {
      state.userGamification.set(userId, {
        user_id: userId,
        streak_current: 0,
        streak_best: 0,
        streak_day: null,
        xp_total: 0,
        level: 1,
        display_name: null,
        board_opt_in: 0,
        updated_at: updatedAt,
        clear_due_days: 0,
        clear_due_last_day: null,
        catalog_version: normalized.includes(
          "(SELECT COALESCE(MAX(catalog_version), 1) FROM achievement_defs WHERE active = 1)",
        )
          ? latestCatalogVersion(state)
          : 1,
        streak_freezes: 0,
        daily_goal_reviews: 20,
        daily_goal_day: null,
      });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET streak_freezes = streak_freezes - ?",
    )
  ) {
    const [needed, yesterday, updatedAt, userId, needGuard, streakDayGuard] =
      bound as [number, string, string, string, number, string];
    const row = state.userGamification.get(userId);
    if (
      !row ||
      row.streak_freezes < needGuard ||
      row.streak_day !== streakDayGuard
    ) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.userGamification.set(userId, {
      ...row,
      streak_freezes: row.streak_freezes - needed,
      streak_day: yesterday,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET streak_freezes = MIN(streak_freezes + 1",
    )
  ) {
    const [_maxStored, updatedAt, userId, maxGuard] = bound as [
      number,
      string,
      string,
      number,
    ];
    const row = state.userGamification.get(userId);
    if (!row || row.streak_freezes >= maxGuard) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.userGamification.set(userId, {
      ...row,
      streak_freezes: Math.min(row.streak_freezes + 1, maxGuard),
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET streak_current = 0, updated_at = ?",
    )
  ) {
    const [updatedAt, userId, yesterday, needGuard] = bound as [
      string,
      string,
      string,
      number,
    ];
    const row = state.userGamification.get(userId);
    if (
      !row ||
      row.streak_current <= 0 ||
      row.streak_day == null ||
      row.streak_day >= yesterday ||
      row.streak_freezes >= needGuard
    ) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.userGamification.set(userId, {
      ...row,
      streak_current: 0,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET daily_goal_day = ?, updated_at = ?",
    )
  ) {
    const [day, updatedAt, userId] = bound as [string, string, string];
    const row = state.userGamification.get(userId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.userGamification.set(userId, {
      ...row,
      daily_goal_day: day,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("INSERT INTO streak_freeze_events")) {
    const [id, userId, consumedAt, streakAt] = bound as [
      string,
      string,
      string,
      number,
    ];
    state.streakFreezeEvents.push({
      id,
      user_id: userId,
      consumed_at: consumedAt,
      streak_at_consume: streakAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith("UPDATE user_gamification SET") &&
    normalized.includes("WHERE user_id = ?") &&
    (normalized.includes("daily_goal_reviews = ?") ||
      normalized.includes("board_opt_in = ?") ||
      normalized.includes("display_name = ?"))
  ) {
    const userId = bound[bound.length - 1] as string;
    const row = state.userGamification.get(userId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    let i = 0;
    const next = { ...row };
    if (normalized.includes("board_opt_in = ?")) {
      next.board_opt_in = bound[i++] as number;
    }
    if (normalized.includes("display_name = ?")) {
      next.display_name = bound[i++] as string | null;
    }
    if (normalized.includes("daily_goal_reviews = ?")) {
      next.daily_goal_reviews = bound[i++] as number;
    }
    next.updated_at = bound[i++] as string;
    state.userGamification.set(userId, next);
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET streak_current = ?, streak_best = ?, streak_day = ?",
    )
  ) {
    const [streakCurrent, streakBest, streakDay, updatedAt, userId] = bound as [
      number,
      number,
      string | null,
      string,
      string,
    ];
    const row = state.userGamification.get(userId);
    if (row) {
      state.userGamification.set(userId, {
        ...row,
        streak_current: streakCurrent,
        streak_best: streakBest,
        streak_day: streakDay,
        updated_at: updatedAt,
      });
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET clear_due_days = clear_due_days + 1",
    )
  ) {
    const [day, updatedAt, userId, guardDay, dueUserId, nowIso] = bound as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const row = state.userGamification.get(userId);
    const anyDue =
      normalized.includes(
        "AND NOT EXISTS ( SELECT 1 FROM cards c INNER JOIN card_schedules s ON s.card_id = c.id INNER JOIN decks d ON d.id = c.deck_id WHERE d.user_id = ? AND c.status = 'accepted' AND s.due <= ? )",
      ) &&
      acceptedSchedulesForUser(state, dueUserId).some((s) => s.due <= nowIso);
    if (!row || row.clear_due_last_day === guardDay || anyDue) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.userGamification.set(userId, {
      ...row,
      clear_due_days: row.clear_due_days + 1,
      clear_due_last_day: day,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET catalog_version = ?, updated_at = ? WHERE user_id = ? AND catalog_version < ?",
    )
  ) {
    const [version, updatedAt, userId, guardVersion] = bound as [
      number,
      string,
      string,
      number,
    ];
    const row = state.userGamification.get(userId);
    if (!row || row.catalog_version >= guardVersion) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.userGamification.set(userId, {
      ...row,
      catalog_version: version,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith("UPDATE user_gamification SET xp_total = xp_total +")
  ) {
    const [amount, updatedAt, userId] = bound as [number, string, string];
    const row = state.userGamification.get(userId);
    if (row) {
      state.userGamification.set(userId, {
        ...row,
        xp_total: row.xp_total + amount,
        updated_at: updatedAt,
      });
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("UPDATE user_gamification SET level =")) {
    const [level, updatedAt, userId] = bound as [number, string, string];
    const row = state.userGamification.get(userId);
    if (row) {
      state.userGamification.set(userId, {
        ...row,
        level,
        updated_at: updatedAt,
      });
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET board_opt_in = ?, display_name = ?, updated_at = ?",
    )
  ) {
    const [boardOptIn, displayName, updatedAt, userId] = bound as [
      number,
      string | null,
      string,
      string,
    ];
    const row = state.userGamification.get(userId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.userGamification.set(userId, {
      ...row,
      board_opt_in: boardOptIn,
      display_name: displayName,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET board_opt_in = ?, updated_at = ?",
    )
  ) {
    const [boardOptIn, updatedAt, userId] = bound as [number, string, string];
    const row = state.userGamification.get(userId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.userGamification.set(userId, {
      ...row,
      board_opt_in: boardOptIn,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET display_name = ?, updated_at = ?",
    )
  ) {
    const [displayName, updatedAt, userId] = bound as [
      string | null,
      string,
      string,
    ];
    const row = state.userGamification.get(userId);
    if (!row) return { success: true, meta: { changes: 0 } } as D1Result;
    state.userGamification.set(userId, {
      ...row,
      display_name: displayName,
      updated_at: updatedAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith("INSERT OR IGNORE INTO xp_ledger") &&
    normalized.includes("SELECT COALESCE(SUM(amount), 0) FROM xp_ledger")
  ) {
    const [id, userId, amount, reason, idempotencyKey, createdAt] = bound as [
      string,
      string,
      number,
      string,
      string,
      string,
    ];
    const [keyLike, start, end, max] = bound.slice(6) as [
      string,
      string,
      string,
      number,
    ];
    const prefix = keyLike.replace(/%$/, "");
    const capped = state.xpLedger
      .filter(
        (e) =>
          e.user_id === userId &&
          e.idempotency_key.startsWith(prefix) &&
          e.created_at >= start &&
          e.created_at <= end,
      )
      .reduce((sum, e) => sum + e.amount, 0);
    const key = ledgerKey(userId, idempotencyKey);
    if (capped + amount > max || state.xpLedgerKeys.has(key)) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.xpLedgerKeys.add(key);
    state.xpLedger.push({
      id,
      user_id: userId,
      amount,
      reason,
      idempotency_key: idempotencyKey,
      created_at: createdAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("INSERT OR IGNORE INTO xp_ledger")) {
    const [id, userId, amount, reason, idempotencyKey, createdAt] = bound as [
      string,
      string,
      number,
      string,
      string,
      string,
    ];
    const key = ledgerKey(userId, idempotencyKey);
    if (state.xpLedgerKeys.has(key)) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.xpLedgerKeys.add(key);
    state.xpLedger.push({
      id,
      user_id: userId,
      amount,
      reason,
      idempotency_key: idempotencyKey,
      created_at: createdAt,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (
    normalized.startsWith("INSERT INTO achievement_progress") &&
    normalized.includes("ON CONFLICT")
  ) {
    const [userId, achievementId, currentValue, threshold] = bound as [
      string,
      string,
      number,
      number,
    ];
    state.achievementProgress.set(progressKey(userId, achievementId), {
      user_id: userId,
      achievement_id: achievementId,
      current_value: currentValue,
      threshold,
    });
    state.progressWrites.push(achievementId);
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("INSERT OR IGNORE INTO achievement_completions")) {
    const [userId, achievementId, completedAt, triggerEventId, backdated] =
      bound as [string, string, string, string | null, number | undefined];
    const key = completionKey(userId, achievementId);
    if (state.achievementCompletions.has(key)) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.achievementCompletions.set(key, {
      user_id: userId,
      achievement_id: achievementId,
      completed_at: completedAt,
      trigger_event_id: triggerEventId,
      backdated: backdated ?? 0,
    });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  return null;
}

export function initGamificationState(
  cards: Map<string, CardRowLike>,
  decks: Map<string, DeckRow>,
  schedules: Map<string, ScheduleRowLike>,
  reviewLogs: ReviewLogRowLike[],
): GamificationTestState {
  const achievementDefs = new Map<string, AchievementDefSeed>();
  for (const seed of ACHIEVEMENT_DEF_SEEDS) {
    achievementDefs.set(seed.id, seed);
  }
  return {
    achievementDefs,
    userGamification: new Map(),
    achievementProgress: new Map(),
    achievementCompletions: new Map(),
    xpLedger: [],
    xpLedgerKeys: new Set(),
    streakFreezeEvents: [],
    cards,
    decks,
    schedules,
    reviewLogs,
    progressWrites: [],
  };
}
