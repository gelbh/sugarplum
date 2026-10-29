import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";
import { getDb } from "../db/client";
import { isAdminEmail, parseAdminEmails } from "./allowlist";
import { requireAdmin } from "./requireAdmin";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

const EXPORT_MAX_CHARS = 8_000_000;

const USER_EMAIL_SQL =
  "SELECT id, email, oauth_subject, created_at, disabled_at FROM users WHERE id = ?";

const WIPE_MATERIAL_KEYS_SQL = `
SELECT m.r2_key FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ? AND m.r2_key IS NOT NULL
`.replace(/\s+/g, " ");

const WIPE_CARD_MEDIA_SQL = `
SELECT c.media_r2_keys_json FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ? AND c.media_r2_keys_json IS NOT NULL
`.replace(/\s+/g, " ");

const WIPE_EXPORT_KEYS_SQL =
  "SELECT r2_key FROM export_jobs WHERE user_id = ? AND r2_key IS NOT NULL";

const EXPORT_SUBJECTS_SQL =
  "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC";

const EXPORT_DECKS_SQL = `
SELECT id, title, subject_id, subject_hint, created_at
FROM decks WHERE user_id = ? ORDER BY created_at ASC
`.replace(/\s+/g, " ");

const EXPORT_MATERIALS_SQL = `
SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status, m.created_at
FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY m.created_at ASC
`.replace(/\s+/g, " ");

const EXPORT_JOBS_SQL = `
SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json,
  j.created_at, j.finished_at
FROM generation_jobs j
INNER JOIN materials m ON m.id = j.material_id
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY j.created_at ASC
`.replace(/\s+/g, " ");

const EXPORT_CARDS_SQL = `
SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
  c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at
FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
ORDER BY c.created_at ASC
`.replace(/\s+/g, " ");

const EXPORT_SCHEDULES_SQL = `
SELECT s.card_id, s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
  s.learning_steps, s.reps, s.lapses, s.state, s.last_review
FROM card_schedules s
INNER JOIN cards c ON c.id = s.card_id
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
`.replace(/\s+/g, " ");

const EXPORT_REVIEW_LOGS_SQL = `
SELECT rl.id, rl.card_id, rl.rating, rl.scheduled_days, rl.elapsed_days,
  rl.reviewed_at, rl.state_json
FROM review_logs rl
INNER JOIN cards c ON c.id = rl.card_id
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
ORDER BY rl.reviewed_at ASC
`.replace(/\s+/g, " ");

const EXPORT_STUDY_PREFS_SQL =
  "SELECT intro_budget, review_budget, r_floor, updated_at FROM user_study_prefs WHERE user_id = ?";

const EXPORT_STUDY_DAYS_SQL =
  "SELECT day, intros_used FROM user_study_day WHERE user_id = ? ORDER BY day ASC";

const EXPORT_EXPORT_JOBS_SQL = `
SELECT id, status, request_json, r2_key, error, warning_json, created_at, updated_at, expires_at
FROM export_jobs WHERE user_id = ? ORDER BY created_at ASC
`.replace(/\s+/g, " ");

type AdminUserRow = {
  id: string;
  email: string;
  oauth_subject: string | null;
  created_at: string;
  disabled_at: string | null;
};

