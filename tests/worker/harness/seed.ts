import type { AchievementDefSeed } from "../gamification-seeds";
import {
  d1v,
  type AtlasMaterialRow,
  type AtlasRow,
  type Bindings,
  type CardRegenOpRow,
  type CardRow,
  type DeckRow,
  type ExportJobRow,
  type GenerationJobRow,
  type MaterialRow,
  type ReviewLogRow,
  type ScheduleRow,
  type SessionRecord,
  type StudyClaimRow,
  type SubjectRow,
  type UsageEventRow,
  type UserGamificationRow,
  type UserRow,
  type UserSecretRow,
  type UserStudyDayRow,
  type UserStudyPrefsRow,
} from "./types";

export async function seedUser(env: Bindings, row: UserRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, oauth_subject, created_at, disabled_at, sandbox_of)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       password_hash = excluded.password_hash,
       oauth_subject = excluded.oauth_subject,
       created_at = excluded.created_at,
       disabled_at = excluded.disabled_at,
       sandbox_of = excluded.sandbox_of`,
  )
    .bind(
      row.id,
      row.email,
      row.password_hash,
      row.oauth_subject,
      row.created_at,
      row.disabled_at ?? null,
      row.sandbox_of ?? null,
    )
    .run();
}

export async function seedSubject(
  env: Bindings,
  row: SubjectRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       title = excluded.title,
       created_at = excluded.created_at`,
  )
    .bind(row.id, row.user_id, row.title, row.created_at)
    .run();
}

export async function seedDeck(env: Bindings, row: DeckRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       title = excluded.title,
       subject_hint = excluded.subject_hint,
       subject_id = excluded.subject_id,
       created_at = excluded.created_at`,
  )
    .bind(
      row.id,
      row.user_id,
      row.title,
      row.subject_hint,
      row.subject_id ?? null,
      row.created_at,
    )
    .run();
}

export async function seedMaterial(
  env: Bindings,
  row: MaterialRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO materials
       (id, deck_id, kind, r2_key, filename, page_count, status, created_at, content_hash, source_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       deck_id = excluded.deck_id,
       kind = excluded.kind,
       r2_key = excluded.r2_key,
       filename = excluded.filename,
       page_count = excluded.page_count,
       status = excluded.status,
       created_at = excluded.created_at,
       content_hash = excluded.content_hash,
       source_role = excluded.source_role`,
  )
    .bind(
      row.id,
      row.deck_id,
      row.kind,
      row.r2_key,
      row.filename,
      row.page_count,
      row.status,
      row.created_at,
      row.content_hash ?? null,
      row.source_role ?? "lecture",
    )
    .run();
}

export async function seedAtlas(env: Bindings, row: AtlasRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO atlases (id, user_id, template_key, created_at, focus_pack_fingerprint)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       template_key = excluded.template_key,
       created_at = excluded.created_at,
       focus_pack_fingerprint = excluded.focus_pack_fingerprint`,
  )
    .bind(
      row.id,
      row.user_id,
      row.template_key,
      row.created_at,
      row.focus_pack_fingerprint ?? null,
    )
    .run();
}

export async function seedAtlasMaterial(
  env: Bindings,
  row: AtlasMaterialRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO atlas_materials
       (id, atlas_id, kind, r2_key, filename, page_count, status, created_at, content_hash, source_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       atlas_id = excluded.atlas_id,
       kind = excluded.kind,
       r2_key = excluded.r2_key,
       filename = excluded.filename,
       page_count = excluded.page_count,
       status = excluded.status,
       created_at = excluded.created_at,
       content_hash = excluded.content_hash,
       source_role = excluded.source_role`,
  )
    .bind(
      row.id,
      row.atlas_id,
      row.kind,
      row.r2_key,
      row.filename,
      row.page_count,
      row.status,
      row.created_at,
      row.content_hash,
      row.source_role,
    )
    .run();
}

