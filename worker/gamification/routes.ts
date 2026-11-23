import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { FruitType } from "../../src/achievements/catalog";
import type {
  AchievementItem,
  AchievementProgress,
} from "../../src/achievements/wire";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { backfillUser } from "./backfill";
import type { Rarity } from "./constants";
import { DAILY_GOAL_REVIEWS, utcDay } from "./constants";
import {
  clampDailyGoalReviews,
  getDailyGoalProgress,
} from "./dailyGoal";
import {
  compositeParts,
  loadCompositeMetrics,
  type TriggerKind,
} from "./evaluate";
import { reconcileStreakWithFreeze } from "./streak";
import { traitsForAchievement } from "./traits";
import {
  buildLeaderboard,
  isoWeekWindow,
  type LeaderboardResponse,
} from "./weeklyBoard";
import { ensureUserGamification } from "./xp";

export { isoWeekWindow, type LeaderboardResponse };

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type UserGamificationRow = {
  streak_current: number;
  streak_best: number;
  streak_day: string | null;
  xp_total: number;
  level: number;
  display_name: string | null;
  board_opt_in: number;
  streak_freezes: number;
  daily_goal_reviews: number;
};

type AchievementListRow = {
  id: string;
  category: string;
  fruit_type: FruitType;
  rarity: Rarity;
  title: string;
  description: string;
  sort_order: number;
  trigger_kind: TriggerKind;
  params_json: string | null;
  progress_current: number | null;
  progress_threshold: number | null;
  def_threshold: number | null;
  completed_at: string | null;
};

export type GamificationResponse = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  streakFreezes: number;
  streakDayMet: boolean;
  dailyGoalReviews: number;
  dailyGoalProgress: number;
  dailyGoalMet: boolean;
  xpToday: number;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

