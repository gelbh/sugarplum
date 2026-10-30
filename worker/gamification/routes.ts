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
import {
  compositeParts,
  countReviewsTotal,
  readStreakCurrent,
  type TriggerKind,
} from "./evaluate";
import { traitsForAchievement } from "./traits";
import { ensureUserGamification } from "./xp";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type UserGamificationRow = {
  streak_current: number;
  streak_best: number;
  streak_day: string | null;
  xp_total: number;
  level: number;
  display_name: string | null;
  board_opt_in: number;
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

type LeaderboardRow = {
  user_id: string;
  display_name: string | null;
  xp: number;
};

export type GamificationResponse = {
  streakCurrent: number;
  streakBest: number;
  streakDay: string | null;
  xpTotal: number;
  level: number;
  displayName: string | null;
  boardOptIn: boolean;
};

export type LeaderboardResponse = {
  weekKey: string;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
};

/** ISO week key YYYY-Www and [start, end) UTC bounds for the week containing `d`. */
export function isoWeekWindow(d = new Date()): {
  weekKey: string;
  startIso: string;
  endIso: string;
} {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const startIso = date.toISOString();

  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 7);
  const endIso = end.toISOString();

  const thursday = new Date(date);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
  return { weekKey, startIso, endIso };
}

function toGamificationResponse(row: UserGamificationRow): GamificationResponse {
  return {
    streakCurrent: row.streak_current,
    streakBest: row.streak_best,
    streakDay: row.streak_day,
    xpTotal: row.xp_total,
    level: row.level,
    displayName: row.display_name,
    boardOptIn: row.board_opt_in === 1,
  };
}

async function loadGamification(
  db: D1Database,
  userId: string,
): Promise<UserGamificationRow> {
  await ensureUserGamification(db, userId);
  const row = await db
    .prepare(
      `SELECT streak_current, streak_best, streak_day, xp_total, level,
              display_name, board_opt_in
       FROM user_gamification WHERE user_id = ?`,
    )
    .bind(userId)
    .first<UserGamificationRow>();
  if (!row) {
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

gamificationRoutes.get("/achievements", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  await ensureUserGamification(db, userId);

  try {
    await backfillUser(db, userId);
  } catch (err) {
    console.error("gamification backfill failed", err);
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
    ? {
        streakBest: (await readStreakCurrent(db, userId)).streakBest,
        reviewsTotal: await countReviewsTotal(db, userId),
      }
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

gamificationRoutes.get("/gamification", async (c) => {
  const userId = await requireUser(c);
  const row = await loadGamification(getDb(c.env), userId);
  return c.json(toGamificationResponse(row) satisfies GamificationResponse);
});

gamificationRoutes.get("/leaderboard/weekly", async (c) => {
  await requireUser(c);
  const db = getDb(c.env);
  const { weekKey, startIso, endIso } = isoWeekWindow();

  const { results } = await db
    .prepare(
      `SELECT ug.user_id, ug.display_name, COALESCE(SUM(xl.amount), 0) AS xp
       FROM user_gamification ug
       INNER JOIN xp_ledger xl ON xl.user_id = ug.user_id
       WHERE ug.board_opt_in = 1
         AND xl.created_at >= ?
         AND xl.created_at < ?
       GROUP BY ug.user_id, ug.display_name
       ORDER BY xp DESC
       LIMIT 50`,
    )
    .bind(startIso, endIso)
    .all<LeaderboardRow>();

  const entries = (results ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    xp: Number(row.xp) || 0,
  }));

  return c.json({ weekKey, entries } satisfies LeaderboardResponse);
});

gamificationRoutes.patch("/gamification/settings", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  await ensureUserGamification(db, userId);

  let body: { boardOptIn?: unknown; displayName?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const hasBoard = "boardOptIn" in body;
  const hasName = "displayName" in body;
  if (!hasBoard && !hasName) {
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

  const now = new Date().toISOString();
  if (hasBoard && hasName) {
    await db
      .prepare(
        `UPDATE user_gamification
         SET board_opt_in = ?, display_name = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(boardOptIn, displayName, now, userId)
      .run();
  } else if (hasBoard) {
    await db
      .prepare(
        `UPDATE user_gamification
         SET board_opt_in = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(boardOptIn, now, userId)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE user_gamification
         SET display_name = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(displayName, now, userId)
      .run();
  }

  const row = await loadGamification(db, userId);
  return c.json(toGamificationResponse(row) satisfies GamificationResponse);
});