export async function seedSession(
  env: Bindings,
  id: string,
  userId: string,
  ttlMs = 60_000,
): Promise<void> {
  const record: SessionRecord = {
    userId,
    expiresAt: Date.now() + ttlMs,
  };
  await env.SESSIONS.put(id, JSON.stringify(record), {
    expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000)),
  });
}

export async function seedSessionRecord(
  env: Bindings,
  id: string,
  record: SessionRecord,
): Promise<void> {
  const ttlMs = Math.max(0, record.expiresAt - Date.now());
  await env.SESSIONS.put(id, JSON.stringify(record), {
    expirationTtl: Math.max(60, Math.ceil(ttlMs / 1000) || 60),
  });
}

export async function seedUserSecret(
  env: Bindings,
  row: UserSecretRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_secrets (user_id, provider, ciphertext, model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       provider = excluded.provider,
       ciphertext = excluded.ciphertext,
       model = excluded.model,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      row.user_id,
      row.provider,
      row.ciphertext,
      row.model ?? null,
      row.created_at,
      row.updated_at,
    )
    .run();
}

export async function seedUserStudyPrefs(
  env: Bindings,
  row: UserStudyPrefsRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_study_prefs
       (user_id, intro_budget, review_budget, r_floor, desired_retention, enable_fuzz,
        enable_load_balance, easy_days_json, fsrs_w_json, fsrs_last_optimized_at,
        fsrs_optimize_pending, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       intro_budget = excluded.intro_budget,
       review_budget = excluded.review_budget,
       r_floor = excluded.r_floor,
       desired_retention = excluded.desired_retention,
       enable_fuzz = excluded.enable_fuzz,
       enable_load_balance = excluded.enable_load_balance,
       easy_days_json = excluded.easy_days_json,
       fsrs_w_json = excluded.fsrs_w_json,
       fsrs_last_optimized_at = excluded.fsrs_last_optimized_at,
       fsrs_optimize_pending = excluded.fsrs_optimize_pending,
       updated_at = excluded.updated_at`,
  )
    .bind(
      row.user_id,
      row.intro_budget,
      row.review_budget,
      row.r_floor,
      row.desired_retention,
      row.enable_fuzz,
      row.enable_load_balance ?? 1,
      row.easy_days_json ??
        '["normal","normal","normal","normal","normal","normal","normal"]',
      row.fsrs_w_json ?? null,
      row.fsrs_last_optimized_at ?? null,
      row.fsrs_optimize_pending ?? 0,
      row.updated_at,
    )
    .run();
}

export async function seedUserStudyDay(
  env: Bindings,
  row: UserStudyDayRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_study_day (user_id, day, intros_used) VALUES (?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET
       intros_used = excluded.intros_used`,
  )
    .bind(row.user_id, row.day, row.intros_used)
    .run();
}

export async function seedCard(env: Bindings, row: CardRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cards (
       id, deck_id, job_id, type, front_json, back_json,
       media_r2_keys_json, provenance_json, status, reject_reason,
       created_at, updated_at, claim_id, content_fp
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       deck_id = excluded.deck_id,
       job_id = excluded.job_id,
       type = excluded.type,
       front_json = excluded.front_json,
       back_json = excluded.back_json,
       media_r2_keys_json = excluded.media_r2_keys_json,
       provenance_json = excluded.provenance_json,
       status = excluded.status,
       reject_reason = excluded.reject_reason,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       claim_id = excluded.claim_id,
       content_fp = excluded.content_fp`,
  )
    .bind(
      row.id,
      row.deck_id,
      d1v(row.job_id),
      row.type,
      row.front_json,
      row.back_json,
      d1v(row.media_r2_keys_json),
      d1v(row.provenance_json),
      row.status,
      row.reject_reason ?? null,
      row.created_at,
      row.updated_at ?? row.created_at,
      row.claim_id ?? null,
      row.content_fp ?? null,
    )
    .run();
}

export async function seedStudyClaim(
  env: Bindings,
  row: StudyClaimRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO study_claims (
       id, job_id, deck_id, subject, predicate, source_span,
       object, qualifiers_json, pages_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       job_id = excluded.job_id,
       deck_id = excluded.deck_id,
       subject = excluded.subject,
       predicate = excluded.predicate,
       source_span = excluded.source_span,
       object = excluded.object,
       qualifiers_json = excluded.qualifiers_json,
       pages_json = excluded.pages_json,
       created_at = excluded.created_at`,
  )
    .bind(
      row.id,
      row.job_id,
      row.deck_id,
      row.subject,
      row.predicate,
      row.source_span,
      row.object,
      row.qualifiers_json,
      row.pages_json,
      row.created_at,
    )
    .run();
}

