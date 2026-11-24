/**
 * Real-binding seed/inspect helpers for Workers Vitest (@cloudflare/vitest-plugin).
 * Column lists follow migrations/; do not invent fake SQL matchers.
 *
 * Queue inspect: cloudflare:test has no producer-send capture API, so
 * installQueueRecorders wraps GENERATE/CARD_REGEN/EXPORT send into in-memory arrays.
 *
 * Workflow inspect: same pattern via installWorkflowRecorders (create/get/terminate
 * recording). Prefer HTTP/app.request asserts when instance introspection is enough (§D).
 */
import { applyD1Migrations, reset } from "cloudflare:test";
import type { Env } from "../../worker/env";
import type { AchievementDefSeed } from "./gamification-seeds";

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
  /** Fake-harness-only; not a D1 column (paste body lives in R2). */
  body_text?: string | null;
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

/** D1 bind rejects undefined; coerce to null. */
function d1v<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

type WorkflowBinding = NonNullable<Env["GENERATION_WORKFLOW"]>;
type WorkflowInstanceRow = { status: string; output?: unknown; params?: unknown };

const generateQueueMessages: unknown[] = [];
const cardRegenQueueMessages: unknown[] = [];
const exportQueueMessages: unknown[] = [];
const workflowCreates: unknown[] = [];
const workflowTerminates: string[] = [];
const workflowInstances = new Map<string, WorkflowInstanceRow>();
function wrapQueue(
  queue: Queue | undefined,
  sink: unknown[],
): Queue | undefined {
  if (!queue) return undefined;
  return {
    send: async (body: unknown, options?: QueueSendOptions) => {
      sink.push(body);
      return queue.send(body, options);
    },
    sendBatch: async (messages: Iterable<MessageSendRequest>, options?: QueueSendBatchOptions) => {
      for (const m of messages) sink.push(m.body);
      return queue.sendBatch(messages, options);
    },
  } as Queue;
}

/** Wrap env queue producers so getQueueMessages* can observe sends. */
export function installQueueRecorders(env: Bindings): Bindings {
  return {
    ...env,
    GENERATE_QUEUE: wrapQueue(env.GENERATE_QUEUE, generateQueueMessages),
    CARD_REGEN_QUEUE: wrapQueue(env.CARD_REGEN_QUEUE, cardRegenQueueMessages),
    EXPORT_QUEUE: wrapQueue(env.EXPORT_QUEUE, exportQueueMessages),
  };
}

export function getQueueMessages(): unknown[] {
  return [...generateQueueMessages];
}

export function getCardRegenQueueMessages(): unknown[] {
  return [...cardRegenQueueMessages];
}

export function getExportQueueMessages(): unknown[] {
  return [...exportQueueMessages];
}

export function clearQueueMessages(): void {
  generateQueueMessages.length = 0;
  cardRegenQueueMessages.length = 0;
  exportQueueMessages.length = 0;
}

function wrapWorkflow(binding: WorkflowBinding | undefined): WorkflowBinding | undefined {
  if (!binding) return undefined;
  return {
    create: async (options?: { id?: string; params?: unknown }) => {
      const id = options?.id ?? crypto.randomUUID();
      if (workflowInstances.has(id)) {
        throw new Error(`Workflow instance already exists: ${id}`);
      }
      workflowCreates.push(options ?? { id });
      workflowInstances.set(id, {
        status: "running",
        params: options?.params,
      });
      return {
        id,
        status: async () => ({
          status: workflowInstances.get(id)?.status ?? "unknown",
          output: workflowInstances.get(id)?.output,
        }),
        terminate: async () => {
          workflowTerminates.push(id);
          const row = workflowInstances.get(id);
          if (row) row.status = "terminated";
        },
        delete: async () => {
          workflowInstances.delete(id);
        },
      };
    },
    get: async (id: string) => {
      const row = workflowInstances.get(id);
      if (!row) throw new Error(`Workflow instance not found: ${id}`);
      return {
        id,
        status: async () => ({ status: row.status, output: row.output }),
        terminate: async () => {
          workflowTerminates.push(id);
          row.status = "terminated";
        },
        delete: async () => {
          workflowInstances.delete(id);
        },
      };
    },
  } as WorkflowBinding;
}

/** Wrap workflow bindings so getWorkflowCreates* can observe create/terminate. */
export function installWorkflowRecorders(env: Bindings): Bindings {
  return {
    ...env,
    GENERATION_WORKFLOW: wrapWorkflow(env.GENERATION_WORKFLOW),
    FILL_ALL_WORKFLOW: wrapWorkflow(env.FILL_ALL_WORKFLOW),
  };
}

export function getWorkflowCreates(): unknown[] {
  return [...workflowCreates];
}

export function getWorkflowTerminates(): string[] {
  return [...workflowTerminates];
}

export function setWorkflowInstance(
  id: string,
  patch: { status?: string; output?: unknown },
): void {
  const row = workflowInstances.get(id) ?? { status: "running" };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.output !== undefined) row.output = patch.output;
  workflowInstances.set(id, row);
}

export function clearWorkflowMessages(): void {
  workflowCreates.length = 0;
  workflowTerminates.length = 0;
  workflowInstances.clear();
}

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

/** Wipe storage + re-apply migrations (per-file D1 is shared across `it`s). */
export async function resetTestDb(env: Bindings): Promise<void> {
  clearQueueMessages();
  clearWorkflowMessages();
  clearAdminOverviewPrepareCount();
  clearProgressWrites();
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

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

let adminOverviewPrepareCount = 0;
const progressWrites: string[] = [];

export function clearAdminOverviewPrepareCount(): void {
  adminOverviewPrepareCount = 0;
}

export function getAdminOverviewPrepareCount(): number {
  return adminOverviewPrepareCount;
}

/** Count prepares whose SQL includes the admin-overview marker comment. */
export function installAdminOverviewPrepareCounter(env: Bindings): Bindings {
  const db = env.DB;
  return {
    ...env,
    DB: new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            if (query.includes("sugarplum:admin-overview")) {
              adminOverviewPrepareCount += 1;
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }),
  };
}

export function clearProgressWrites(): void {
  progressWrites.length = 0;
}

export function getProgressWrites(): string[] {
  return [...progressWrites];
}

/** Record achievement_progress UPSERT targets (evaluate write-discipline tests). */
export function installProgressWriteRecorder(env: Bindings): Bindings {
  const db = env.DB;
  return {
    ...env,
    DB: new Proxy(db, {
      get(target, prop, _receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            const stmt = target.prepare(query);
            if (query.includes("INSERT INTO achievement_progress")) {
              const originalBind = stmt.bind.bind(stmt);
              (stmt as { bind: typeof stmt.bind }).bind = (
                ...args: unknown[]
              ) => {
                // UPSERT_PROGRESS binds: user_id, achievement_id, current_value, threshold
                if (typeof args[1] === "string") progressWrites.push(args[1]);
                return originalBind(
                  ...(args as Parameters<typeof stmt.bind>),
                );
              };
            }
            return stmt;
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function"
          ? (value as (...args: unknown[]) => unknown).bind(target)
          : value;
      },
    }),
  };
}
