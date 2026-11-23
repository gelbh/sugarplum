import type { AdminUserListItem } from "./types";
import {
  type AdminListDir,
  type AdminListGoogleFilter,
  type AdminListSort,
  type AdminListStatusFilter,
  buildAdminListWhere,
} from "./queries";

type ListRow = {
  id: string;
  email: string;
  created_at: string;
  oauth_subject: string | null;
  disabled_at: string | null;
  deck_count: number;
  card_count: number;
  job_count: number;
  material_count: number;
  tokens_all_time: number;
  tokens_30d: number;
  free_jobs_30d: number;
  byo_jobs_30d: number;
  last_activity_at: string;
};

export type AdminListQueryOpts = {
  q: string;
  status: AdminListStatusFilter;
  google: AdminListGoogleFilter;
  sort: AdminListSort;
  dir: AdminListDir;
  limit: number;
  cutoff30: string;
};

function isCheapSort(sort: AdminListSort): boolean {
  return sort === "created_at" || sort === "email";
}

const CHEAP_SORT_SQL: Record<"created_at" | "email", string> = {
  created_at: "u.created_at",
  email: "lower(u.email)",
};

const EXPENSIVE_SORT_SQL: Record<
  "last_activity" | "tokens_30d" | "decks",
  string
> = {
  last_activity: "last_activity_at",
  tokens_30d: "tokens_30d",
  decks: "deck_count",
};

function mapListRows(rows: ListRow[]): AdminUserListItem[] {
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    disabled_at: row.disabled_at ?? null,
    decks: row.deck_count ?? 0,
    cards: row.card_count ?? 0,
    jobs: row.job_count ?? 0,
    materials: row.material_count ?? 0,
    tokensAllTime: row.tokens_all_time ?? 0,
    tokens30d: row.tokens_30d ?? 0,
    freeJobs30d: row.free_jobs_30d ?? 0,
    byoJobs30d: row.byo_jobs_30d ?? 0,
    last_activity_at: row.last_activity_at ?? row.created_at,
  }));
}

/** Batch aggregates for a page of user ids (no per-row correlated probes). */
function metricsSqlForIds(ids: string[], cutoff30: string): {
  sql: string;
  binds: (string | number)[];
} {
  const placeholders = ids.map(() => "?").join(", ");
  const sql = `
/* sugarplum:admin-list-metrics */
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at,
  COALESCE(dc.deck_count, 0) AS deck_count,
  COALESCE(cc.card_count, 0) AS card_count,
  COALESCE(jc.job_count, 0) AS job_count,
  COALESCE(mc.material_count, 0) AS material_count,
  COALESCE(ue.tokens_all_time, 0) AS tokens_all_time,
  COALESCE(ue.tokens_30d, 0) AS tokens_30d,
  COALESCE(ue.free_jobs_30d, 0) AS free_jobs_30d,
  COALESCE(ue.byo_jobs_30d, 0) AS byo_jobs_30d,
  (SELECT MAX(v) FROM (
     SELECT ue.last_usage_at AS v
     UNION ALL SELECT us.last_study_at
     UNION ALL SELECT u.created_at
   )) AS last_activity_at
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) AS deck_count FROM decks
  WHERE user_id IN (${placeholders}) GROUP BY user_id
) dc ON dc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS card_count
  FROM cards c INNER JOIN decks d ON d.id = c.deck_id
  WHERE d.user_id IN (${placeholders}) GROUP BY d.user_id
) cc ON cc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS job_count
  FROM generation_jobs j
  INNER JOIN materials m ON m.id = j.material_id
  INNER JOIN decks d ON d.id = m.deck_id
  WHERE d.user_id IN (${placeholders}) GROUP BY d.user_id
) jc ON jc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS material_count
  FROM materials m INNER JOIN decks d ON d.id = m.deck_id
  WHERE d.user_id IN (${placeholders}) GROUP BY d.user_id
) mc ON mc.user_id = u.id
LEFT JOIN (
  SELECT user_id,
    COALESCE(SUM(COALESCE(tokens_total, 0)), 0) AS tokens_all_time,
    COALESCE(SUM(CASE WHEN created_at >= ? THEN COALESCE(tokens_total, 0) ELSE 0 END), 0) AS tokens_30d,
    SUM(CASE WHEN created_at >= ? AND path = 'free' AND kind = 'generation' THEN 1 ELSE 0 END) AS free_jobs_30d,
    SUM(CASE WHEN created_at >= ? AND path = 'byo' AND kind = 'generation' THEN 1 ELSE 0 END) AS byo_jobs_30d,
    MAX(created_at) AS last_usage_at
  FROM usage_events
  WHERE user_id IN (${placeholders})
  GROUP BY user_id
) ue ON ue.user_id = u.id
LEFT JOIN (
  SELECT user_id, MAX(day || 'T23:59:59.999Z') AS last_study_at
  FROM user_study_day
  WHERE user_id IN (${placeholders})
  GROUP BY user_id
) us ON us.user_id = u.id
WHERE u.id IN (${placeholders})
`.replace(/\s+/g, " ");

  const binds: (string | number)[] = [
    ...ids,
    ...ids,
    ...ids,
    ...ids,
    cutoff30,
    cutoff30,
    cutoff30,
    ...ids,
    ...ids,
    ...ids,
  ];
  return { sql, binds };
}