function contentTypeForKind(kind: string): string | undefined {
  if (kind === "paste") return "text/plain; charset=utf-8";
  if (kind === "pdf") return "application/pdf";
  if (kind === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (kind === "image") return "image/png";
  return undefined;
}

async function loadAdminUser(
  db: D1Database,
  id: string,
): Promise<AdminUserRow> {
  const row = await db.prepare(USER_EMAIL_SQL).bind(id).first<AdminUserRow>();
  if (!row) throw new HTTPException(404, { message: "User not found" });
  return row;
}

function refuseAllowlistedTarget(email: string, adminEmails: string | undefined) {
  const allow = parseAdminEmails(adminEmails);
  if (isAdminEmail(email, allow)) {
    throw new HTTPException(400, { message: "Cannot modify allowlisted admin" });
  }
}

async function collectUserR2Keys(db: D1Database, userId: string): Promise<string[]> {
  const keys = new Set<string>();
  const { results: materialKeys } = await db
    .prepare(WIPE_MATERIAL_KEYS_SQL)
    .bind(userId)
    .all<{ r2_key: string }>();
  for (const row of materialKeys ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  const { results: cardMedia } = await db
    .prepare(WIPE_CARD_MEDIA_SQL)
    .bind(userId)
    .all<{ media_r2_keys_json: string }>();
  for (const row of cardMedia ?? []) {
    try {
      const parsed = JSON.parse(row.media_r2_keys_json) as unknown;
      if (Array.isArray(parsed)) {
        for (const key of parsed) {
          if (typeof key === "string" && key) keys.add(key);
        }
      }
    } catch {
      /* ignore bad JSON */
    }
  }
  const { results: exportKeys } = await db
    .prepare(WIPE_EXPORT_KEYS_SQL)
    .bind(userId)
    .all<{ r2_key: string }>();
  for (const row of exportKeys ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  return [...keys];
}

export type AdminUserListItem = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
  deckCount: number;
  cardCount: number;
  jobCount: number;
};

export type AdminUserDetail = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  disabled_at: string | null;
  counts: { decks: number; cards: number; jobs: number; materials: number };
  recentJobs: { id: string; status: string; created_at: string }[];
  recentStudyDays: { day: string; intros_used: number }[];
};

export const adminRoutes = new Hono<AppEnv>();

const LIST_USERS_SQL = `
SELECT u.id, u.email, u.created_at, u.oauth_subject, u.disabled_at,
  (SELECT COUNT(*) FROM decks d WHERE d.user_id = u.id) AS deck_count,
  (SELECT COUNT(*) FROM cards c
     INNER JOIN decks d ON d.id = c.deck_id WHERE d.user_id = u.id) AS card_count,
  (SELECT COUNT(*) FROM generation_jobs j
     INNER JOIN materials m ON m.id = j.material_id
     INNER JOIN decks d ON d.id = m.deck_id WHERE d.user_id = u.id) AS job_count
FROM users u
WHERE (? = '' OR lower(u.email) LIKE '%' || lower(?) || '%')
ORDER BY u.created_at DESC
LIMIT ?
`.replace(/\s+/g, " ");

const USER_DETAIL_SQL = `
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

const RECENT_JOBS_SQL = `
SELECT j.id, j.status, j.created_at
FROM generation_jobs j
INNER JOIN materials m ON m.id = j.material_id
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY j.created_at DESC
LIMIT ?
`.replace(/\s+/g, " ");

const RECENT_STUDY_DAYS_SQL = `
SELECT day, intros_used
FROM user_study_day
WHERE user_id = ?
ORDER BY day DESC
LIMIT ?
`.replace(/\s+/g, " ");

function parseUserListLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 50;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, 100);
}

const CREATED_LAST_7D_MS = 7 * 864e5;

function createdLast7dCutoffIso(): string {
  return new Date(Date.now() - CREATED_LAST_7D_MS).toISOString();
}

adminRoutes.get("/overview", async (c) => {
  await requireAdmin(c);
  const cutoff = createdLast7dCutoffIso();
  const row = await getDb(c.env)
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM users) AS user_count,
        (SELECT COUNT(*) FROM users WHERE created_at >= ?) AS created_last_7d`,
    )
    .bind(cutoff)
    .first<{ user_count: number; created_last_7d: number }>();
  return c.json({
    userCount: row?.user_count ?? 0,
    createdLast7d: row?.created_last_7d ?? 0,
  });
});

