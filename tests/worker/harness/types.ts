import type { Env } from "../../../worker/env";
import type { AchievementDefSeed } from "../gamification-seeds";

export const TEST_SECRETS_WRAP_KEY =
  "0123456789abcdef0123456789abcdef";

export type AtlasRow = {
  id: string;
  user_id: string;
  template_key: string;
  created_at: string;
  focus_pack_fingerprint?: string | null;
};

export type AtlasMaterialRow = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  content_hash: string | null;
  source_role: string;
};

export type CardRegenOpRow = {
  id: string;
  card_id: string;
  user_id: string;
  regen_type: string;
  status: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type UserGamificationRow = {
  user_id: string;
  streak_current: number;
  streak_best: number;
  streak_day: string | null;
  xp_total: number;
  level: number;
  display_name: string | null;
  board_opt_in: number;
  updated_at: string;
  clear_due_days: number;
  clear_due_last_day: string | null;
  catalog_version: number;
  streak_freezes: number;
  daily_goal_reviews: number;
  daily_goal_day: string | null;
};
export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  oauth_subject: string | null;
  created_at: string;
  disabled_at?: string | null;
  sandbox_of?: string | null;
};

export type SubjectRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  /** Nullable until backfill; omitted on legacy seedDeck calls → null. */
  subject_id?: string | null;
  created_at: string;
};

export type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  content_hash?: string | null;
  source_role?: string | null;
};

export type GenerationJobRow = {
  id: string;
  material_id: string;
  status: string;
  error: string | null;
  coverage_json: string | null;
  progress_json: string | null;
  created_at: string;
  finished_at: string | null;
  figure_extract_mode?: string;
  topic_hints_json?: string | null;
  avoid_patterns_json?: string | null;
  run_topic_hints_json?: string | null;
  atlas_provenance_json?: string | null;
};

export type UserSecretRow = {
  user_id: string;
  provider: string;
  ciphertext: string;
  model?: string | null;
  created_at: string;
  updated_at: string;
};

export type UserStudyPrefsRow = {
  user_id: string;
  intro_budget: number;
  review_budget: number;
  r_floor: number;
  desired_retention: number;
  enable_fuzz: number;
  enable_load_balance?: number;
  easy_days_json?: string | null;
  fsrs_w_json?: string | null;
  fsrs_last_optimized_at?: string | null;
  fsrs_optimize_pending?: number;
  updated_at: string;
};

export type UserStudyDayRow = {
  user_id: string;
  day: string;
  intros_used: number;
};

export type UsageEventRow = {
  id: string;
  user_id: string;
  job_id: string | null;
  kind: string;
  path: string | null;
  provider: string | null;
  tokens_prompt: number | null;
  tokens_completion: number | null;
  tokens_total: number | null;
  created_at: string;
};

export type CardRow = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: string;
  front_json: string;
  back_json: string;
  media_r2_keys_json: string | null;
  provenance_json: string | null;
  status: string;
  reject_reason?: string | null;
  created_at: string;
  updated_at: string;
  claim_id?: string | null;
  content_fp?: string | null;
};

export type StudyClaimRow = {
  id: string;
  job_id: string;
  deck_id: string;
  subject: string;
  predicate: string;
  source_span: string;
  object: string | null;
  qualifiers_json: string | null;
  pages_json: string | null;
  created_at: string;
};

export type ScheduleRow = {
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
  stability_fast?: number | null;
};

export type ReviewLogRow = {
  id: string;
  card_id: string;
  rating: number;
  scheduled_days: number;
  elapsed_days: number;
  reviewed_at: string;
  state_json: string;
};

export type SessionRecord = {
  userId: string;
  expiresAt: number;
  actorUserId?: string;
  impersonation?: {
    sourceUserId: string;
    sourceEmail: string;
    startedAt: number;
  };
};

export type ExportJobRow = {
  id: string;
  user_id: string;
  status: string;
  request_json: string;
  r2_key: string | null;
  error: string | null;
  warning_json: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type { AchievementDefSeed };

export type Bindings = Env;


export type FreeGenUsageRow = {
  user_id: string;
  day: string;
  used: number;
};

export type AchievementCompletionRow = {
  user_id: string;
  achievement_id: string;
  completed_at: string;
  trigger_event_id: string | null;
  backdated: number;
};

export type XpLedgerRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  idempotency_key: string;
  created_at: string;
};

export type AchievementProgressRow = {
  user_id: string;
  achievement_id: string;
  current_value: number;
  threshold: number;
};


/** D1 bind rejects undefined; coerce to null. */
export function d1v<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}