function buildJoinListQuery(opts: AdminListQueryOpts): {
  sql: string;
  binds: (string | number)[];
} {
  const { whereSql, whereBinds } = buildAdminListWhere(opts);
  const orderCol = EXPENSIVE_SORT_SQL[opts.sort as keyof typeof EXPENSIVE_SORT_SQL];
  const dirSql = opts.dir === "asc" ? "ASC" : "DESC";
  const sql = `
/* sugarplum:admin-list-join */
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at,
  COALESCE(dc.deck_count, 0) AS deck_count,
  COALESCE(cc.card_count, 0) AS card_count,
  COALESCE(jc.job_count, 0) AS job_count,
  COALESCE(mc.material_count, 0) AS material_count,
  COALESCE(ue.tokens_all_time, 0) AS tokens_all_time,
  COALESCE(ue.tokens_30d, 0) AS tokens_30d,
  COALESCE(ue.free_jobs_30d, 0) AS free_jobs_30d,
  COALESCE(ue.byo_jobs_30d, 0) AS byo_jobs_30d,
  (SELECT MAX(v) FROM (
     SELECT ue.last_usage_at AS v
     UNION ALL SELECT us.last_study_at
     UNION ALL SELECT u.created_at
   )) AS last_activity_at
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) AS deck_count FROM decks GROUP BY user_id
) dc ON dc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS card_count
  FROM cards c INNER JOIN decks d ON d.id = c.deck_id
  GROUP BY d.user_id
) cc ON cc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS job_count
  FROM generation_jobs j
  INNER JOIN materials m ON m.id = j.material_id
  INNER JOIN decks d ON d.id = m.deck_id
  GROUP BY d.user_id
) jc ON jc.user_id = u.id
LEFT JOIN (
  SELECT d.user_id, COUNT(*) AS material_count
  FROM materials m INNER JOIN decks d ON d.id = m.deck_id
  GROUP BY d.user_id
) mc ON mc.user_id = u.id
LEFT JOIN (
  SELECT user_id,
    COALESCE(SUM(COALESCE(tokens_total, 0)), 0) AS tokens_all_time,
    COALESCE(SUM(CASE WHEN created_at >= ? THEN COALESCE(tokens_total, 0) ELSE 0 END), 0) AS tokens_30d,
    SUM(CASE WHEN created_at >= ? AND path = 'free' AND kind = 'generation' THEN 1 ELSE 0 END) AS free_jobs_30d,
    SUM(CASE WHEN created_at >= ? AND path = 'byo' AND kind = 'generation' THEN 1 ELSE 0 END) AS byo_jobs_30d,
    MAX(created_at) AS last_usage_at
  FROM usage_events
  GROUP BY user_id
) ue ON ue.user_id = u.id
LEFT JOIN (
  SELECT user_id, MAX(day || 'T23:59:59.999Z') AS last_study_at
  FROM user_study_day
  GROUP BY user_id
) us ON us.user_id = u.id
WHERE ${whereSql}
ORDER BY ${orderCol} ${dirSql}
LIMIT ?
`.replace(/\s+/g, " ");

  return {
    sql,
    binds: [opts.cutoff30, opts.cutoff30, opts.cutoff30, ...whereBinds, opts.limit],
  };
}

function buildLeanListQuery(opts: AdminListQueryOpts): {
  sql: string;
  binds: (string | number)[];
} {
  const { whereSql, whereBinds } = buildAdminListWhere(opts);
  const sortKey = opts.sort === "email" ? "email" : "created_at";
  const orderCol = CHEAP_SORT_SQL[sortKey];
  const dirSql = opts.dir === "asc" ? "ASC" : "DESC";
  const sql = `
/* sugarplum:admin-list-lean */
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at
FROM users u
WHERE ${whereSql}
ORDER BY ${orderCol} ${dirSql}
LIMIT ?
`.replace(/\s+/g, " ");
  return { sql, binds: [...whereBinds, opts.limit] };
}

/** Cheap sorts: lean+batch; expensive: JOIN then LIMIT (ponytail: full aggregate scan). */
export async function fetchAdminUserList(
  db: D1Database,
  opts: AdminListQueryOpts,
): Promise<AdminUserListItem[]> {
  if (isCheapSort(opts.sort)) {
    const lean = buildLeanListQuery(opts);
    const { results: leanRows } = await db
      .prepare(lean.sql)
      .bind(...lean.binds)
      .all<{
        id: string;
        email: string;
        created_at: string;
        oauth_subject: string | null;
        disabled_at: string | null;
      }>();
    const page = leanRows ?? [];
    if (page.length === 0) return [];

    const ids = page.map((r) => r.id);
    // D1 caps bound parameters (~100). metricsSqlForIds repeats ids 7× + 3 cutoffs.
    const METRICS_ID_CHUNK = 12;
    const metricRows: ListRow[] = [];
    for (let i = 0; i < ids.length; i += METRICS_ID_CHUNK) {
      const chunk = ids.slice(i, i + METRICS_ID_CHUNK);
      const metrics = metricsSqlForIds(chunk, opts.cutoff30);
      const { results } = await db
        .prepare(metrics.sql)
        .bind(...metrics.binds)
        .all<ListRow>();
      metricRows.push(...(results ?? []));
    }
    const byId = new Map(metricRows.map((r) => [r.id, r]));
    const ordered: ListRow[] = ids.map((id) => {
      const hit = byId.get(id);
      const leanRow = page.find((r) => r.id === id)!;
      if (hit) return hit;
      return {
        ...leanRow,
        deck_count: 0,
        card_count: 0,
        job_count: 0,
        material_count: 0,
        tokens_all_time: 0,
        tokens_30d: 0,
        free_jobs_30d: 0,
        byo_jobs_30d: 0,
        last_activity_at: leanRow.created_at,
      };
    });
    return mapListRows(ordered);
  }

  const join = buildJoinListQuery(opts);
  const { results } = await db
    .prepare(join.sql)
    .bind(...join.binds)
    .all<ListRow>();
  return mapListRows(results ?? []);
}