export async function seedCardRegenOp(
  env: Bindings,
  row: CardRegenOpRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO card_regen_ops
       (id, card_id, user_id, regen_type, status, error, created_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       card_id = excluded.card_id,
       user_id = excluded.user_id,
       regen_type = excluded.regen_type,
       status = excluded.status,
       error = excluded.error,
       created_at = excluded.created_at,
       finished_at = excluded.finished_at`,
  )
    .bind(
      row.id,
      row.card_id,
      row.user_id,
      row.regen_type,
      row.status,
      row.error,
      row.created_at,
      row.finished_at,
    )
    .run();
}

export async function seedGenerationJob(
  env: Bindings,
  row: GenerationJobRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO generation_jobs (
       id, material_id, status, error, coverage_json, progress_json,
       created_at, finished_at, figure_extract_mode, topic_hints_json,
       avoid_patterns_json, run_topic_hints_json, atlas_provenance_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       material_id = excluded.material_id,
       status = excluded.status,
       error = excluded.error,
       coverage_json = excluded.coverage_json,
       progress_json = excluded.progress_json,
       created_at = excluded.created_at,
       finished_at = excluded.finished_at,
       figure_extract_mode = excluded.figure_extract_mode,
       topic_hints_json = excluded.topic_hints_json,
       avoid_patterns_json = excluded.avoid_patterns_json,
       run_topic_hints_json = excluded.run_topic_hints_json,
       atlas_provenance_json = excluded.atlas_provenance_json`,
  )
    .bind(
      row.id,
      row.material_id,
      row.status,
      d1v(row.error),
      d1v(row.coverage_json),
      d1v(row.progress_json),
      row.created_at,
      d1v(row.finished_at),
      row.figure_extract_mode ?? "fast",
      row.topic_hints_json ?? null,
      row.avoid_patterns_json ?? null,
      row.run_topic_hints_json ?? null,
      row.atlas_provenance_json ?? null,
    )
    .run();
}

export async function seedUsageEvent(
  env: Bindings,
  row: UsageEventRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO usage_events (
       id, user_id, job_id, kind, path, provider,
       tokens_prompt, tokens_completion, tokens_total, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       job_id = excluded.job_id,
       kind = excluded.kind,
       path = excluded.path,
       provider = excluded.provider,
       tokens_prompt = excluded.tokens_prompt,
       tokens_completion = excluded.tokens_completion,
       tokens_total = excluded.tokens_total,
       created_at = excluded.created_at`,
  )
    .bind(
      row.id,
      row.user_id,
      row.job_id,
      row.kind,
      row.path,
      row.provider,
      row.tokens_prompt,
      row.tokens_completion,
      row.tokens_total,
      row.created_at,
    )
    .run();
}

export async function seedExportJob(
  env: Bindings,
  row: ExportJobRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO export_jobs
       (id, user_id, status, request_json, r2_key, error, warning_json,
        created_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       status = excluded.status,
       request_json = excluded.request_json,
       r2_key = excluded.r2_key,
       error = excluded.error,
       warning_json = excluded.warning_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       expires_at = excluded.expires_at`,
  )
    .bind(
      row.id,
      row.user_id,
      row.status,
      row.request_json,
      row.r2_key,
      row.error,
      row.warning_json,
      row.created_at,
      row.updated_at,
      row.expires_at,
    )
    .run();
}

