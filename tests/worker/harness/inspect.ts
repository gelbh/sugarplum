import type {
  AchievementCompletionRow,
  AchievementProgressRow,
  AtlasMaterialRow,
  AtlasRow,
  Bindings,
  CardRegenOpRow,
  CardRow,
  DeckRow,
  ExportJobRow,
  FreeGenUsageRow,
  GenerationJobRow,
  MaterialRow,
  ReviewLogRow,
  ScheduleRow,
  StudyClaimRow,
  UsageEventRow,
  UserGamificationRow,
  UserRow,
  UserSecretRow,
  UserStudyPrefsRow,
  XpLedgerRow,
} from "./types";

export async function getR2(
  env: Bindings,
  key: string,
): Promise<string | ArrayBuffer | undefined> {
  const obj = await env.MATERIALS.get(key);
  if (!obj) return undefined;
  return obj.text();
}

export async function getR2Keys(env: Bindings): Promise<string[]> {
  const listed = await env.MATERIALS.list();
  return listed.objects.map((o) => o.key);
}

export async function getSchedules(env: Bindings): Promise<ScheduleRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT card_id, due, stability, difficulty, elapsed_days, scheduled_days,
            learning_steps, reps, lapses, state, last_review, stability_fast
     FROM card_schedules`,
  ).all<ScheduleRow>();
  return results ?? [];
}

export async function clearCache(env: Bindings): Promise<void> {
  const listed = await env.CACHE.list();
  await Promise.all(listed.keys.map((k) => env.CACHE.delete(k.name)));
}

/**
 * Shallow binding overrides for per-test knobs (admin emails, omit queues).
 * Prefer this over many vitest configs.
 */
export function withTestBindings(
  env: Bindings,
  opts?: {
    secretsWrapKey?: string | null;
    adminEmails?: string;
    anatomyViewerEmails?: string;
    exportQueue?: boolean;
    cardRegenQueue?: boolean;
  },
): Bindings {
  const next: Bindings = { ...env };
  if (opts?.secretsWrapKey !== undefined) {
    next.SECRETS_WRAP_KEY =
      opts.secretsWrapKey === null
        ? (undefined as unknown as string)
        : opts.secretsWrapKey;
  }
  if (opts?.adminEmails !== undefined) next.ADMIN_EMAILS = opts.adminEmails;
  if (opts?.anatomyViewerEmails !== undefined) {
    next.ANATOMY_VIEWER_EMAILS = opts.anatomyViewerEmails;
  }
  if (opts?.exportQueue === false) delete next.EXPORT_QUEUE;
  if (opts?.cardRegenQueue === false) delete next.CARD_REGEN_QUEUE;
  return next;
}

async function selectAll<T extends Record<string, unknown>>(
  env: Bindings,
  sql: string,
): Promise<T[]> {
  const { results } = await env.DB.prepare(sql).all<T>();
  return results ?? [];
}

export async function getUsers(env: Bindings): Promise<UserRow[]> {
  return selectAll(
    env,
    `SELECT id, email, password_hash, oauth_subject, created_at, disabled_at, sandbox_of
     FROM users`,
  );
}

export async function getDecks(env: Bindings): Promise<DeckRow[]> {
  return selectAll(
    env,
    `SELECT id, user_id, title, subject_hint, subject_id, created_at FROM decks`,
  );
}

export async function getMaterials(env: Bindings): Promise<MaterialRow[]> {
  return selectAll(
    env,
    `SELECT id, deck_id, kind, r2_key, filename, page_count, status, created_at,
            content_hash, source_role
     FROM materials`,
  );
}

export async function getAtlases(env: Bindings): Promise<AtlasRow[]> {
  return selectAll(
    env,
    `SELECT id, user_id, template_key, created_at, focus_pack_fingerprint FROM atlases`,
  );
}

export async function getAtlasMaterials(
  env: Bindings,
): Promise<AtlasMaterialRow[]> {
  return selectAll(
    env,
    `SELECT id, atlas_id, kind, r2_key, filename, page_count, status, created_at,
            content_hash, source_role
     FROM atlas_materials`,
  );
}

export async function getExportJobs(env: Bindings): Promise<ExportJobRow[]> {
  return selectAll(
    env,
    `SELECT id, user_id, status, request_json, r2_key, error, warning_json,
            created_at, updated_at, expires_at
     FROM export_jobs`,
  );
}

export async function getGenerationJobs(
  env: Bindings,
): Promise<GenerationJobRow[]> {
  return selectAll(
    env,
    `SELECT id, material_id, status, error, coverage_json, progress_json,
            created_at, finished_at, figure_extract_mode, topic_hints_json,
            avoid_patterns_json, run_topic_hints_json, atlas_provenance_json
     FROM generation_jobs`,
  );
}

export async function getUserSecrets(env: Bindings): Promise<UserSecretRow[]> {
  return selectAll(
    env,
    `SELECT user_id, provider, ciphertext, model, created_at, updated_at
     FROM user_secrets`,
  );
}

export async function getUserStudyPrefs(
  env: Bindings,
): Promise<UserStudyPrefsRow[]> {
  return selectAll(
    env,
    `SELECT user_id, intro_budget, review_budget, r_floor, desired_retention,
            enable_fuzz, enable_load_balance, easy_days_json, fsrs_w_json,
            fsrs_last_optimized_at, fsrs_optimize_pending, updated_at
     FROM user_study_prefs`,
  );
}

export async function getCards(env: Bindings): Promise<CardRow[]> {
  return selectAll(
    env,
    `SELECT id, deck_id, job_id, type, front_json, back_json, media_r2_keys_json,
            provenance_json, status, reject_reason, created_at, updated_at,
            claim_id, content_fp
     FROM cards`,
  );
}

export async function getStudyClaims(env: Bindings): Promise<StudyClaimRow[]> {
  return selectAll(
    env,
    `SELECT id, job_id, deck_id, subject, predicate, source_span, object,
            qualifiers_json, pages_json, created_at
     FROM study_claims`,
  );
}

export async function getCardRegenOps(
  env: Bindings,
): Promise<CardRegenOpRow[]> {
  return selectAll(
    env,
    `SELECT id, card_id, user_id, regen_type, status, error, created_at, finished_at
     FROM card_regen_ops`,
  );
}

export async function getReviewLogs(env: Bindings): Promise<ReviewLogRow[]> {
  return selectAll(
    env,
    `SELECT id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
     FROM review_logs`,
  );
}

export async function getUsageEvents(env: Bindings): Promise<UsageEventRow[]> {
  return selectAll(
    env,
    `SELECT id, user_id, job_id, kind, path, provider, tokens_prompt,
            tokens_completion, tokens_total, created_at
     FROM usage_events`,
  );
}

export async function getFreeGenUsageRows(
  env: Bindings,
): Promise<FreeGenUsageRow[]> {
  return selectAll(env, `SELECT user_id, day, used FROM free_gen_usage`);
}

export async function getAchievementCompletions(
  env: Bindings,
): Promise<AchievementCompletionRow[]> {
  return selectAll(
    env,
    `SELECT user_id, achievement_id, completed_at, trigger_event_id, backdated
     FROM achievement_completions`,
  );
}

export async function getXpLedger(env: Bindings): Promise<XpLedgerRow[]> {
  return selectAll(
    env,
    `SELECT id, user_id, amount, reason, idempotency_key, created_at FROM xp_ledger`,
  );
}

export async function getAchievementProgress(
  env: Bindings,
): Promise<AchievementProgressRow[]> {
  return selectAll(
    env,
    `SELECT user_id, achievement_id, current_value, threshold FROM achievement_progress`,
  );
}

export async function getUserGamification(
  env: Bindings,
  userId: string,
): Promise<UserGamificationRow | undefined> {
  const row = await env.DB.prepare(
    `SELECT user_id, streak_current, streak_best, streak_day, xp_total, level,
            display_name, board_opt_in, updated_at, clear_due_days, clear_due_last_day,
            catalog_version, streak_freezes, daily_goal_reviews, daily_goal_day
     FROM user_gamification WHERE user_id = ?`,
  )
    .bind(userId)
    .first<UserGamificationRow>();
  return row ?? undefined;
}

