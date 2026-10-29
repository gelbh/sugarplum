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

type ScheduleRowLike = { card_id: string; due: string };

type ReviewLogRowLike = {
  id: string;
  card_id: string;
  reviewed_at: string;
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

export type GamificationTestState = {
  achievementDefs: Map<string, AchievementDefSeed>;
  userGamification: Map<string, UserGamificationRow>;
  achievementProgress: Map<string, AchievementProgressRow>;
  achievementCompletions: Map<string, AchievementCompletionRow>;
  xpLedger: XpLedgerRow[];
  xpLedgerKeys: Set<string>;
  cards: Map<string, CardRowLike>;
  decks: Map<string, DeckRow>;
  schedules: Map<string, ScheduleRowLike>;
  reviewLogs: ReviewLogRowLike[];
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

export function gamificationFirst<T>(
  state: GamificationTestState,
  normalized: string,
  bound: unknown[],
): T | null {
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
      "SELECT streak_current, streak_best FROM user_gamification",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row
      ? ({
          streak_current: row.streak_current,
          streak_best: row.streak_best,
        } as T)
      : null;
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
    normalized.startsWith(
      "SELECT xp_total FROM user_gamification WHERE user_id =",
    )
  ) {
    const row = state.userGamification.get(bound[0] as string);
    return row ? ({ xp_total: row.xp_total } as T) : null;
  }
  if (
    normalized.startsWith("SELECT COALESCE(SUM(amount), 0) AS total FROM xp_ledger")
  ) {
    const [userId, start, end] = bound as [string, string, string];
    const total = state.xpLedger
      .filter(
        (e) =>
          e.user_id === userId &&
          e.idempotency_key.startsWith("review:") &&
          e.created_at >= start &&
          e.created_at <= end,
      )
      .reduce((sum, e) => sum + e.amount, 0);
    return { total } as T;
  }
  if (
    normalized.startsWith("SELECT COUNT(*) AS cnt FROM review_logs rl") &&
    normalized.includes("INNER JOIN decks d")
  ) {
    const userId = bound[0] as string;
    const cnt = state.reviewLogs.filter((rl) => {
      const card = state.cards.get(rl.card_id);
      if (!card) return false;
      const deck = state.decks.get(card.deck_id);
      return deck?.user_id === userId;
    }).length;
    return { cnt } as T;
  }
  if (
    normalized.startsWith("SELECT COUNT(*) AS cnt FROM cards c") &&
    normalized.includes("INNER JOIN decks d") &&
    normalized.includes("COUNT(DISTINCT c.type)")
  ) {
    const userId = bound[0] as string;
    const types = new Set(
      userCardsForUser(state, userId)
        .filter((c) => c.status === "accepted")
        .map((c) => c.type),
    );
    return { cnt: types.size } as T;
  }
  if (
    normalized.startsWith("SELECT COUNT(*) AS cnt FROM cards c") &&
    normalized.includes("INNER JOIN card_schedules s") &&
    normalized.includes("c.status = 'accepted'")
  ) {
    const [userId, nowIso] = bound as [string, string];
    const cnt = userCardsForUser(state, userId).filter((c) => {
      if (c.status !== "accepted") return false;
      const schedule = state.schedules.get(c.id);
      return schedule != null && schedule.due <= nowIso;
    }).length;
    return { cnt } as T;
  }
  if (
    normalized.startsWith("SELECT COUNT(*) AS cnt FROM cards c") &&
    normalized.includes("INNER JOIN decks d") &&
    normalized.includes("c.status = 'accepted'") &&
    !normalized.includes("INNER JOIN card_schedules")
  ) {
    const userId = bound[0] as string;
    const cnt = userCardsForUser(state, userId).filter(
      (c) => c.status === "accepted",
    ).length;
    return { cnt } as T;
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
      }));
    return { results: rows as T[] };
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
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 50);
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
      });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
  if (
    normalized.startsWith(
      "UPDATE user_gamification SET streak_current = ?, streak_best = ?, streak_day = ?",
    )
  ) {
    const [streakCurrent, streakBest, streakDay, updatedAt, userId] = bound as [
      number,
      number,
      string,
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
    normalized.startsWith("UPDATE user_gamification SET") &&
    (normalized.includes("board_opt_in =") ||
      normalized.includes("display_name ="))
  ) {
    // Dynamic settings UPDATE: SET cols..., updated_at = ? WHERE user_id = ?
    const userId = bound[bound.length - 1] as string;
    const row = state.userGamification.get(userId);
    if (!row) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    const next = { ...row };
    let i = 0;
    const setClause = normalized.slice(
      "UPDATE user_gamification SET ".length,
      normalized.indexOf(" WHERE "),
    );
    for (const part of setClause.split(", ")) {
      const col = part.split(" = ")[0]?.trim();
      if (col === "board_opt_in") next.board_opt_in = bound[i++] as number;
      else if (col === "display_name")
        next.display_name = bound[i++] as string | null;
      else if (col === "updated_at") next.updated_at = bound[i++] as string;
    }
    state.userGamification.set(userId, next);
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
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized.startsWith("INSERT OR IGNORE INTO achievement_completions")) {
    const [userId, achievementId, completedAt, triggerEventId] = bound as [
      string,
      string,
      string,
      string | null,
    ];
    const key = completionKey(userId, achievementId);
    if (state.achievementCompletions.has(key)) {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.achievementCompletions.set(key, {
      user_id: userId,
      achievement_id: achievementId,
      completed_at: completedAt,
      trigger_event_id: triggerEventId,
      backdated: 0,
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
    cards,
    decks,
    schedules,
    reviewLogs,
  };
}
