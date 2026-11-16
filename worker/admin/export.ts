import type { Env } from "../env";
import type { AdminUserRow } from "./types";

export const EXPORT_MAX_CHARS = 8_000_000;

export const EXPORT_SUBJECTS_SQL =
  "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC";

export const EXPORT_DECKS_SQL = `
SELECT id, title, subject_id, subject_hint, created_at
FROM decks WHERE user_id = ? ORDER BY created_at ASC
`.replace(/\s+/g, " ");

export const EXPORT_MATERIALS_SQL = `
SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status, m.created_at
FROM materials m
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY m.created_at ASC
`.replace(/\s+/g, " ");

export const EXPORT_JOBS_SQL = `
SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json,
  j.created_at, j.finished_at
FROM generation_jobs j
INNER JOIN materials m ON m.id = j.material_id
INNER JOIN decks d ON d.id = m.deck_id
WHERE d.user_id = ?
ORDER BY j.created_at ASC
`.replace(/\s+/g, " ");

export const EXPORT_CARDS_SQL = `
SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
  c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at
FROM cards c
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
ORDER BY c.created_at ASC
`.replace(/\s+/g, " ");

export const EXPORT_SCHEDULES_SQL = `
SELECT s.card_id, s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
  s.learning_steps, s.reps, s.lapses, s.state, s.last_review
FROM card_schedules s
INNER JOIN cards c ON c.id = s.card_id
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
`.replace(/\s+/g, " ");

export const EXPORT_REVIEW_LOGS_SQL = `
SELECT rl.id, rl.card_id, rl.rating, rl.scheduled_days, rl.elapsed_days,
  rl.reviewed_at, rl.state_json
FROM review_logs rl
INNER JOIN cards c ON c.id = rl.card_id
INNER JOIN decks d ON d.id = c.deck_id
WHERE d.user_id = ?
ORDER BY rl.reviewed_at ASC
`.replace(/\s+/g, " ");

export const EXPORT_STUDY_PREFS_SQL =
  "SELECT intro_budget, review_budget, r_floor, updated_at FROM user_study_prefs WHERE user_id = ?";

export const EXPORT_STUDY_DAYS_SQL =
  "SELECT day, intros_used FROM user_study_day WHERE user_id = ? ORDER BY day ASC";

export const EXPORT_EXPORT_JOBS_SQL = `
SELECT id, status, request_json, r2_key, error, warning_json, created_at, updated_at, expires_at
FROM export_jobs WHERE user_id = ? ORDER BY created_at ASC
`.replace(/\s+/g, " ");

export function contentTypeForKind(kind: string): string | undefined {
  if (kind === "paste") return "text/plain; charset=utf-8";
  if (kind === "pdf") return "application/pdf";
  if (kind === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (kind === "image") return "image/png";
  return undefined;
}

export async function buildUserExportPayload(
  env: Env,
  db: D1Database,
  user: AdminUserRow,
): Promise<object> {
  const id = user.id;

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
    db.prepare(EXPORT_DECKS_SQL).bind(id).all<{
      id: string;
      title: string;
      subject_id: string | null;
      subject_hint: string | null;
      created_at: string;
    }>(),
    db.prepare(EXPORT_MATERIALS_SQL).bind(id).all<{
      id: string;
      deck_id: string;
      kind: string;
      r2_key: string | null;
      filename: string | null;
      page_count: number | null;
      status: string;
      created_at: string;
    }>(),
    db.prepare(EXPORT_JOBS_SQL).bind(id).all<{
      id: string;
      material_id: string;
      status: string;
      error: string | null;
      coverage_json: string | null;
      progress_json: string | null;
      created_at: string;
      finished_at: string | null;
    }>(),
    db.prepare(EXPORT_CARDS_SQL).bind(id).all<{
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
    db.prepare(EXPORT_SCHEDULES_SQL).bind(id).all<{
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
    db.prepare(EXPORT_REVIEW_LOGS_SQL).bind(id).all<{
      id: string;
      card_id: string;
      rating: number;
      scheduled_days: number;
      elapsed_days: number;
      reviewed_at: string;
      state_json: string;
    }>(),
    db.prepare(EXPORT_STUDY_PREFS_SQL).bind(id).first<{
      intro_budget: number;
      review_budget: number;
      r_floor: number;
      updated_at: string;
    }>(),
    db
      .prepare(EXPORT_STUDY_DAYS_SQL)
      .bind(id)
      .all<{ day: string; intros_used: number }>(),
    db.prepare(EXPORT_EXPORT_JOBS_SQL).bind(id).all<{
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
      const obj = await env.MATERIALS.get(row.r2_key);
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
      const meta = await env.MATERIALS.head(row.r2_key);
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

  return {
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
}
