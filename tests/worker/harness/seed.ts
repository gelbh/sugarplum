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

async function upsertRow(
  db: D1Database,
  table: string,
  conflict: string | readonly string[],
  columns: readonly string[],
  values: unknown[],
): Promise<void> {
  const conflictCols = (
    Array.isArray(conflict) ? conflict : [conflict]
  ) as string[];
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns
    .filter((c) => !conflictCols.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(${conflictCols.join(", ")}) DO UPDATE SET ${updates}`;
  await db
    .prepare(sql)
    .bind(...(values as Parameters<D1PreparedStatement["bind"]>))
    .run();
}

export async function seedUser(env: Bindings, row: UserRow): Promise<void> {
  await upsertRow(
    env.DB,
    "users",
    "id",
    [
      "id",
      "email",
      "password_hash",
      "oauth_subject",
      "created_at",
      "disabled_at",
      "sandbox_of",
    ],
    [
      row.id,
      row.email,
      row.password_hash,
      row.oauth_subject,
      row.created_at,
      row.disabled_at ?? null,
      row.sandbox_of ?? null,
    ],
  );
}

export async function seedSubject(
  env: Bindings,
  row: SubjectRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "subjects",
    "id",
    ["id", "user_id", "title", "created_at"],
    [row.id, row.user_id, row.title, row.created_at],
  );
}

export async function seedDeck(env: Bindings, row: DeckRow): Promise<void> {
  await upsertRow(
    env.DB,
    "decks",
    "id",
    ["id", "user_id", "title", "subject_hint", "subject_id", "created_at"],
    [
      row.id,
      row.user_id,
      row.title,
      row.subject_hint,
      row.subject_id ?? null,
      row.created_at,
    ],
  );
}

export async function seedMaterial(
  env: Bindings,
  row: MaterialRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "materials",
    "id",
    [
      "id",
      "deck_id",
      "kind",
      "r2_key",
      "filename",
      "page_count",
      "status",
      "created_at",
      "content_hash",
      "source_role",
    ],
    [
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
    ],
  );
}

export async function seedAtlas(env: Bindings, row: AtlasRow): Promise<void> {
  await upsertRow(
    env.DB,
    "atlases",
    "id",
    ["id", "user_id", "template_key", "created_at", "focus_pack_fingerprint"],
    [
      row.id,
      row.user_id,
      row.template_key,
      row.created_at,
      row.focus_pack_fingerprint ?? null,
    ],
  );
}

export async function seedAtlasMaterial(
  env: Bindings,
  row: AtlasMaterialRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "atlas_materials",
    "id",
    [
      "id",
      "atlas_id",
      "kind",
      "r2_key",
      "filename",
      "page_count",
      "status",
      "created_at",
      "content_hash",
      "source_role",
    ],
    [
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
    ],
  );
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

/** user-a + deck-a + sess-a. Shared by cards move/delete/archive suites. */
export async function seedSessionOwner(env: Bindings): Promise<void> {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bio",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
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
  await upsertRow(
    env.DB,
    "user_secrets",
    "user_id",
    ["user_id", "provider", "ciphertext", "model", "created_at", "updated_at"],
    [
      row.user_id,
      row.provider,
      row.ciphertext,
      row.model ?? null,
      row.created_at,
      row.updated_at,
    ],
  );
}

export async function seedUserStudyPrefs(
  env: Bindings,
  row: UserStudyPrefsRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "user_study_prefs",
    "user_id",
    [
      "user_id",
      "intro_budget",
      "review_budget",
      "r_floor",
      "desired_retention",
      "enable_fuzz",
      "enable_load_balance",
      "easy_days_json",
      "fsrs_w_json",
      "fsrs_last_optimized_at",
      "fsrs_optimize_pending",
      "updated_at",
    ],
    [
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
    ],
  );
}

export async function seedUserStudyDay(
  env: Bindings,
  row: UserStudyDayRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "user_study_day",
    ["user_id", "day"],
    ["user_id", "day", "intros_used"],
    [row.user_id, row.day, row.intros_used],
  );
}

export async function seedCard(env: Bindings, row: CardRow): Promise<void> {
  await upsertRow(
    env.DB,
    "cards",
    "id",
    [
      "id",
      "deck_id",
      "job_id",
      "type",
      "front_json",
      "back_json",
      "media_r2_keys_json",
      "provenance_json",
      "status",
      "reject_reason",
      "created_at",
      "updated_at",
      "claim_id",
      "content_fp",
    ],
    [
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
    ],
  );
}

export async function seedStudyClaim(
  env: Bindings,
  row: StudyClaimRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "study_claims",
    "id",
    [
      "id",
      "job_id",
      "deck_id",
      "subject",
      "predicate",
      "source_span",
      "object",
      "qualifiers_json",
      "pages_json",
      "created_at",
    ],
    [
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
    ],
  );
}

export async function seedCardRegenOp(
  env: Bindings,
  row: CardRegenOpRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "card_regen_ops",
    "id",
    [
      "id",
      "card_id",
      "user_id",
      "regen_type",
      "status",
      "error",
      "created_at",
      "finished_at",
    ],
    [
      row.id,
      row.card_id,
      row.user_id,
      row.regen_type,
      row.status,
      row.error,
      row.created_at,
      row.finished_at,
    ],
  );
}

export async function seedGenerationJob(
  env: Bindings,
  row: GenerationJobRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "generation_jobs",
    "id",
    [
      "id",
      "material_id",
      "status",
      "error",
      "coverage_json",
      "progress_json",
      "created_at",
      "finished_at",
      "figure_extract_mode",
      "topic_hints_json",
      "avoid_patterns_json",
      "run_topic_hints_json",
      "atlas_provenance_json",
    ],
    [
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
    ],
  );
}

export async function seedUsageEvent(
  env: Bindings,
  row: UsageEventRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "usage_events",
    "id",
    [
      "id",
      "user_id",
      "job_id",
      "kind",
      "path",
      "provider",
      "tokens_prompt",
      "tokens_completion",
      "tokens_total",
      "created_at",
    ],
    [
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
    ],
  );
}

export async function seedExportJob(
  env: Bindings,
  row: ExportJobRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "export_jobs",
    "id",
    [
      "id",
      "user_id",
      "status",
      "request_json",
      "r2_key",
      "error",
      "warning_json",
      "created_at",
      "updated_at",
      "expires_at",
    ],
    [
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
    ],
  );
}

export async function seedSchedule(
  env: Bindings,
  row: ScheduleRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "card_schedules",
    "card_id",
    [
      "card_id",
      "due",
      "stability",
      "difficulty",
      "elapsed_days",
      "scheduled_days",
      "learning_steps",
      "reps",
      "lapses",
      "state",
      "last_review",
      "stability_fast",
    ],
    [
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
    ],
  );
}

export async function seedReviewLog(
  env: Bindings,
  row: ReviewLogRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "review_logs",
    "id",
    [
      "id",
      "card_id",
      "rating",
      "scheduled_days",
      "elapsed_days",
      "reviewed_at",
      "state_json",
    ],
    [
      row.id,
      row.card_id,
      row.rating,
      row.scheduled_days,
      row.elapsed_days,
      row.reviewed_at,
      row.state_json,
    ],
  );
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
  await upsertRow(
    env.DB,
    "achievement_defs",
    "id",
    [
      "id",
      "category",
      "fruit_type",
      "rarity",
      "trigger_kind",
      "threshold",
      "params_json",
      "title",
      "description",
      "sort_order",
      "active",
      "catalog_version",
    ],
    [
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
    ],
  );
}

export async function seedUserGamification(
  env: Bindings,
  row: UserGamificationRow,
): Promise<void> {
  await upsertRow(
    env.DB,
    "user_gamification",
    "user_id",
    [
      "user_id",
      "streak_current",
      "streak_best",
      "streak_day",
      "xp_total",
      "level",
      "display_name",
      "board_opt_in",
      "updated_at",
      "clear_due_days",
      "clear_due_last_day",
      "catalog_version",
      "streak_freezes",
      "daily_goal_reviews",
      "daily_goal_day",
    ],
    [
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
    ],
  );
}