adminRoutes.get("/users", async (c) => {
  await requireAdmin(c);
  const q = c.req.query("q") ?? "";
  const limit = parseUserListLimit(c.req.query("limit"));
  const { results } = await getDb(c.env)
    .prepare(LIST_USERS_SQL)
    .bind(q, q, limit)
    .all<{
      id: string;
      email: string;
      created_at: string;
      oauth_subject: string | null;
      disabled_at: string | null;
      deck_count: number;
      card_count: number;
      job_count: number;
    }>();

  const users: AdminUserListItem[] = (results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    disabled_at: row.disabled_at ?? null,
    deckCount: row.deck_count,
    cardCount: row.card_count,
    jobCount: row.job_count,
  }));
  return c.json({ users });
});

adminRoutes.get("/users/:id", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = await db.prepare(USER_DETAIL_SQL).bind(id).first<{
    id: string;
    email: string;
    created_at: string;
    oauth_subject: string | null;
    disabled_at: string | null;
    deck_count: number;
    card_count: number;
    job_count: number;
    material_count: number;
  }>();
  if (!row) throw new HTTPException(404, { message: "User not found" });

  const [{ results: jobRows }, { results: studyRows }] = await Promise.all([
    db
      .prepare(RECENT_JOBS_SQL)
      .bind(id, 20)
      .all<{ id: string; status: string; created_at: string }>(),
    db
      .prepare(RECENT_STUDY_DAYS_SQL)
      .bind(id, 14)
      .all<{ day: string; intros_used: number }>(),
  ]);

  const detail: AdminUserDetail = {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    disabled_at: row.disabled_at ?? null,
    counts: {
      decks: row.deck_count,
      cards: row.card_count,
      jobs: row.job_count,
      materials: row.material_count,
    },
    recentJobs: jobRows ?? [],
    recentStudyDays: studyRows ?? [],
  };
  return c.json(detail);
});

adminRoutes.post("/users/:id/disable", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseAllowlistedTarget(user.email, c.env.ADMIN_EMAILS);
  const disabledAt = new Date().toISOString();
  await db
    .prepare("UPDATE users SET disabled_at = ? WHERE id = ?")
    .bind(disabledAt, id)
    .run();
  return c.json({ id, disabled_at: disabledAt });
});

adminRoutes.post("/users/:id/enable", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  await loadAdminUser(db, id);
  await db
    .prepare("UPDATE users SET disabled_at = ? WHERE id = ?")
    .bind(null, id)
    .run();
  return c.json({ id, disabled_at: null });
});

adminRoutes.post("/users/:id/wipe", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const confirmEmail =
    body &&
    typeof body === "object" &&
    "confirmEmail" in body &&
    typeof (body as { confirmEmail: unknown }).confirmEmail === "string"
      ? (body as { confirmEmail: string }).confirmEmail
      : "";
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);
  refuseAllowlistedTarget(user.email, c.env.ADMIN_EMAILS);
  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new HTTPException(400, { message: "confirmEmail mismatch" });
  }
  const r2Keys = await collectUserR2Keys(db, id);
  await db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  for (const key of r2Keys) {
    try {
      await c.env.MATERIALS.delete(key);
    } catch {
      /* best-effort; user row already gone */
    }
  }
  return c.json({ ok: true });
});

