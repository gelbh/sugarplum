/** Global XP board: weekly or all-time rank, podium, around-you neighbors. */

export const BOARD_NEIGHBOR_RADIUS = 2;
/** Cap public list + in-memory rank scan (was LIMIT 50 on the old route). */
export const BOARD_ENTRIES_LIMIT = 50;
export const BOARD_RANK_SCAN_LIMIT = 500;

export type BoardPeriod = "week" | "all";

export type BoardNeighbor = {
  userId: string;
  displayName: string | null;
  xp: number;
  rank: number;
};

export type LeaderboardResponse = {
  period: BoardPeriod;
  /** ISO week key when period is week; null for all-time. */
  weekKey: string | null;
  entries: Array<{
    userId: string;
    displayName: string | null;
    xp: number;
  }>;
  me: {
    optedIn: boolean;
    rank: number | null;
    xp: number;
    neighbors: BoardNeighbor[];
    /** Prior ISO week XP; 0 when period is all-time. */
    xpLastWeek: number;
  };
};

type AggRow = {
  user_id: string;
  display_name: string | null;
  xp: number;
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

function sortBoardRows(rows: AggRow[]): AggRow[] {
  return [...rows].sort((a, b) => {
    if (b.xp !== a.xp) return b.xp - a.xp;
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0;
  });
}

export function rankBoardRows(rows: AggRow[]): BoardNeighbor[] {
  return sortBoardRows(rows.filter((r) => r.xp > 0)).map((row, i) => ({
    userId: row.user_id,
    displayName: row.display_name,
    xp: row.xp,
    rank: i + 1,
  }));
}

export function neighborsAround(
  ranked: BoardNeighbor[],
  viewerUserId: string,
  radius = BOARD_NEIGHBOR_RADIUS,
): { rank: number | null; neighbors: BoardNeighbor[] } {
  const idx = ranked.findIndex((r) => r.userId === viewerUserId);
  if (idx < 0) return { rank: null, neighbors: [] };
  const start = Math.max(0, idx - radius);
  const end = Math.min(ranked.length, idx + radius + 1);
  return { rank: ranked[idx]!.rank, neighbors: ranked.slice(start, end) };
}

async function sumXpInWindow(
  db: D1Database,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS xp
       FROM xp_ledger
       WHERE user_id = ? AND created_at >= ? AND created_at < ?`,
    )
    .bind(userId, startIso, endIso)
    .first<{ xp: number }>();
  return Number(row?.xp) || 0;
}

async function loadWeekAggregates(
  db: D1Database,
  startIso: string,
  endIso: string,
): Promise<AggRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ug.user_id, ug.display_name, COALESCE(SUM(xl.amount), 0) AS xp
       FROM user_gamification ug
       INNER JOIN users u ON u.id = ug.user_id
       INNER JOIN xp_ledger xl ON xl.user_id = ug.user_id
       WHERE ug.board_opt_in = 1
         AND u.sandbox_of IS NULL
         AND xl.created_at >= ?
         AND xl.created_at < ?
       GROUP BY ug.user_id, ug.display_name
       ORDER BY xp DESC, ug.user_id ASC
       LIMIT ?`,
    )
    .bind(startIso, endIso, BOARD_RANK_SCAN_LIMIT)
    .all<AggRow>();
  return results ?? [];
}

async function loadAllTimeAggregates(db: D1Database): Promise<AggRow[]> {
  // xp_total is the maintained lifetime sum from xp_ledger.
  const { results } = await db
    .prepare(
      `SELECT ug.user_id, ug.display_name, ug.xp_total AS xp
       FROM user_gamification ug
       INNER JOIN users u ON u.id = ug.user_id
       WHERE ug.board_opt_in = 1
         AND u.sandbox_of IS NULL
         AND ug.xp_total > 0
       ORDER BY ug.xp_total DESC, ug.user_id ASC
       LIMIT ?`,
    )
    .bind(BOARD_RANK_SCAN_LIMIT)
    .all<AggRow>();
  return results ?? [];
}

export async function buildLeaderboard(
  db: D1Database,
  viewerUserId: string,
  period: BoardPeriod,
  now = new Date(),
): Promise<LeaderboardResponse> {
  const optRow = await db
    .prepare(`SELECT board_opt_in, xp_total FROM user_gamification WHERE user_id = ?`)
    .bind(viewerUserId)
    .first<{ board_opt_in: number; xp_total: number }>();
  const optedIn = (optRow?.board_opt_in ?? 0) === 1;

  let weekKey: string | null = null;
  let rows: AggRow[] = [];
  let xp = 0;
  let xpLastWeek = 0;

  if (period === "week") {
    const window = isoWeekWindow(now);
    weekKey = window.weekKey;
    const lastWeekStart = new Date(now);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    const last = isoWeekWindow(lastWeekStart);
    const [weekRows, weekXp, priorXp] = await Promise.all([
      loadWeekAggregates(db, window.startIso, window.endIso),
      sumXpInWindow(db, viewerUserId, window.startIso, window.endIso),
      sumXpInWindow(db, viewerUserId, last.startIso, last.endIso),
    ]);
    rows = weekRows;
    xp = weekXp;
    xpLastWeek = priorXp;
  } else {
    rows = await loadAllTimeAggregates(db);
    xp = Number(optRow?.xp_total) || 0;
    if (!optRow) {
      const sum = await db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_ledger WHERE user_id = ?`,
        )
        .bind(viewerUserId)
        .first<{ xp: number }>();
      xp = Number(sum?.xp) || 0;
    }
  }

  const ranked = rankBoardRows(
    rows.map((r) => ({
      user_id: r.user_id,
      display_name: r.display_name,
      xp: Number(r.xp) || 0,
    })),
  );

  const entries = ranked.slice(0, BOARD_ENTRIES_LIMIT).map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    xp: r.xp,
  }));

  let rank: number | null = null;
  let neighbors: BoardNeighbor[] = [];
  if (optedIn) {
    const around = neighborsAround(ranked, viewerUserId);
    rank = around.rank;
    neighbors = around.neighbors;
  }

  return {
    period,
    weekKey,
    entries,
    me: { optedIn, rank, xp, neighbors, xpLastWeek },
  };
}
