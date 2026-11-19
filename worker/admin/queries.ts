export const LIST_USERS_SQL = `
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at
FROM users u
WHERE u.sandbox_of IS NULL
ORDER BY u.created_at DESC
LIMIT ?
`.replace(/\s+/g, " ");

/** Email substring search (leading wildcard; admin-only, expects full scan). */
export const LIST_USERS_SEARCH_SQL = `
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at
FROM users u
WHERE u.sandbox_of IS NULL
  AND lower(u.email) LIKE '%' || lower(?) || '%'
ORDER BY u.created_at DESC
LIMIT ?
`.replace(/\s+/g, " ");

export const USER_DETAIL_SQL = `
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at,
  (SELECT COUNT(*) FROM decks d WHERE d.user_id = u.id) AS deck_count,
  (SELECT COUNT(*) FROM cards c
     INNER JOIN decks d ON d.id = c.deck_id WHERE d.user_id = u.id) AS card_count,
  (SELECT COUNT(*) FROM generation_jobs j
     INNER JOIN materials m ON m.id = j.material_id
     INNER JOIN decks d ON d.id = m.deck_id WHERE d.user_id = u.id) AS job_count,
  (SELECT COUNT(*) FROM materials m
     INNER JOIN decks d ON d.id = m.deck_id WHERE d.user_id = u.id) AS material_count
FROM users u
WHERE u.id = ?
`.replace(/\s+/g, " ");

export const RECENT_JOBS_SQL = `
SELECT j.id, j.status, j.created_at, j.finished_at, j.progress_json
FROM generation_jobs j
INNER JOIN materials m ON m.id = j.material_id
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY j.created_at DESC
LIMIT ?
`.replace(/\s+/g, " ");

export const RECENT_STUDY_DAYS_SQL = `
SELECT day, intros_used
FROM user_study_day
WHERE user_id = ?
ORDER BY day DESC
LIMIT ?
`.replace(/\s+/g, " ");

export const SUBJECTS_SQL =
  "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at DESC LIMIT 50";

export const DECKS_SQL = `
SELECT id, title, subject_id, created_at FROM decks
WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
`.replace(/\s+/g, " ");

export const MATERIALS_SQL = `
SELECT m.id, m.deck_id, m.kind, m.filename, m.status, m.created_at
FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY m.created_at DESC
LIMIT 50
`.replace(/\s+/g, " ");

export const STUDY_PREFS_SQL =
  "SELECT intro_budget, review_budget, r_floor, updated_at FROM user_study_prefs WHERE user_id = ?";

export const CARD_SAMPLE_SQL = `
SELECT c.id, c.type, c.status, c.front_json
FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
ORDER BY c.created_at DESC
LIMIT 10
`.replace(/\s+/g, " ");

export const USER_USAGE_SQL = `
SELECT
  (SELECT COALESCE(SUM(COALESCE(tokens_total, 0)), 0) FROM usage_events WHERE user_id = ?) AS tokens_all_time,
  (SELECT COALESCE(SUM(COALESCE(tokens_total, 0)), 0) FROM usage_events
     WHERE user_id = ? AND created_at >= ?) AS tokens_30d,
  (SELECT COUNT(*) FROM usage_events
     WHERE user_id = ? AND created_at >= ? AND path = 'free'
       AND kind = 'generation') AS free_jobs_30d,
  (SELECT COUNT(*) FROM usage_events
     WHERE user_id = ? AND created_at >= ? AND path = 'byo'
       AND kind = 'generation') AS byo_jobs_30d
`.replace(/\s+/g, " ");

export function parseUserListLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 50;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 100);
}

export const CREATED_LAST_7D_MS = 7 * 864e5;
export const USAGE_30D_MS = 30 * 864e5;

export function createdLast7dCutoffIso(): string {
  return new Date(Date.now() - CREATED_LAST_7D_MS).toISOString();
}

export function usage30dCutoffIso(): string {
  return new Date(Date.now() - USAGE_30D_MS).toISOString();
}

export function frontPreviewFromJson(frontJson: string, max = 120): string {
  try {
    const parsed = JSON.parse(frontJson) as unknown;
    if (typeof parsed === "string") return parsed.slice(0, max);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as { prompt?: unknown; text?: unknown };
      if (typeof obj.prompt === "string") return obj.prompt.slice(0, max);
      if (typeof obj.text === "string") return obj.text.slice(0, max);
    }
  } catch {
    /* ignore */
  }
  return frontJson.slice(0, max);
}