adminRoutes.get("/users/:id/export", async (c) => {
  await requireAdmin(c);
  const id = c.req.param("id");
  const db = getDb(c.env);
  const user = await loadAdminUser(db, id);

  const [
    { results: subjectRows },
    { results: deckRows },
    { results: materialRows },
    { results: jobRows },
    { results: cardRows },
    { results: scheduleRows },
    { results: reviewLogRows },
    studyPrefs,
    { results: studyDayRows },
    { results: exportJobRows },
  ] = await Promise.all([
    db
      .prepare(EXPORT_SUBJECTS_SQL)
      .bind(id)
      .all<{ id: string; title: string; created_at: string }>(),
    db
      .prepare(EXPORT_DECKS_SQL)
      .bind(id)
      .all<{
        id: string;
        title: string;
        subject_id: string | null;
        subject_hint: string | null;
        created_at: string;
      }>(),
    db
      .prepare(EXPORT_MATERIALS_SQL)
      .bind(id)
      .all<{
        id: string;
        deck_id: string;
        kind: string;
        r2_key: string | null;
        filename: string | null;
        page_count: number | null;
        status: string;
        created_at: string;
      }>(),
    db
      .prepare(EXPORT_JOBS_SQL)
      .bind(id)
      .all<{
        id: string;
        material_id: string;
        status: string;
        error: string | null;
        coverage_json: string | null;
        progress_json: string | null;
        created_at: string;
        finished_at: string | null;
      }>(),
    db
      .prepare(EXPORT_CARDS_SQL)
      .bind(id)
      .all<{
        id: string;
        deck_id: string;
        job_id: string | null;
        type: string;
        front_json: string;
        back_json: string;
        media_r2_keys_json: string | null;
        provenance_json: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>(),
    db
      .prepare(EXPORT_SCHEDULES_SQL)
      .bind(id)
      .all<{
        card_id: string;
        due: string;
        stability: number;
        difficulty: number;
        elapsed_days: number;
        scheduled_days: number;
        learning_steps: number;
        reps: number;
        lapses: number;
        state: number;
        last_review: string | null;
      }>(),
    db
      .prepare(EXPORT_REVIEW_LOGS_SQL)
      .bind(id)
      .all<{
        id: string;
        card_id: string;
        rating: number;
        scheduled_days: number;
        elapsed_days: number;
        reviewed_at: string;
        state_json: string;
      }>(),
    db
      .prepare(EXPORT_STUDY_PREFS_SQL)
      .bind(id)
      .first<{
        intro_budget: number;
        review_budget: number;
        r_floor: number;
        updated_at: string;
      }>(),
    db
      .prepare(EXPORT_STUDY_DAYS_SQL)
      .bind(id)
      .all<{ day: string; intros_used: number }>(),
    db
      .prepare(EXPORT_EXPORT_JOBS_SQL)
      .bind(id)
      .all<{
        id: string;
        status: string;
        request_json: string;
        r2_key: string | null;
        error: string | null;
        warning_json: string | null;
        created_at: string;
        updated_at: string;
        expires_at: string;
      }>(),
  ]);

  const materials = [];
  for (const row of materialRows ?? []) {
    const contentType = contentTypeForKind(row.kind);
    if (row.kind === "paste" && row.r2_key) {
      const obj = await c.env.MATERIALS.get(row.r2_key);
      const text = obj ? await obj.text() : null;
      materials.push({
        id: row.id,
        deck_id: row.deck_id,
        kind: row.kind,
        r2_key: row.r2_key,
        filename: row.filename,
        page_count: row.page_count,
        status: row.status,
        created_at: row.created_at,
        contentType,
        text,
      });
      continue;
    }
    let size: number | undefined;
    if (row.r2_key) {
      const meta = await c.env.MATERIALS.head(row.r2_key);
      if (meta) size = meta.size;
    }
    materials.push({
      id: row.id,
      deck_id: row.deck_id,
      kind: row.kind,
      r2_key: row.r2_key,
      filename: row.filename,
      page_count: row.page_count,
      status: row.status,
      created_at: row.created_at,
      contentType,
      size,
    });
  }

  const payload = {
    user: {
      id: user.id,
      email: user.email,
      google_linked: user.oauth_subject != null,
      created_at: user.created_at,
      disabled_at: user.disabled_at ?? null,
    },
    subjects: subjectRows ?? [],
    decks: deckRows ?? [],
    materials,
    generationJobs: jobRows ?? [],
    cards: cardRows ?? [],
    schedules: scheduleRows ?? [],
    reviewLogs: reviewLogRows ?? [],
    studyPrefs: studyPrefs ?? null,
    studyDays: studyDayRows ?? [],
    exportJobs: (exportJobRows ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      request_json: row.request_json,
      r2_key: row.r2_key,
      error: row.error,
      warning_json: row.warning_json,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
    })),
  };

  const serialized = JSON.stringify(payload);
  if (serialized.length > EXPORT_MAX_CHARS) {
    throw new HTTPException(413, { message: "Export too large" });
  }

  return new Response(serialized, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="user-${id}-export.json"`,
    },
  });
});