export async function seedSchedule(
  env: Bindings,
  row: ScheduleRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO card_schedules (
       card_id, due, stability, difficulty, elapsed_days, scheduled_days,
       learning_steps, reps, lapses, state, last_review, stability_fast
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET
       due = excluded.due,
       stability = excluded.stability,
       difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days,
       learning_steps = excluded.learning_steps,
       reps = excluded.reps,
       lapses = excluded.lapses,
       state = excluded.state,
       last_review = excluded.last_review,
       stability_fast = excluded.stability_fast`,
  )
    .bind(
      row.card_id,
      row.due,
      row.stability,
      row.difficulty,
      row.elapsed_days,
      row.scheduled_days,
      row.learning_steps,
      row.reps,
      row.lapses,
      row.state,
      row.last_review,
      row.stability_fast ?? null,
    )
    .run();
}

export async function seedReviewLog(
  env: Bindings,
  row: ReviewLogRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO review_logs (
       id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       card_id = excluded.card_id,
       rating = excluded.rating,
       scheduled_days = excluded.scheduled_days,
       elapsed_days = excluded.elapsed_days,
       reviewed_at = excluded.reviewed_at,
       state_json = excluded.state_json`,
  )
    .bind(
      row.id,
      row.card_id,
      row.rating,
      row.scheduled_days,
      row.elapsed_days,
      row.reviewed_at,
      row.state_json,
    )
    .run();
}

export async function seedR2(
  env: Bindings,
  key: string,
  value: string,
): Promise<void> {
  await env.MATERIALS.put(key, value);
}

export async function seedAchievementDef(
  env: Bindings,
  row: AchievementDefSeed,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO achievement_defs (
       id, category, fruit_type, rarity, trigger_kind, threshold, params_json,
       title, description, sort_order, active, catalog_version
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       category = excluded.category,
       fruit_type = excluded.fruit_type,
       rarity = excluded.rarity,
       trigger_kind = excluded.trigger_kind,
       threshold = excluded.threshold,
       params_json = excluded.params_json,
       title = excluded.title,
       description = excluded.description,
       sort_order = excluded.sort_order,
       active = excluded.active,
       catalog_version = excluded.catalog_version`,
  )
    .bind(
      row.id,
      row.category,
      row.fruit_type,
      row.rarity,
      row.trigger_kind,
      row.threshold,
      row.params_json,
      row.title,
      row.description,
      row.sort_order,
      row.active,
      row.catalog_version,
    )
    .run();
}

export async function seedUserGamification(
  env: Bindings,
  row: UserGamificationRow,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_gamification (
       user_id, streak_current, streak_best, streak_day, xp_total, level,
       display_name, board_opt_in, updated_at, clear_due_days, clear_due_last_day,
       catalog_version, streak_freezes, daily_goal_reviews, daily_goal_day
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       streak_current = excluded.streak_current,
       streak_best = excluded.streak_best,
       streak_day = excluded.streak_day,
       xp_total = excluded.xp_total,
       level = excluded.level,
       display_name = excluded.display_name,
       board_opt_in = excluded.board_opt_in,
       updated_at = excluded.updated_at,
       clear_due_days = excluded.clear_due_days,
       clear_due_last_day = excluded.clear_due_last_day,
       catalog_version = excluded.catalog_version,
       streak_freezes = excluded.streak_freezes,
       daily_goal_reviews = excluded.daily_goal_reviews,
       daily_goal_day = excluded.daily_goal_day`,
  )
    .bind(
      row.user_id,
      row.streak_current,
      row.streak_best,
      row.streak_day,
      row.xp_total,
      row.level,
      row.display_name,
      row.board_opt_in,
      row.updated_at,
      row.clear_due_days,
      row.clear_due_last_day,
      row.catalog_version,
      row.streak_freezes,
      row.daily_goal_reviews,
      row.daily_goal_day,
    )
    .run();
}