async function xpTodayForUser(db: D1Database, userId: string, day: string) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS xp
       FROM xp_ledger
       WHERE user_id = ?
         AND created_at >= ?
         AND created_at <= ?`,
    )
    .bind(userId, `${day}T00:00:00.000Z`, `${day}T23:59:59.999Z`)
    .first<{ xp: number }>();
  return Number(row?.xp ?? 0);
}

async function toGamificationResponse(
  db: D1Database,
  userId: string,
  row: UserGamificationRow,
): Promise<GamificationResponse> {
  const day = utcDay();
  const goal = await getDailyGoalProgress(db, userId, day);
  return {
    streakCurrent: row.streak_current,
    streakBest: row.streak_best,
    streakDay: row.streak_day,
    streakFreezes: row.streak_freezes ?? 0,
    streakDayMet: row.streak_day === day,
    dailyGoalReviews: goal.goal,
    dailyGoalProgress: goal.current,
    dailyGoalMet: goal.met,
    xpToday: await xpTodayForUser(db, userId, day),
    xpTotal: row.xp_total,
    level: row.level,
    displayName: row.display_name,
    boardOptIn: row.board_opt_in === 1,
  };
}

async function loadGamification(
  db: D1Database,
  userId: string,
  opts?: { readOnly?: boolean },
): Promise<UserGamificationRow> {
  if (!opts?.readOnly) {
    await ensureUserGamification(db, userId);
    await reconcileStreakWithFreeze(db, userId);
  }
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day, xp_total, level,
              display_name, board_opt_in,
              COALESCE(streak_freezes, 0) AS streak_freezes,
              COALESCE(daily_goal_reviews, ?) AS daily_goal_reviews
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(DAILY_GOAL_REVIEWS.default, userId)
    .first<UserGamificationRow>();
  if (!row) {
    if (opts?.readOnly) {
      return {
        streak_current: 0,
        streak_best: 0,
        streak_day: null,
        xp_total: 0,
        level: 1,
        display_name: null,
        board_opt_in: 0,
        streak_freezes: 0,
        daily_goal_reviews: DAILY_GOAL_REVIEWS.default,
      };
    }
    throw new HTTPException(500, { message: "Gamification row missing" });
  }
  return row;
}

function progressFor(
  row: AchievementListRow,
  partMetrics: { streakBest: number; reviewsTotal: number } | null,
): AchievementProgress {
  if (
    row.trigger_kind === "composite" &&
    row.completed_at == null &&
    partMetrics
  ) {
    return {
      kind: "composite",
      parts: compositeParts(row.params_json, partMetrics),
    };
  }
  const threshold = row.progress_threshold ?? row.def_threshold;
  if (threshold == null) return null;
  return {
    kind: "count",
    currentValue: row.progress_current ?? 0,
    threshold,
  };
}

export const gamificationRoutes = new Hono<AppEnv>();

// view-as: allow
gamificationRoutes.get("/achievements", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const viewingAs = Boolean(c.get("viewingAs"));
  if (!viewingAs) {
    await ensureUserGamification(db, userId);
    try {
      await backfillUser(db, userId);
    } catch (err) {
      console.error("gamification backfill failed", err);
    }
  }

  const { results } = await db
    .prepare(
      `SELECT d.id, d.category, d.fruit_type, d.rarity, d.title, d.description,
              d.sort_order, d.trigger_kind, d.params_json,
              d.threshold AS def_threshold,
              p.current_value AS progress_current,
              p.threshold AS progress_threshold,
              c.completed_at
       FROM achievement_defs d
       LEFT JOIN achievement_progress p
         ON p.achievement_id = d.id AND p.user_id = ?
       LEFT JOIN achievement_completions c
         ON c.achievement_id = d.id AND c.user_id = ?
       WHERE d.active = 1
       ORDER BY d.sort_order ASC`,
    )
    .bind(userId, userId)
    .all<AchievementListRow>();

  const rows = results ?? [];
  const needsParts = rows.some(
    (r) => r.trigger_kind === "composite" && r.completed_at == null,
  );
  const partMetrics = needsParts
    ? await loadCompositeMetrics(db, userId)
    : null;

  const items: AchievementItem[] = rows.map((row) => ({
    def: {
      id: row.id,
      category: row.category,
      fruitType: row.fruit_type,
      rarity: row.rarity,
      title: row.title,
      description: row.description,
      sortOrder: row.sort_order,
    },
    progress: progressFor(row, partMetrics),
    completedAt: row.completed_at,
    traits: traitsForAchievement(row.id, row.rarity),
  }));

  return c.json({ items });
});

// view-as: allow
gamificationRoutes.get("/gamification", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const row = await loadGamification(db, userId, {
    readOnly: Boolean(c.get("viewingAs")),
  });
  return c.json(
    (await toGamificationResponse(db, userId, row)) satisfies GamificationResponse,
  );
});

// view-as: allow
gamificationRoutes.get("/leaderboard/weekly", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  return c.json(await buildLeaderboard(db, userId, "week"));
});

// view-as: allow
gamificationRoutes.get("/leaderboard/all-time", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  return c.json(await buildLeaderboard(db, userId, "all"));
});

// view-as: deny
gamificationRoutes.patch("/gamification/settings", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  await ensureUserGamification(db, userId);

  let body: {
    boardOptIn?: unknown;
    displayName?: unknown;
    dailyGoalReviews?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const hasBoard = "boardOptIn" in body;
  const hasName = "displayName" in body;
  const hasGoal = "dailyGoalReviews" in body;
  if (!hasBoard && !hasName && !hasGoal) {
    throw new HTTPException(400, { message: "No settings to update" });
  }

  let boardOptIn: number | undefined;
  if (hasBoard) {
    if (typeof body.boardOptIn !== "boolean") {
      throw new HTTPException(400, { message: "boardOptIn must be boolean" });
    }
    boardOptIn = body.boardOptIn ? 1 : 0;
  }

  let displayName: string | null | undefined;
  if (hasName) {
    if (body.displayName !== null && typeof body.displayName !== "string") {
      throw new HTTPException(400, {
        message: "displayName must be string or null",
      });
    }
    displayName =
      body.displayName === null
        ? null
        : body.displayName.trim().slice(0, 32) || null;
  }

  let dailyGoalReviews: number | undefined;
  if (hasGoal) {
    if (
      typeof body.dailyGoalReviews !== "number" ||
      !Number.isFinite(body.dailyGoalReviews)
    ) {
      throw new HTTPException(400, {
        message: "dailyGoalReviews must be a number",
      });
    }
    dailyGoalReviews = clampDailyGoalReviews(body.dailyGoalReviews);
  }

  const now = new Date().toISOString();
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (hasBoard) {
    sets.push("board_opt_in = ?");
    binds.push(boardOptIn);
  }
  if (hasName) {
    sets.push("display_name = ?");
    binds.push(displayName);
  }
  if (hasGoal) {
    sets.push("daily_goal_reviews = ?");
    binds.push(dailyGoalReviews);
  }
  sets.push("updated_at = ?");
  binds.push(now, userId);

  await db
    .prepare(
      `UPDATE user_gamification SET ${sets.join(", ")} WHERE user_id = ?`,
    )
    .bind(...binds)
    .run();

  const row = await loadGamification(db, userId);
  return c.json(
    (await toGamificationResponse(db, userId, row)) satisfies GamificationResponse,
  );
});
