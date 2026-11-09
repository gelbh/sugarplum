import type { Env } from "../../worker/env";
import {
  gamificationAll,
  gamificationFirst,
  gamificationRun,
  initGamificationState,
  type AchievementCompletionRow,
  type UserGamificationRow,
  type XpLedgerRow,
} from "./gamification-test-handlers";
import {
  atlasAll,
  atlasFirst,
  atlasRun,
  initAtlasState,
} from "./atlas-test-handlers";
import type { AchievementDefSeed } from "./gamification-seeds";

/** Mirrors SQL `lower(email) LIKE '%' || lower(q) || '%'` (% and _ wildcards). */
function emailMatchesAdminListQuery(email: string, q: string): boolean {
  const hay = email.toLowerCase();
  const pattern = q.toLowerCase();
  let re = ".*";
  for (const ch of pattern) {
    if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  re += ".*";
  return new RegExp(re).test(hay);
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  oauth_subject: string | null;
  created_at: string;
  disabled_at?: string | null;
};

type SubjectRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

type CalendarConnectionRow = {
  user_id: string;
  refresh_ciphertext: string;
  scopes: string;
  updated_at: string;
};

type CalendarSubjectLinkRow = {
  user_id: string;
  cluster_key: string;
  subject_id: string;
  created_at: string;
};

type CalendarDismissalRow = {
  user_id: string;
  cluster_key: string;
  created_at: string;
};

type ShelfCoverRow = {
  user_id: string;
  owner_kind: string;
  owner_id: string;
  photo_id: string;
  image_url: string;
  photographer_name: string;
  photographer_url: string;
  photo_html_url: string;
};

type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  /** Nullable until backfill; omitted on legacy seedDeck calls → null. */
  subject_id?: string | null;
  created_at: string;
};

type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  body_text?: string | null;
  content_hash?: string | null;
  source_role?: string | null;
};

type GenerationJobRow = {
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
};

type UserSecretRow = {
  user_id: string;
  provider: string;
  ciphertext: string;
  model?: string | null;
  created_at: string;
  updated_at: string;
};

type UserStudyPrefsRow = {
  user_id: string;
  intro_budget: number;
  review_budget: number;
  r_floor: number;
  desired_retention: number;
  enable_fuzz: number;
  fsrs_w_json?: string | null;
  fsrs_last_optimized_at?: string | null;
  fsrs_optimize_pending?: number;
  updated_at: string;
};

type UserStudyDayRow = {
  user_id: string;
  day: string;
  intros_used: number;
};

type UsageEventRow = {
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

export type FreeGenUsageRow = { user_id: string; day: string; used: number };

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

type SessionRecord = { userId: string; expiresAt: number };
type ExportJobRow = {
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

/** Fixed 32-byte wrap key for Vitest when SECRETS_WRAP_KEY is unset. */
export const TEST_SECRETS_WRAP_KEY = "0123456789abcdef0123456789abcdef";

/** In-memory Worker bindings for route tests (no Miniflare). */
export type TestEnv = Env & {
  seedUser: (row: UserRow) => void;
  seedSubject: (row: SubjectRow) => void;
  seedDeck: (row: DeckRow) => void;
  seedMaterial: (row: MaterialRow) => void;
  seedSession: (id: string, userId: string, ttlMs?: number) => void;
  seedUserSecret: (row: UserSecretRow) => void;
  seedUserStudyPrefs: (row: UserStudyPrefsRow) => void;
  seedUserStudyDay: (row: UserStudyDayRow) => void;
  seedCard: (row: CardRow) => void;
  seedGenerationJob: (row: GenerationJobRow) => void;
  seedUsageEvent: (row: UsageEventRow) => void;
  seedExportJob: (row: ExportJobRow) => void;
  seedSchedule: (row: ScheduleRow) => void;
  seedReviewLog: (row: ReviewLogRow) => void;
  seedR2: (key: string, value: string) => void;
  getMaterials: () => MaterialRow[];
  getExportJobs: () => ExportJobRow[];
  getGenerationJobs: () => GenerationJobRow[];
  getUserSecrets: () => UserSecretRow[];
  getUserStudyPrefs: () => UserStudyPrefsRow[];
  getCards: () => CardRow[];
  getSchedules: () => ScheduleRow[];
  getReviewLogs: () => ReviewLogRow[];
  getUsageEvents: () => UsageEventRow[];
  getFreeGenUsageRows: () => FreeGenUsageRow[];
  getQueueMessages: () => unknown[];
  getExportQueueMessages: () => unknown[];
  getR2Keys: () => string[];
  getR2: (key: string) => string | ArrayBuffer | undefined;
  getAchievementCompletions: () => AchievementCompletionRow[];
  getXpLedger: () => XpLedgerRow[];
  seedAchievementDef: (row: AchievementDefSeed) => void;
  getProgressWrites: () => string[];
  getUserGamification: (userId: string) => UserGamificationRow | undefined;
};

export function createTestEnv(opts?: {
  secretsWrapKey?: string | null;
  adminEmails?: string;
  /** When false, omit EXPORT_QUEUE binding (503 path). Default true. */
  exportQueue?: boolean;
}): TestEnv {
  const users = new Map<string, UserRow>();
  const subjects = new Map<string, SubjectRow>();
  const shelfCovers = new Map<string, ShelfCoverRow>();
  const calendarConnections = new Map<string, CalendarConnectionRow>();
  const calendarSubjectLinks = new Map<string, CalendarSubjectLinkRow>();
  const calendarDismissals = new Map<string, CalendarDismissalRow>();

  function shelfCoverKey(
    userId: string,
    ownerKind: string,
    ownerId: string,
  ): string {
    return `${userId}\0${ownerKind}\0${ownerId}`;
  }

  function calendarLinkKey(userId: string, clusterKey: string): string {
    return `${userId}\0${clusterKey}`;
  }
  const decks = new Map<string, DeckRow>();
  const materials = new Map<string, MaterialRow>();
  const generationJobs = new Map<string, GenerationJobRow>();
  const usageEvents = new Map<string, UsageEventRow>();
  const freeGenUsage = new Map<string, FreeGenUsageRow>();
  const userSecrets = new Map<string, UserSecretRow>();
  const userStudyPrefs = new Map<string, UserStudyPrefsRow>();
  const userStudyDay = new Map<string, UserStudyDayRow>();
  const cards = new Map<string, CardRow>();
  const schedules = new Map<string, ScheduleRow>();
  const reviewLogs: ReviewLogRow[] = [];
  const sessions = new Map<string, string>();
  const exportJobs = new Map<string, ExportJobRow>();
  const r2 = new Map<string, string | ArrayBuffer>();
  const queueMessages: unknown[] = [];
  const exportQueueMessages: unknown[] = [];

  const gamificationState = initGamificationState(
    cards,
    decks,
    schedules,
    reviewLogs,
  );
  const atlasState = initAtlasState();

  // Test harness only: missing wrap key → fixed 32-byte test key.
  const wrapKey =
    opts?.secretsWrapKey === null
      ? ""
      : (opts?.secretsWrapKey ?? TEST_SECRETS_WRAP_KEY);

  function prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    let bound: unknown[] = [];

    const stmt = {
      bind(...args: unknown[]) {
        bound = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        const gamificationEarly = gamificationFirst<T>(
          gamificationState,
          normalized,
          bound,
        );
        if (gamificationEarly !== null) return gamificationEarly;
        const atlasEarly = atlasFirst<T>(atlasState, normalized, bound);
        if (atlasEarly !== null) return atlasEarly;
        if (normalized.startsWith("INSERT INTO free_gen_usage")) {
          const [user_id, day, cap] = bound as [string, string, number];
          const key = `${user_id}:${day}`;
          const row = freeGenUsage.get(key);
          if (!row) {
            freeGenUsage.set(key, { user_id, day, used: 1 });
            return { used: 1 } as T;
          }
          if (row.used >= cap) return null;
          row.used += 1;
          return { used: row.used } as T;
        }
        if (normalized.startsWith("SELECT used FROM free_gen_usage")) {
          const row = freeGenUsage.get(`${bound[0]}:${bound[1]}`);
          return row ? ({ used: row.used } as T) : null;
        }
        if (normalized.startsWith("SELECT id FROM users WHERE email =")) {
          for (const u of users.values()) {
            if (u.email === bound[0]) return { id: u.id } as T;
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, password_hash, disabled_at FROM users WHERE email =",
          )
        ) {
          for (const u of users.values()) {
            if (u.email === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                password_hash: u.password_hash,
                disabled_at: u.disabled_at ?? null,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, password_hash FROM users WHERE email =",
          )
        ) {
          for (const u of users.values()) {
            if (u.email === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                password_hash: u.password_hash,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE oauth_subject =",
          )
        ) {
          for (const u of users.values()) {
            if (u.oauth_subject === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
                disabled_at: u.disabled_at ?? null,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash FROM users WHERE oauth_subject =",
          )
        ) {
          for (const u of users.values()) {
            if (u.oauth_subject === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE email =",
          )
        ) {
          for (const u of users.values()) {
            if (u.email === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
                disabled_at: u.disabled_at ?? null,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash FROM users WHERE email =",
          )
        ) {
          for (const u of users.values()) {
            if (u.email === bound[0]) {
              return {
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
              } as T;
            }
          }
          return null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash, disabled_at FROM users WHERE id =",
          )
        ) {
          const u = users.get(bound[0] as string);
          return u
            ? ({
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
                disabled_at: u.disabled_at ?? null,
              } as T)
            : null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject FROM users WHERE id =",
          ) ||
          normalized.startsWith(
            "SELECT id, email, oauth_subject, password_hash FROM users WHERE id =",
          )
        ) {
          const u = users.get(bound[0] as string);
          return u
            ? ({
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                password_hash: u.password_hash,
              } as T)
            : null;
        }
        if (normalized.startsWith("SELECT disabled_at FROM users WHERE id =")) {
          const u = users.get(bound[0] as string);
          return u ? ({ disabled_at: u.disabled_at ?? null } as T) : null;
        }
        if (
          normalized.startsWith(
            "SELECT id, email, oauth_subject, created_at, disabled_at FROM users WHERE id =",
          )
        ) {
          const u = users.get(bound[0] as string);
          return u
            ? ({
                id: u.id,
                email: u.email,
                oauth_subject: u.oauth_subject,
                created_at: u.created_at,
                disabled_at: u.disabled_at ?? null,
              } as T)
            : null;
        }
        if (normalized.startsWith("SELECT id, email FROM users WHERE id =")) {
          const u = users.get(bound[0] as string);
          return u ? ({ id: u.id, email: u.email } as T) : null;
        }
        if (
          normalized.includes("FROM user_study_prefs") &&
          normalized.includes("intro_budget") &&
          normalized.includes("WHERE user_id =")
        ) {
          const row = userStudyPrefs.get(bound[0] as string);
          return row
            ? ({
                intro_budget: row.intro_budget,
                review_budget: row.review_budget,
                r_floor: row.r_floor,
                desired_retention: row.desired_retention,
                enable_fuzz: row.enable_fuzz,
                fsrs_w_json: row.fsrs_w_json ?? null,
                fsrs_last_optimized_at: row.fsrs_last_optimized_at ?? null,
                fsrs_optimize_pending: row.fsrs_optimize_pending ?? 0,
                updated_at: row.updated_at,
              } as T)
            : null;
        }
        if (
          normalized.startsWith(
            "SELECT email, oauth_subject FROM users WHERE id =",
          )
        ) {
          const u = users.get(bound[0] as string);
          return u
            ? ({ email: u.email, oauth_subject: u.oauth_subject } as T)
            : null;
        }
        if (normalized.startsWith("SELECT email FROM users WHERE id =")) {
          const u = users.get(bound[0] as string);
          return u ? ({ email: u.email } as T) : null;
        }
        if (
          normalized.startsWith(
            "SELECT refresh_ciphertext, scopes FROM calendar_connections WHERE user_id =",
          )
        ) {
          const row = calendarConnections.get(bound[0] as string);
          return row
            ? ({
                refresh_ciphertext: row.refresh_ciphertext,
                scopes: row.scopes,
              } as T)
            : null;
        }
        if (
          normalized.startsWith("SELECT id FROM subjects WHERE user_id =") &&
          normalized.includes("title =")
        ) {
          const userId = bound[0] as string;
          const title = bound[1] as string;
          const matches = [...subjects.values()]
            .filter((s) => s.user_id === userId && s.title === title)
            .sort((a, b) =>
              a.created_at !== b.created_at
                ? a.created_at < b.created_at
                  ? -1
                  : 1
                : a.id < b.id
                  ? -1
                  : a.id > b.id
                    ? 1
                    : 0,
            );
          return matches[0] ? ({ id: matches[0].id } as T) : null;
        }
        if (
          normalized.includes("FROM subjects WHERE id =") &&
          normalized.includes("user_id =")
        ) {
          const subject = subjects.get(bound[0] as string);
          if (!subject || subject.user_id !== bound[1]) return null;
          return subject as T;
        }
        if (
          normalized.startsWith("SELECT id, user_id FROM subjects WHERE id =")
        ) {
          const subject = subjects.get(bound[0] as string);
          return subject
            ? ({ id: subject.id, user_id: subject.user_id } as T)
            : null;
        }
        if (normalized.startsWith("SELECT title FROM subjects WHERE id =")) {
          const subject = subjects.get(bound[0] as string);
          return subject && subject.user_id === bound[1]
            ? ({ title: subject.title } as T)
            : null;
        }
        if (
          normalized.startsWith(
            "SELECT id, title, created_at FROM subjects WHERE id =",
          )
        ) {
          const subject = subjects.get(bound[0] as string);
          return subject
            ? ({
                id: subject.id,
                title: subject.title,
                created_at: subject.created_at,
              } as T)
            : null;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM decks WHERE subject_id =")
        ) {
          const subjectId = bound[0] as string;
          const cnt = [...decks.values()].filter(
            (d) => d.subject_id === subjectId,
          ).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM cards WHERE deck_id =") &&
          normalized.includes("status =")
        ) {
          const deckId = bound[0] as string;
          // Literal status in SQL (e.g. status = 'accepted') uses one bind (deck_id).
          const statusLiteral = normalized.match(/status = '([^']+)'/)?.[1];
          const wantStatus = statusLiteral ?? (bound[1] as string);
          const cnt = [...cards.values()].filter(
            (c) => c.deck_id === deckId && c.status === wantStatus,
          ).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM materials WHERE deck_id =")
        ) {
          const deckId = bound[0] as string;
          const cnt = [...materials.values()].filter(
            (m) => m.deck_id === deckId,
          ).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.includes("FROM decks WHERE id =") &&
          normalized.includes("user_id =")
        ) {
          const deck = decks.get(bound[0] as string);
          if (!deck || deck.user_id !== bound[1]) return null;
          return deck as T;
        }
        if (normalized.startsWith("SELECT id, user_id FROM decks WHERE id =")) {
          const deck = decks.get(bound[0] as string);
          return deck ? ({ id: deck.id, user_id: deck.user_id } as T) : null;
        }
        if (normalized.startsWith("SELECT subject_id FROM decks WHERE id =")) {
          const deck = decks.get(bound[0] as string);
          return deck
            ? ({ subject_id: deck.subject_id ?? null } as T)
            : null;
        }
        if (
          normalized.startsWith(
            "SELECT id, deck_id, kind, r2_key, status FROM materials WHERE id =",
          )
        ) {
          const material = materials.get(bound[0] as string);
          if (!material) return null;
          return {
            id: material.id,
            deck_id: material.deck_id,
            kind: material.kind,
            r2_key: material.r2_key,
            status: material.status,
          } as T;
        }
        if (
          normalized.startsWith(
            "SELECT figure_extract_mode FROM generation_jobs WHERE id =",
          )
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          return {
            figure_extract_mode: job.figure_extract_mode ?? "fast",
          } as T;
        }
        if (
          normalized.startsWith(
            "SELECT status, progress_json, created_at FROM generation_jobs WHERE id =",
          )
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          return {
            status: job.status,
            progress_json: job.progress_json,
            created_at: job.created_at,
          } as T;
        }
        if (
          normalized.startsWith(
            "SELECT progress_json, topic_hints_json, avoid_patterns_json, run_topic_hints_json FROM generation_jobs WHERE id =",
          )
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          return {
            progress_json: job.progress_json,
            topic_hints_json: job.topic_hints_json ?? null,
            avoid_patterns_json: job.avoid_patterns_json ?? null,
            run_topic_hints_json: job.run_topic_hints_json ?? null,
          } as T;
        }
        if (
          normalized.startsWith(
            "SELECT progress_json, topic_hints_json FROM generation_jobs WHERE id =",
          )
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          return {
            progress_json: job.progress_json,
            topic_hints_json: job.topic_hints_json ?? null,
          } as T;
        }
        if (
          normalized.startsWith(
            "SELECT progress_json FROM generation_jobs WHERE id =",
          )
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          return { progress_json: job.progress_json } as T;
        }
        if (
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("m.r2_key =") &&
          normalized.includes("d.user_id =")
        ) {
          const r2Key = bound[0] as string;
          const userId = bound[1] as string;
          for (const material of materials.values()) {
            if (material.r2_key !== r2Key) continue;
            const deck = decks.get(material.deck_id);
            if (!deck || deck.user_id !== userId) continue;
            return { r2_key: material.r2_key } as T;
          }
          return null;
        }
        if (
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("WHERE m.id =") &&
          normalized.includes("d.user_id =")
        ) {
          const material = materials.get(bound[0] as string);
          if (!material) return null;
          const deck = decks.get(material.deck_id);
          if (!deck || deck.user_id !== bound[1]) return null;
          return material as T;
        }
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("INNER JOIN materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("j.id =") &&
          normalized.includes("d.user_id =")
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          const material = materials.get(job.material_id);
          if (!material) return null;
          const deck = decks.get(material.deck_id);
          if (!deck || deck.user_id !== bound[1]) return null;
          return {
            id: job.id,
            material_id: job.material_id,
            status: job.status,
            error: job.error,
            coverage_json: job.coverage_json,
            progress_json: job.progress_json,
            created_at: job.created_at,
            finished_at: job.finished_at,
            deck_id: material.deck_id,
          } as T;
        }
        // SELECT j.id ... WHERE d.user_id = ? AND j.status = 'needs_review' AND EXISTS (SELECT 1 FROM cards c WHERE c.job_id = j.id AND c.status = 'draft') ORDER BY j.created_at DESC LIMIT 1
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("INNER JOIN materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("j.status = 'needs_review'") &&
          (normalized.includes("EXISTS") ||
            normalized.includes("INNER JOIN cards"))
        ) {
          const userId = bound[0] as string;
          const matched = [...generationJobs.values()].filter((job) => {
            const material = materials.get(job.material_id);
            if (!material) return false;
            const deck = decks.get(material.deck_id);
            if (!deck || deck.user_id !== userId) return false;
            if (job.status !== "needs_review") return false;
            for (const c of cards.values()) {
              if (c.job_id === job.id && c.status === "draft") return true;
            }
            return false;
          });
          if (matched.length === 0) return null;
          matched.sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { id: matched[0]!.id } as T;
        }
        // SELECT j.id, j.status ... WHERE d.user_id = ? ORDER BY j.created_at DESC LIMIT 1
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("INNER JOIN materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("j.id, j.status") &&
          !normalized.includes("j.status =") &&
          !normalized.includes("j.status IN")
        ) {
          const userId = bound[0] as string;
          const matched = [...generationJobs.values()].filter((job) => {
            const material = materials.get(job.material_id);
            if (!material) return false;
            const deck = decks.get(material.deck_id);
            return !!deck && deck.user_id === userId;
          });
          if (matched.length === 0) return null;
          matched.sort((a, b) => b.created_at.localeCompare(a.created_at));
          const newest = matched[0]!;
          return { id: newest.id, status: newest.status } as T;
        }
        // SELECT 1 as exists FROM generation_jobs ... WHERE d.user_id = ? LIMIT 1
        if (
          normalized.startsWith("SELECT 1") &&
          normalized.includes("FROM generation_jobs") &&
          normalized.includes("INNER JOIN materials") &&
          normalized.includes("INNER JOIN decks")
        ) {
          const userId = bound[0] as string;
          for (const job of generationJobs.values()) {
            const material = materials.get(job.material_id);
            if (!material) continue;
            const deck = decks.get(material.deck_id);
            if (!deck || deck.user_id !== userId) continue;
            return { exists: 1 } as T;
          }
          return null;
        }
        // COUNT(*) handlers
        if (
          normalized.startsWith(
            "SELECT lapses FROM card_schedules WHERE card_id =",
          )
        ) {
          const schedule = schedules.get(bound[0] as string);
          return schedule ? ({ lapses: schedule.lapses } as T) : null;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM review_logs") &&
          normalized.includes("card_id =") &&
          normalized.includes("rating = 1")
        ) {
          const cardId = bound[0] as string;
          const since = bound[1] as string;
          const again_14d = reviewLogs.filter(
            (rl) =>
              rl.card_id === cardId &&
              rl.rating === 1 &&
              rl.reviewed_at >= since,
          ).length;
          return { again_14d, count: again_14d } as T;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM decks WHERE user_id =")
        ) {
          const userId = bound[0] as string;
          const cnt = [...decks.values()].filter(
            (d) => d.user_id === userId,
          ).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM cards") &&
          normalized.includes("INNER JOIN card_schedules")
        ) {
          const [userId, status, now] = bound as [string, string, string];
          const cnt = [...cards.values()].filter((c) => {
            if (c.status !== status) return false;
            const deck = decks.get(c.deck_id);
            if (!deck || deck.user_id !== userId) return false;
            const schedule = schedules.get(c.id);
            if (!schedule || schedule.due > now) return false;
            return true;
          }).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.startsWith("SELECT COUNT(*)") &&
          normalized.includes("FROM cards") &&
          normalized.includes("INNER JOIN decks")
        ) {
          const userId = bound[0] as string;
          const cnt = [...cards.values()].filter((c) => {
            const deck = decks.get(c.deck_id);
            if (!deck || deck.user_id !== userId) return false;
            // only accepted cards appear in this query usage in tests
            if (c.status !== "accepted") return false;
            return true;
          }).length;
          return { count: cnt } as unknown as T;
        }
        if (
          normalized.startsWith(
            "SELECT provider, ciphertext, model FROM user_secrets WHERE user_id =",
          )
        ) {
          const row = userSecrets.get(bound[0] as string);
          return row
            ? ({
                provider: row.provider,
                ciphertext: row.ciphertext,
                model: row.model ?? null,
              } as T)
            : null;
        }
        if (
          normalized.includes("FROM user_study_prefs") &&
          normalized.includes("WHERE user_id =")
        ) {
          const row = userStudyPrefs.get(bound[0] as string);
          return row
            ? ({
                intro_budget: row.intro_budget,
                review_budget: row.review_budget,
                r_floor: row.r_floor,
                desired_retention: row.desired_retention,
                enable_fuzz: row.enable_fuzz,
                fsrs_w_json: row.fsrs_w_json ?? null,
                fsrs_last_optimized_at: row.fsrs_last_optimized_at ?? null,
                fsrs_optimize_pending: row.fsrs_optimize_pending ?? 0,
              } as T)
            : null;
        }
        if (
          normalized.includes("SELECT COUNT(*) AS cnt") &&
          normalized.includes("FROM review_logs rl") &&
          normalized.includes("WHERE d.user_id =")
        ) {
          const userId = bound[0] as string;
          const cnt = reviewLogs.filter((rl) => {
            const card = cards.get(rl.card_id);
            if (!card) return false;
            const deck = decks.get(card.deck_id);
            return deck?.user_id === userId;
          }).length;
          return { cnt } as T;
        }
        if (
          normalized.includes("FROM user_study_day") &&
          normalized.includes("WHERE user_id =") &&
          normalized.includes("AND day =")
        ) {
          const key = `${bound[0] as string}\0${bound[1] as string}`;
          const row = userStudyDay.get(key);
          return row ? ({ intros_used: row.intros_used } as T) : null;
        }
        if (
          normalized.includes("FROM card_schedules") &&
          normalized.includes("WHERE card_id =")
        ) {
          const schedule = schedules.get(bound[0] as string);
          return schedule ? (schedule as T) : null;
        }
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("c.id =") &&
          normalized.includes("d.user_id =")
        ) {
          const card = cards.get(bound[0] as string);
          if (!card) return null;
          const deck = decks.get(card.deck_id);
          if (!deck || deck.user_id !== bound[1]) return null;
          return card as T;
        }
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("SELECT j.id") &&
          normalized.includes("j.id =") &&
          normalized.includes("d.user_id =")
        ) {
          const job = generationJobs.get(bound[0] as string);
          if (!job) return null;
          const material = materials.get(job.material_id);
          if (!material) return null;
          const deck = decks.get(material.deck_id);
          if (!deck || deck.user_id !== bound[1]) return null;
          return { id: job.id } as T;
        }
        if (
          normalized.includes("FROM generation_jobs") &&
          normalized.includes("WHERE material_id = ?") &&
          normalized.includes("ORDER BY created_at DESC")
        ) {
          const materialId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .filter((j) => j.material_id === materialId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          const job = rows[0];
          return job ? ({ id: job.id, created_at: job.created_at } as T) : null;
        }
        if (
          normalized.includes("FROM export_jobs WHERE id =") &&
          normalized.includes("user_id =")
        ) {
          const row = exportJobs.get(bound[0] as string);
          return row && row.user_id === bound[1] ? (row as T) : null;
        }
        if (
          normalized.includes("FROM export_jobs WHERE id =") &&
          !normalized.includes("user_id =")
        ) {
          const row = exportJobs.get(bound[0] as string);
          return row ? (row as T) : null;
        }
        if (
          normalized.includes("AS user_count") &&
          normalized.includes("created_last_7d") &&
          normalized.includes("FROM users")
        ) {
          const cutoff7 =
            (bound[0] as string | undefined) ??
            new Date(Date.now() - 7 * 864e5).toISOString();
          const cutoff30 =
            (bound[1] as string | undefined) ??
            new Date(Date.now() - 30 * 864e5).toISOString();
          const allUsers = [...users.values()];
          const createdLast7d = allUsers.filter(
            (u) => u.created_at >= cutoff7,
          ).length;
          const events = [...usageEvents.values()];
          const tokens_all_time = events.reduce(
            (sum, e) => sum + (e.tokens_total ?? 0),
            0,
          );
          const recent = events.filter((e) => e.created_at >= cutoff30);
          const tokens_30d = recent.reduce(
            (sum, e) => sum + (e.tokens_total ?? 0),
            0,
          );
          const free_jobs_30d = recent.filter(
            (e) => e.path === "free" && e.kind === "generation",
          ).length;
          const byo_jobs_30d = recent.filter(
            (e) => e.path === "byo" && e.kind === "generation",
          ).length;
          return {
            user_count: allUsers.length,
            created_last_7d: createdLast7d,
            tokens_all_time,
            tokens_30d,
            free_jobs_30d,
            byo_jobs_30d,
          } as T;
        }
        if (
          normalized.includes("AS tokens_all_time") &&
          normalized.includes("FROM usage_events WHERE user_id")
        ) {
          const userId = bound[0] as string;
          const cutoff30 = bound[2] as string;
          const events = [...usageEvents.values()].filter(
            (e) => e.user_id === userId,
          );
          const recent = events.filter((e) => e.created_at >= cutoff30);
          return {
            tokens_all_time: events.reduce(
              (sum, e) => sum + (e.tokens_total ?? 0),
              0,
            ),
            tokens_30d: recent.reduce(
              (sum, e) => sum + (e.tokens_total ?? 0),
              0,
            ),
            free_jobs_30d: recent.filter(
              (e) => e.path === "free" && e.kind === "generation",
            ).length,
            byo_jobs_30d: recent.filter(
              (e) => e.path === "byo" && e.kind === "generation",
            ).length,
          } as T;
        }
        if (
          normalized.startsWith("SELECT id FROM usage_events WHERE job_id =")
        ) {
          const jobId = bound[0] as string;
          const hit = [...usageEvents.values()].find((e) => e.job_id === jobId);
          return (hit ? { id: hit.id } : null) as T;
        }
        if (
          normalized.includes("progress_json AS progress_json") &&
          normalized.includes("d.user_id AS user_id") &&
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("WHERE j.id =")
        ) {
          const jobId = bound[0] as string;
          const job = generationJobs.get(jobId);
          if (!job) return null;
          const material = materials.get(job.material_id);
          if (!material) return null;
          const deck = decks.get(material.deck_id);
          if (!deck) return null;
          return {
            progress_json: job.progress_json,
            user_id: deck.user_id,
          } as T;
        }
        if (
          normalized.includes("FROM users u") &&
          normalized.includes("WHERE u.id =") &&
          normalized.includes("AS material_count")
        ) {
          const userId = bound[0] as string;
          const u = users.get(userId);
          if (!u) return null;
          const userDeckIds = new Set(
            [...decks.values()]
              .filter((d) => d.user_id === u.id)
              .map((d) => d.id),
          );
          const deck_count = userDeckIds.size;
          const card_count = [...cards.values()].filter((c) =>
            userDeckIds.has(c.deck_id),
          ).length;
          const job_count = [...generationJobs.values()].filter((j) => {
            const material = materials.get(j.material_id);
            if (!material) return false;
            return userDeckIds.has(material.deck_id);
          }).length;
          const material_count = [...materials.values()].filter((m) =>
            userDeckIds.has(m.deck_id),
          ).length;
          return {
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            oauth_subject: u.oauth_subject,
            disabled_at: u.disabled_at ?? null,
            deck_count,
            card_count,
            job_count,
            material_count,
          } as T;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        const gamificationAllHit = gamificationAll<T>(
          gamificationState,
          normalized,
          bound,
        );
        if (gamificationAllHit !== null) return gamificationAllHit;
        const atlasAllHit = atlasAll<T>(atlasState, normalized, bound);
        if (atlasAllHit !== null) return atlasAllHit;
        if (
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d ON d.id = m.deck_id") &&
          normalized.includes("WHERE d.subject_id =") &&
          normalized.includes("m.source_role")
        ) {
          const subjectId = bound[0] as string;
          const includeStatus = normalized.includes("m.status");
          const rows = [...materials.values()]
            .map((m) => {
              const deck = decks.get(m.deck_id);
              if (!deck || deck.subject_id !== subjectId) return null;
              return {
                id: m.id,
                deck_id: m.deck_id,
                kind: m.kind,
                r2_key: m.r2_key,
                filename: m.filename,
                source_role: m.source_role ?? "lecture",
                ...(includeStatus ? { status: m.status } : {}),
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT rl.card_id AS card_id") &&
          normalized.includes("FROM review_logs rl") &&
          normalized.includes("WHERE d.user_id =")
        ) {
          const userId = bound[0] as string;
          const rows = reviewLogs
            .filter((rl) => {
              const card = cards.get(rl.card_id);
              if (!card) return false;
              const deck = decks.get(card.deck_id);
              return deck?.user_id === userId;
            })
            .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at))
            .map((rl) => ({
              card_id: rl.card_id,
              reviewed_at: rl.reviewed_at,
              rating: rl.rating,
              state_json: rl.state_json,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT d.user_id AS user_id") &&
          normalized.includes("COUNT(rl.id) AS cnt") &&
          normalized.includes("FROM review_logs rl")
        ) {
          const cutoff = bound[0] as string;
          const minReviews = bound[1] as number;
          const limit = bound[2] as number;
          const byUser = new Map<string, number>();
          for (const rl of reviewLogs) {
            const card = cards.get(rl.card_id);
            if (!card) continue;
            const deck = decks.get(card.deck_id);
            if (!deck) continue;
            byUser.set(deck.user_id, (byUser.get(deck.user_id) ?? 0) + 1);
          }
          const rows = [...byUser.entries()]
            .map(([user_id, cnt]) => {
              const p = userStudyPrefs.get(user_id);
              if ((p?.fsrs_optimize_pending ?? 0) === 1) return null;
              const last = p?.fsrs_last_optimized_at ?? null;
              if (last != null && last !== "" && !(last <= cutoff)) return null;
              if (cnt < minReviews) return null;
              return { user_id, cnt };
            })
            .filter((row): row is { user_id: string; cnt: number } => row != null)
            .sort((a, b) => b.cnt - a.cnt)
            .slice(0, limit);
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT cluster_key, subject_id FROM calendar_subject_links WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          const rows = [...calendarSubjectLinks.values()]
            .filter((row) => row.user_id === userId)
            .map((row) => ({
              cluster_key: row.cluster_key,
              subject_id: row.subject_id,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT cluster_key FROM calendar_dismissals WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          const rows = [...calendarDismissals.values()]
            .filter((row) => row.user_id === userId)
            .map((row) => ({ cluster_key: row.cluster_key }));
          return { results: rows as T[] };
        }
        if (
          normalized === "SELECT id, title FROM subjects WHERE user_id = ?"
        ) {
          const userId = bound[0] as string;
          const rows = [...subjects.values()]
            .filter((s) => s.user_id === userId)
            .map((s) => ({ id: s.id, title: s.title }));
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url FROM shelf_covers WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          const rows = [...shelfCovers.values()].filter(
            (row) => row.user_id === userId,
          );
          return {
            results: rows.map((row) => ({
              owner_kind: row.owner_kind,
              owner_id: row.owner_id,
              photo_id: row.photo_id,
              image_url: row.image_url,
              photographer_name: row.photographer_name,
              photographer_url: row.photographer_url,
              photo_html_url: row.photo_html_url,
            })) as T[],
          };
        }
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("INNER JOIN materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("ORDER BY j.created_at DESC") &&
          normalized.includes("LIMIT ?") &&
          normalized.includes("j.status")
        ) {
          const userId = bound[0] as string;
          const limitRaw = bound[1] as number | undefined;
          const limit =
            typeof limitRaw === "number" && Number.isFinite(limitRaw)
              ? limitRaw
              : 20;
          const rows = [...generationJobs.values()]
            .map((job) => {
              const material = materials.get(job.material_id);
              if (!material) return null;
              const deck = decks.get(material.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: job.id,
                status: job.status,
                created_at: job.created_at,
                finished_at: job.finished_at,
                progress_json: job.progress_json,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM user_study_day") &&
          normalized.includes("WHERE user_id =") &&
          normalized.includes("ORDER BY day DESC")
        ) {
          const userId = bound[0] as string;
          const limitRaw = bound[1] as number | undefined;
          const limit =
            typeof limitRaw === "number" && Number.isFinite(limitRaw)
              ? limitRaw
              : 14;
          const rows = [...userStudyDay.values()]
            .filter((row) => row.user_id === userId)
            .sort((a, b) => b.day.localeCompare(a.day))
            .slice(0, limit)
            .map((row) => ({ day: row.day, intros_used: row.intros_used }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM user_study_day") &&
          normalized.includes("WHERE user_id =") &&
          normalized.includes("ORDER BY day ASC")
        ) {
          const userId = bound[0] as string;
          const rows = [...userStudyDay.values()]
            .filter((row) => row.user_id === userId)
            .sort((a, b) => a.day.localeCompare(b.day))
            .map((row) => ({ day: row.day, intros_used: row.intros_used }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT m.r2_key FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("m.r2_key IS NOT NULL")
        ) {
          const userId = bound[0] as string;
          const rows = [...materials.values()]
            .map((m) => {
              const deck = decks.get(m.deck_id);
              if (!deck || deck.user_id !== userId || !m.r2_key) return null;
              return { r2_key: m.r2_key };
            })
            .filter((row): row is { r2_key: string } => row != null);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT c.media_r2_keys_json FROM cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("c.media_r2_keys_json IS NOT NULL")
        ) {
          const userId = bound[0] as string;
          const rows = [...cards.values()]
            .map((card) => {
              const deck = decks.get(card.deck_id);
              if (
                !deck ||
                deck.user_id !== userId ||
                !card.media_r2_keys_json
              ) {
                return null;
              }
              return { media_r2_keys_json: card.media_r2_keys_json };
            })
            .filter(
              (row): row is { media_r2_keys_json: string } => row != null,
            );
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT r2_key FROM export_jobs WHERE user_id =",
          ) &&
          normalized.includes("r2_key IS NOT NULL")
        ) {
          const userId = bound[0] as string;
          const rows = [...exportJobs.values()]
            .filter((j) => j.user_id === userId && j.r2_key)
            .map((j) => ({ r2_key: j.r2_key }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT m.id, m.deck_id, m.kind, m.r2_key") &&
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("ORDER BY m.created_at ASC")
        ) {
          const userId = bound[0] as string;
          const rows = [...materials.values()]
            .map((m) => {
              const deck = decks.get(m.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: m.id,
                deck_id: m.deck_id,
                kind: m.kind,
                r2_key: m.r2_key,
                filename: m.filename,
                page_count: m.page_count,
                status: m.status,
                created_at: m.created_at,
                source_role: m.source_role ?? "lecture",
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT j.id, j.material_id, j.status") &&
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("INNER JOIN materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("ORDER BY j.created_at ASC")
        ) {
          const userId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .map((job) => {
              const material = materials.get(job.material_id);
              if (!material) return null;
              const deck = decks.get(material.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: job.id,
                material_id: job.material_id,
                status: job.status,
                error: job.error,
                coverage_json: job.coverage_json,
                progress_json: job.progress_json,
                created_at: job.created_at,
                finished_at: job.finished_at,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT c.id, c.deck_id, c.job_id, c.type") &&
          normalized.includes("c.front_json") &&
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("ORDER BY c.created_at ASC")
        ) {
          const userId = bound[0] as string;
          const rows = [...cards.values()]
            .map((card) => {
              const deck = decks.get(card.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: card.id,
                deck_id: card.deck_id,
                job_id: card.job_id,
                type: card.type,
                front_json: card.front_json,
                back_json: card.back_json,
                media_r2_keys_json: card.media_r2_keys_json,
                provenance_json: card.provenance_json,
                status: card.status,
                created_at: card.created_at,
                updated_at: card.updated_at,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM card_schedules s") &&
          normalized.includes("INNER JOIN cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =")
        ) {
          const userId = bound[0] as string;
          const rows = [...schedules.values()]
            .map((s) => {
              const card = cards.get(s.card_id);
              if (!card) return null;
              const deck = decks.get(card.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return { ...s };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM review_logs rl") &&
          normalized.includes("INNER JOIN cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("ORDER BY rl.reviewed_at ASC")
        ) {
          const userId = bound[0] as string;
          const rows = reviewLogs
            .map((rl) => {
              const card = cards.get(rl.card_id);
              if (!card) return null;
              const deck = decks.get(card.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return { ...rl };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => a.reviewed_at.localeCompare(b.reviewed_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM export_jobs WHERE user_id =") &&
          normalized.includes("ORDER BY created_at ASC") &&
          normalized.includes("request_json")
        ) {
          const userId = bound[0] as string;
          const rows = [...exportJobs.values()]
            .filter((j) => j.user_id === userId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((j) => ({
              id: j.id,
              status: j.status,
              request_json: j.request_json,
              r2_key: j.r2_key,
              error: j.error,
              warning_json: j.warning_json,
              created_at: j.created_at,
              updated_at: j.updated_at,
              expires_at: j.expires_at,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM users u") &&
          normalized.includes("AS deck_count") &&
          normalized.includes("AS job_count")
        ) {
          const [cutoff30, q, , limitRaw] = bound as [
            string,
            string,
            string,
            number,
          ];
          let rows = [...users.values()];
          if (q !== "") {
            rows = rows.filter((u) => emailMatchesAdminListQuery(u.email, q));
          }
          rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
          const limit = Number(limitRaw);
          rows = rows.slice(0, Number.isFinite(limit) ? limit : 50);
          const results = rows.map((u) => {
            const userDeckIds = new Set(
              [...decks.values()]
                .filter((d) => d.user_id === u.id)
                .map((d) => d.id),
            );
            const deck_count = userDeckIds.size;
            const card_count = [...cards.values()].filter((c) =>
              userDeckIds.has(c.deck_id),
            ).length;
            const job_count = [...generationJobs.values()].filter((j) => {
              const material = materials.get(j.material_id);
              if (!material) return false;
              return userDeckIds.has(material.deck_id);
            }).length;
            const tokens_30d = [...usageEvents.values()]
              .filter((e) => e.user_id === u.id && e.created_at >= cutoff30)
              .reduce((sum, e) => sum + (e.tokens_total ?? 0), 0);
            return {
              id: u.id,
              email: u.email,
              created_at: u.created_at,
              oauth_subject: u.oauth_subject,
              disabled_at: u.disabled_at ?? null,
              deck_count,
              card_count,
              job_count,
              tokens_30d,
            };
          });
          return { results: results as T[] };
        }
        if (
          normalized.includes("FROM subjects WHERE user_id =") &&
          normalized.includes("LIMIT 50")
        ) {
          const userId = bound[0] as string;
          const rows = [...subjects.values()]
            .filter((s) => s.user_id === userId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 50)
            .map((s) => ({
              id: s.id,
              title: s.title,
              created_at: s.created_at,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM decks") &&
          normalized.includes("WHERE user_id =") &&
          normalized.includes("LIMIT 50") &&
          normalized.includes("subject_id")
        ) {
          const userId = bound[0] as string;
          const rows = [...decks.values()]
            .filter((d) => d.user_id === userId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 50)
            .map((d) => ({
              id: d.id,
              title: d.title,
              subject_id: d.subject_id ?? null,
              created_at: d.created_at,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("LIMIT 50") &&
          normalized.includes("m.filename")
        ) {
          const userId = bound[0] as string;
          const rows = [...materials.values()]
            .map((m) => {
              const deck = decks.get(m.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: m.id,
                deck_id: m.deck_id,
                kind: m.kind,
                filename: m.filename ?? null,
                status: m.status,
                created_at: m.created_at,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 50);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.user_id =") &&
          normalized.includes("front_json") &&
          normalized.includes("LIMIT 10")
        ) {
          const userId = bound[0] as string;
          const rows = [...cards.values()]
            .map((c) => {
              const deck = decks.get(c.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: c.id,
                type: c.type,
                status: c.status,
                front_json: c.front_json,
                created_at: c.created_at,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 10);
          return { results: rows as T[] };
        }
        if (
          normalized.includes("LEFT JOIN usage_events ue ON ue.job_id") &&
          normalized.includes("j.finished_at IS NOT NULL")
        ) {
          const rows = [...generationJobs.values()]
            .map((j) => {
              if (!j.finished_at) return null;
              if ([...usageEvents.values()].some((e) => e.job_id === j.id)) {
                return null;
              }
              const material = materials.get(j.material_id);
              if (!material) return null;
              const deck = decks.get(material.deck_id);
              if (!deck) return null;
              return {
                id: j.id,
                progress_json: j.progress_json,
                user_id: deck.user_id,
                finished_at: j.finished_at,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null);
          return { results: rows as T[] };
        }
        if (normalized.includes("sugarplum:subject-knowledge")) {
          const subjectId = bound[0] as string;
          const userId = bound[1] as string | undefined;
          const rows = [...cards.values()]
            .filter((card) => {
              if (card.status !== "accepted") return false;
              const deck = decks.get(card.deck_id);
              if (!deck || deck.subject_id !== subjectId) return false;
              if (userId != null && deck.user_id !== userId) return false;
              return true;
            })
            .map((card) => {
              const schedule = schedules.get(card.id);
              return {
                state: schedule?.state ?? null,
                scheduled_days: schedule?.scheduled_days ?? null,
              };
            });
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("LEFT JOIN card_schedules")
        ) {
          const [deckId, status] = bound as [string, string];
          const rows = [...cards.values()]
            .filter((card) => card.deck_id === deckId && card.status === status)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((card) => {
              const schedule = schedules.get(card.id);
              return {
                ...card,
                due: schedule?.due ?? null,
                stability: schedule?.stability ?? null,
                difficulty: schedule?.difficulty ?? null,
                elapsed_days: schedule?.elapsed_days ?? null,
                scheduled_days: schedule?.scheduled_days ?? null,
                reps: schedule?.reps ?? null,
                lapses: schedule?.lapses ?? null,
                state: schedule?.state ?? null,
                last_review: schedule?.last_review ?? null,
              };
            });
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM generation_jobs j") &&
          normalized.includes("COUNT(c.id)") &&
          normalized.includes("c.status = 'draft'") &&
          normalized.includes("d.user_id =")
        ) {
          const userId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .map((job) => {
              const material = materials.get(job.material_id);
              if (!material) return null;
              const deck = decks.get(material.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              const draft_count = [...cards.values()].filter(
                (c) => c.job_id === job.id && c.status === "draft",
              ).length;
              if (draft_count === 0) return null;
              return {
                id: job.id,
                status: job.status,
                created_at: job.created_at,
                deck_id: material.deck_id,
                deck_title: deck.title,
                filename: material.filename,
                draft_count,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM subjects WHERE user_id =") &&
          normalized.includes("ORDER BY created_at")
        ) {
          const userId = bound[0] as string;
          const withCount =
            normalized.includes("deck_count") || normalized.includes("COUNT(");
          const rows = [...subjects.values()]
            .filter((s) => s.user_id === userId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((s) => {
              const base = {
                id: s.id,
                title: s.title,
                created_at: s.created_at,
              };
              if (!withCount) return base;
              const deck_count = [...decks.values()].filter(
                (d) => d.subject_id === s.id,
              ).length;
              return { ...base, deck_count };
            });
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM decks WHERE user_id =") &&
          normalized.includes("AND subject_id =") &&
          normalized.includes("ORDER BY created_at")
        ) {
          const [userId, subjectId] = bound as [string, string];
          const rows = [...decks.values()]
            .filter((d) => d.user_id === userId && d.subject_id === subjectId)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(({ id, title, subject_hint, subject_id, created_at }) => ({
              id,
              title,
              subject_hint,
              subject_id: subject_id ?? null,
              created_at,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM decks WHERE user_id =") &&
          normalized.includes("ORDER BY created_at")
        ) {
          const includeSubjectId = normalized.includes("subject_id");
          const rows = [...decks.values()]
            .filter((d) => d.user_id === bound[0])
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(({ id, title, subject_hint, subject_id, created_at }) => {
              const row: Record<string, unknown> = {
                id,
                title,
                subject_hint,
                created_at,
              };
              if (includeSubjectId) row.subject_id = subject_id ?? null;
              return row;
            });
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM decks WHERE subject_id =") &&
          normalized.includes("ORDER BY created_at")
        ) {
          const rows = [...decks.values()]
            .filter((d) => d.subject_id === bound[0])
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(({ id, title, subject_hint, subject_id, created_at }) => ({
              id,
              title,
              subject_hint,
              subject_id: subject_id ?? null,
              created_at,
            }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("SELECT id, r2_key FROM materials") &&
          normalized.includes("r2_key >= ?") &&
          normalized.includes("r2_key < ?") &&
          normalized.includes("kind = 'image'")
        ) {
          // Material hard-delete: figure children under pdf prefix (any status).
          const [deckId, lower, upper] = bound as [string, string, string];
          const rows = [...materials.values()]
            .filter(
              (m) =>
                m.deck_id === deckId &&
                m.kind === "image" &&
                m.r2_key != null &&
                m.r2_key >= lower &&
                m.r2_key < upper,
            )
            .map((m) => ({ id: m.id, r2_key: m.r2_key }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("r2_key >= ?") &&
          normalized.includes("r2_key < ?") &&
          normalized.includes("kind = 'image'") &&
          normalized.includes("ORDER BY r2_key")
        ) {
          const [deckId, lower, upper] = bound as [string, string, string];
          const allowUploading = normalized.includes("'uploading'");
          const rows = [...materials.values()]
            .filter(
              (m) =>
                m.deck_id === deckId &&
                m.kind === "image" &&
                (m.status === "ready" ||
                  (allowUploading && m.status === "uploading")) &&
                m.r2_key != null &&
                m.r2_key >= lower &&
                m.r2_key < upper,
            )
            .sort((a, b) => (a.r2_key ?? "").localeCompare(b.r2_key ?? ""))
            .map((m) =>
              allowUploading
                ? { r2_key: m.r2_key, status: m.status }
                : { r2_key: m.r2_key },
            );
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT id FROM generation_jobs WHERE material_id =",
          )
        ) {
          const materialId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .filter((j) => j.material_id === materialId)
            .map((j) => ({ id: j.id }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM materials WHERE deck_id =") &&
          normalized.includes("r2_key IS NOT NULL")
        ) {
          const rows = [...materials.values()]
            .filter((m) => m.deck_id === bound[0] && m.r2_key != null)
            .map((m) => ({ r2_key: m.r2_key }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM export_jobs WHERE user_id =") &&
          normalized.includes("expires_at <=")
        ) {
          const [userId, cutoff] = bound as [string, string];
          const rows = [...exportJobs.values()]
            .filter((row) => row.user_id === userId && row.expires_at <= cutoff)
            .map((row) => ({ id: row.id, r2_key: row.r2_key }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards") &&
          normalized.includes("WHERE deck_id =") &&
          normalized.includes("AND status =") &&
          !normalized.startsWith("SELECT COUNT(*)")
        ) {
          const [deckId, status] = bound as [string, string];
          const rows = [...cards.values()]
            .filter((c) => c.deck_id === deckId && c.status === status)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards WHERE deck_id =") &&
          normalized.includes("media_r2_keys_json")
        ) {
          const rows = [...cards.values()]
            .filter(
              (c) => c.deck_id === bound[0] && c.media_r2_keys_json != null,
            )
            .map((c) => ({ media_r2_keys_json: c.media_r2_keys_json }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM materials") &&
          normalized.includes(
            "WHERE deck_id = ? AND status = ? AND content_hash = ?",
          )
        ) {
          const [deckId, status, contentHash] = bound as [
            string,
            string,
            string,
          ];
          const rows = [...materials.values()].filter(
            (m) =>
              m.deck_id === deckId &&
              m.status === status &&
              (m.content_hash ?? null) === contentHash,
          );
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM generation_jobs") &&
          normalized.includes("WHERE material_id = ?") &&
          normalized.includes("ORDER BY created_at DESC")
        ) {
          const materialId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .filter((j) => j.material_id === materialId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 1)
            .map((j) => ({ id: j.id, created_at: j.created_at }));
          return { results: rows as T[] };
        }
        if (
          normalized.includes(
            "SELECT id, progress_json, created_at FROM generation_jobs",
          ) &&
          normalized.includes("WHERE id = ? AND status = 'running'")
        ) {
          const id = bound[0] as string;
          const job = generationJobs.get(id);
          const rows =
            job && job.status === "running"
              ? [
                  {
                    id: job.id,
                    progress_json: job.progress_json,
                    created_at: job.created_at,
                  },
                ]
              : [];
          return { results: rows as T[] };
        }
        if (
          normalized.includes(
            "SELECT id, progress_json, created_at FROM generation_jobs",
          ) &&
          normalized.includes("WHERE status = 'running'")
        ) {
          const limit = typeof bound[0] === "number" ? bound[0] : 50;
          const rows = [...generationJobs.values()]
            .filter((j) => j.status === "running")
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .slice(0, limit)
            .map((j) => ({
              id: j.id,
              progress_json: j.progress_json,
              created_at: j.created_at,
            }));
          return { results: rows as T[] };
        }
        if (normalized.includes("FROM materials WHERE deck_id =")) {
          let rows = [...materials.values()].filter(
            (m) => m.deck_id === bound[0],
          );
          if (normalized.includes("ORDER BY created_at DESC")) {
            rows = rows.sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            );
          }
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM materials m") &&
          normalized.includes("INNER JOIN decks d") &&
          normalized.includes("d.title AS deck_title") &&
          normalized.includes("WHERE d.user_id =")
        ) {
          const userId = bound[0] as string;
          const rows = [...materials.values()]
            .map((m) => {
              const deck = decks.get(m.deck_id);
              if (!deck || deck.user_id !== userId) return null;
              return {
                id: m.id,
                deck_id: m.deck_id,
                kind: m.kind,
                r2_key: m.r2_key,
                filename: m.filename,
                page_count: m.page_count,
                status: m.status,
                created_at: m.created_at,
                source_role: m.source_role ?? "lecture",
                deck_title: deck.title,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row != null)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards") &&
          normalized.includes("job_id =") &&
          normalized.includes("status =")
        ) {
          const [jobId, status] = bound as [string, string];
          const rows = [...cards.values()]
            .filter((c) => c.job_id === jobId && c.status === status)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { results: rows as T[] };
        }
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN card_schedules s") &&
          normalized.includes("c.status =") &&
          normalized.includes("s.due <=")
        ) {
          // With again_14d subquery: [since, userId, status, now, ...scope]
          // Legacy: [userId, status, now, ...scope]
          const hasAgain14d =
            normalized.includes("again_14d") ||
            (normalized.includes("FROM review_logs rl") &&
              normalized.includes("rating = 1"));
          const bindOffset = hasAgain14d ? 1 : 0;
          const since = hasAgain14d ? (bound[0] as string) : null;
          const userId = bound[bindOffset] as string;
          const status = bound[bindOffset + 1] as string;
          const now = bound[bindOffset + 2] as string;
          const scopeBound = bound[bindOffset + 3] as string | undefined;
          const filterDeckId = normalized.includes("c.deck_id =")
            ? scopeBound
            : null;
          const filterSubjectId = normalized.includes("d.subject_id =")
            ? scopeBound
            : null;
          const rows = [...cards.values()]
            .filter((c) => {
              if (c.status !== status) return false;
              const deck = decks.get(c.deck_id);
              if (!deck || deck.user_id !== userId) return false;
              if (filterDeckId && c.deck_id !== filterDeckId) return false;
              if (filterSubjectId && deck.subject_id !== filterSubjectId) {
                return false;
              }
              const schedule = schedules.get(c.id);
              if (!schedule || schedule.due > now) return false;
              return true;
            })
            .map((c) => {
              const schedule = schedules.get(c.id)!;
              const again_14d =
                since == null
                  ? 0
                  : reviewLogs.filter(
                      (rl) =>
                        rl.card_id === c.id &&
                        rl.rating === 1 &&
                        rl.reviewed_at >= since,
                    ).length;
              return {
                ...c,
                due: schedule.due,
                stability: schedule.stability,
                difficulty: schedule.difficulty,
                elapsed_days: schedule.elapsed_days,
                scheduled_days: schedule.scheduled_days,
                learning_steps: schedule.learning_steps,
                reps: schedule.reps,
                lapses: schedule.lapses,
                state: schedule.state,
                last_review: schedule.last_review,
                again_14d,
              };
            })
            .sort((a, b) => a.due.localeCompare(b.due));
          return { results: rows as T[] };
        }
        // GET /api/study/struggling: accepted + schedule + again_14d + hard_14d
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN card_schedules s") &&
          normalized.includes("FROM review_logs rl") &&
          normalized.includes("c.status =")
        ) {
          const since = bound[0] as string;
          // New query binds since twice (again + hard), then userId, status.
          // Legacy query bound since, userId, status once.
          const hasHard =
            normalized.includes("rating = 2") ||
            normalized.includes("hard_14d");
          const userId = (hasHard ? bound[2] : bound[1]) as string;
          const status = (hasHard ? bound[3] : bound[2]) as string;
          const filterSurvivors =
            normalized.includes("lapses >= 2") ||
            normalized.includes("again_14d >= 2");
          const rows = [...cards.values()]
            .filter((c) => {
              if (c.status !== status) return false;
              const deck = decks.get(c.deck_id);
              if (!deck || deck.user_id !== userId) return false;
              return schedules.has(c.id);
            })
            .map((c) => {
              const schedule = schedules.get(c.id)!;
              const again_14d = reviewLogs.filter(
                (rl) =>
                  rl.card_id === c.id &&
                  rl.rating === 1 &&
                  rl.reviewed_at >= since,
              ).length;
              const hard_14d = reviewLogs.filter(
                (rl) =>
                  rl.card_id === c.id &&
                  rl.rating === 2 &&
                  rl.reviewed_at >= since,
              ).length;
              return {
                id: c.id,
                deck_id: c.deck_id,
                job_id: c.job_id,
                type: c.type,
                front_json: c.front_json,
                provenance_json: c.provenance_json,
                lapses: schedule.lapses,
                difficulty: schedule.difficulty,
                due: schedule.due,
                last_review: schedule.last_review,
                stability: schedule.stability,
                elapsed_days: schedule.elapsed_days,
                scheduled_days: schedule.scheduled_days,
                learning_steps: schedule.learning_steps,
                reps: schedule.reps,
                state: schedule.state,
                again_14d,
                hard_14d,
              };
            })
            .filter((row) =>
              filterSurvivors ? row.lapses >= 2 || row.again_14d >= 2 : true,
            );
          return { results: rows as T[] };
        }
        if (
          normalized.startsWith(
            "SELECT id, coverage_json FROM generation_jobs WHERE material_id =",
          ) &&
          normalized.includes("coverage_json IS NOT NULL")
        ) {
          const materialId = bound[0] as string;
          const rows = [...generationJobs.values()]
            .filter(
              (job) =>
                job.material_id === materialId && job.coverage_json != null,
            )
            .sort((a, b) =>
              (a.finished_at ?? "").localeCompare(b.finished_at ?? ""),
            )
            .map((job) => ({
              id: job.id,
              coverage_json: job.coverage_json,
            }));
          return { results: rows as T[] };
        }
        return { results: [] };
      },
      async run(): Promise<D1Result> {
        if (normalized.startsWith("UPDATE free_gen_usage SET used = used - 1")) {
          const row = freeGenUsage.get(`${bound[0]}:${bound[1]}`);
          if (!row || row.used <= 0) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          row.used -= 1;
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        if (normalized.startsWith("INSERT INTO export_jobs")) {
          // Supports both legacy (error NULL in SQL) and bind-with-error shapes.
          const hasErrorBind = !normalized.includes(", NULL,");
          if (hasErrorBind) {
            const [
              id,
              user_id,
              status,
              request_json,
              r2_key,
              error,
              warning_json,
              created_at,
              updated_at,
              expires_at,
            ] = bound as [
              string,
              string,
              string,
              string,
              string | null,
              string | null,
              string | null,
              string,
              string,
              string,
            ];
            exportJobs.set(id, {
              id,
              user_id,
              status,
              request_json,
              r2_key,
              error,
              warning_json,
              created_at,
              updated_at,
              expires_at,
            });
          } else {
            const [
              id,
              user_id,
              status,
              request_json,
              r2_key,
              warning_json,
              created_at,
              updated_at,
              expires_at,
            ] = bound as [
              string,
              string,
              string,
              string,
              string | null,
              string | null,
              string,
              string,
              string,
            ];
            exportJobs.set(id, {
              id,
              user_id,
              status,
              request_json,
              r2_key,
              error: null,
              warning_json,
              created_at,
              updated_at,
              expires_at,
            });
          }
        } else if (
          normalized.startsWith(
            "DELETE FROM export_jobs WHERE id = ? AND user_id = ?",
          )
        ) {
          const [id, userId] = bound as [string, string];
          const row = exportJobs.get(id);
          if (row && row.user_id === userId) exportJobs.delete(id);
        } else if (
          normalized.startsWith(
            "UPDATE export_jobs SET status = ?, error = ?, warning_json = ?",
          )
        ) {
          const [status, error, warning_json, updated_at, id] = bound as [
            string,
            string | null,
            string | null,
            string,
            string,
            string?,
          ];
          const row = exportJobs.get(id);
          if (row)
            exportJobs.set(id, {
              ...row,
              status,
              error,
              warning_json,
              updated_at,
            });
        } else if (
          normalized.startsWith("UPDATE export_jobs SET status = ?, r2_key = ?")
        ) {
          const [status, r2_key, warning_json, updated_at, id] = bound as [
            string,
            string | null,
            string | null,
            string,
            string,
            string?,
          ];
          const row = exportJobs.get(id);
          if (row)
            exportJobs.set(id, {
              ...row,
              status,
              r2_key,
              warning_json,
              updated_at,
            });
        } else if (
          normalized.startsWith("UPDATE export_jobs SET status = ?, error = ?")
        ) {
          const [status, error, updated_at, id] = bound as [
            string,
            string | null,
            string,
            string,
            string?,
          ];
          const row = exportJobs.get(id);
          if (row) exportJobs.set(id, { ...row, status, error, updated_at });
        } else if (
          normalized.startsWith(
            "UPDATE export_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
          )
        ) {
          const [status, updated_at, id, expectedStatus] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = exportJobs.get(id);
          if (row && row.status === expectedStatus) {
            exportJobs.set(id, { ...row, status, updated_at });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE export_jobs SET updated_at = ? WHERE id = ? AND status = ? AND updated_at = ?",
          )
        ) {
          const [updated_at, id, expectedStatus, expectedUpdatedAt] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = exportJobs.get(id);
          if (
            row &&
            row.status === expectedStatus &&
            row.updated_at === expectedUpdatedAt
          ) {
            exportJobs.set(id, { ...row, updated_at });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE export_jobs SET status = ?, error = NULL, updated_at = ?",
          )
        ) {
          const [status, updated_at, id] = bound as [
            string,
            string,
            string,
            string?,
          ];
          const row = exportJobs.get(id);
          if (row) {
            exportJobs.set(id, { ...row, status, error: null, updated_at });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (normalized.startsWith("INSERT INTO users")) {
          const [id, email, password_hash, oauth_subject, created_at] =
            bound as [string, string, string | null, string | null, string];
          for (const existing of users.values()) {
            if (existing.email === email) {
              throw new Error("UNIQUE constraint failed: users.email");
            }
            if (
              oauth_subject != null &&
              existing.oauth_subject === oauth_subject
            ) {
              throw new Error("UNIQUE constraint failed: users.oauth_subject");
            }
          }
          users.set(id, {
            id,
            email,
            password_hash,
            oauth_subject,
            created_at,
            disabled_at: null,
          });
        } else if (normalized.startsWith("UPDATE users SET disabled_at =")) {
          const [disabled_at, id] = bound as [string | null, string];
          const u = users.get(id);
          if (u) users.set(id, { ...u, disabled_at });
        } else if (normalized.startsWith("DELETE FROM users WHERE id =")) {
          const id = bound[0] as string;
          if (!users.has(id)) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          // FK CASCADE from users: decks (+ materials/jobs/cards/schedules/logs),
          // subjects, secrets, study prefs/days, export_jobs.
          for (const [deckId, deck] of [...decks.entries()]) {
            if (deck.user_id !== id) continue;
            for (const [mid, material] of [...materials.entries()]) {
              if (material.deck_id !== deckId) continue;
              for (const [jid, job] of [...generationJobs.entries()]) {
                if (job.material_id === mid) generationJobs.delete(jid);
              }
              materials.delete(mid);
            }
            for (const [cid, card] of [...cards.entries()]) {
              if (card.deck_id !== deckId) continue;
              cards.delete(cid);
              schedules.delete(cid);
              for (let i = reviewLogs.length - 1; i >= 0; i--) {
                if (reviewLogs[i].card_id === cid) reviewLogs.splice(i, 1);
              }
            }
            decks.delete(deckId);
          }
          for (const [sid, subject] of [...subjects.entries()]) {
            if (subject.user_id === id) subjects.delete(sid);
          }
          for (const [key, cover] of [...shelfCovers.entries()]) {
            if (cover.user_id === id) shelfCovers.delete(key);
          }
          userSecrets.delete(id);
          userStudyPrefs.delete(id);
          for (const key of [...userStudyDay.keys()]) {
            if (key.startsWith(`${id}\0`)) userStudyDay.delete(key);
          }
          for (const [jid, job] of [...exportJobs.entries()]) {
            if (job.user_id === id) exportJobs.delete(jid);
          }
          for (const [eid, event] of [...usageEvents.entries()]) {
            if (event.user_id === id) usageEvents.delete(eid);
          }
          users.delete(id);
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("UPDATE users SET oauth_subject =")) {
          const [oauth_subject, id] = bound as [string, string];
          const u = users.get(id);
          if (u) {
            for (const existing of users.values()) {
              if (
                existing.id !== id &&
                existing.oauth_subject === oauth_subject
              ) {
                throw new Error(
                  "UNIQUE constraint failed: users.oauth_subject",
                );
              }
            }
            users.set(id, { ...u, oauth_subject });
          }
        } else if (normalized.startsWith("INSERT INTO subjects")) {
          const [id, user_id, title, created_at] = bound as [
            string,
            string,
            string,
            string,
          ];
          subjects.set(id, { id, user_id, title, created_at });
        } else if (
          normalized.startsWith(
            "INSERT INTO shelf_covers (user_id, owner_kind, owner_id, photo_id, image_url, photographer_name, photographer_url, photo_html_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, owner_kind, owner_id) DO UPDATE SET",
          )
        ) {
          const [
            user_id,
            owner_kind,
            owner_id,
            photo_id,
            image_url,
            photographer_name,
            photographer_url,
            photo_html_url,
          ] = bound as [
            string,
            string,
            string,
            string,
            string,
            string,
            string,
            string,
          ];
          shelfCovers.set(shelfCoverKey(user_id, owner_kind, owner_id), {
            user_id,
            owner_kind,
            owner_id,
            photo_id,
            image_url,
            photographer_name,
            photographer_url,
            photo_html_url,
          });
        } else if (
          normalized.startsWith("DELETE FROM shelf_covers WHERE user_id =")
        ) {
          const [userId, ownerKind, ownerId] = bound as [string, string, string];
          const key = shelfCoverKey(userId, ownerKind, ownerId);
          const had = shelfCovers.delete(key);
          return { success: true, meta: { changes: had ? 1 : 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "INSERT INTO calendar_connections (user_id, refresh_ciphertext, scopes, updated_at) VALUES",
          )
        ) {
          const [user_id, refresh_ciphertext, scopes, updated_at] = bound as [
            string,
            string,
            string,
            string,
          ];
          calendarConnections.set(user_id, {
            user_id,
            refresh_ciphertext,
            scopes,
            updated_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE calendar_connections SET refresh_ciphertext =",
          )
        ) {
          const [refresh_ciphertext, scopes, updated_at, user_id] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = calendarConnections.get(user_id);
          if (!row) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          calendarConnections.set(user_id, {
            ...row,
            refresh_ciphertext,
            scopes,
            updated_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "DELETE FROM calendar_connections WHERE user_id =",
          )
        ) {
          const had = calendarConnections.delete(bound[0] as string);
          return { success: true, meta: { changes: had ? 1 : 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "INSERT INTO calendar_subject_links (user_id, cluster_key, subject_id, created_at) VALUES",
          )
        ) {
          const [user_id, cluster_key, subject_id, created_at] = bound as [
            string,
            string,
            string,
            string,
          ];
          calendarSubjectLinks.set(calendarLinkKey(user_id, cluster_key), {
            user_id,
            cluster_key,
            subject_id,
            created_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "DELETE FROM calendar_subject_links WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          let changes = 0;
          for (const key of [...calendarSubjectLinks.keys()]) {
            if (key.startsWith(`${userId}\0`)) {
              calendarSubjectLinks.delete(key);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } } as D1Result;
        } else if (
          normalized.startsWith(
            "INSERT INTO calendar_dismissals (user_id, cluster_key, created_at) VALUES",
          )
        ) {
          const [user_id, cluster_key, created_at] = bound as [
            string,
            string,
            string,
          ];
          calendarDismissals.set(calendarLinkKey(user_id, cluster_key), {
            user_id,
            cluster_key,
            created_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "DELETE FROM calendar_dismissals WHERE user_id =",
          )
        ) {
          const userId = bound[0] as string;
          let changes = 0;
          for (const key of [...calendarDismissals.keys()]) {
            if (key.startsWith(`${userId}\0`)) {
              calendarDismissals.delete(key);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } } as D1Result;
        } else if (normalized.startsWith("UPDATE subjects SET title =")) {
          const [title, id, userId] = bound as [string, string, string];
          const row = subjects.get(id);
          if (row && row.user_id === userId) {
            subjects.set(id, { ...row, title });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (normalized.startsWith("DELETE FROM subjects WHERE id =")) {
          const id = bound[0] as string;
          const userId = bound[1] as string | undefined;
          const row = subjects.get(id);
          if (!row || (userId != null && row.user_id !== userId)) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          subjects.delete(id);
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("UPDATE decks SET title =")) {
          const [title, id, userId] = bound as [string, string, string];
          const row = decks.get(id);
          if (row && row.user_id === userId) {
            decks.set(id, { ...row, title });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (normalized.startsWith("DELETE FROM decks WHERE id =")) {
          const id = bound[0] as string;
          const userId = bound[1] as string | undefined;
          const row = decks.get(id);
          if (!row || (userId != null && row.user_id !== userId)) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          // FK cascade: materials → jobs; cards → schedules + review_logs.
          for (const [mid, material] of [...materials.entries()]) {
            if (material.deck_id !== id) continue;
            for (const [jid, job] of [...generationJobs.entries()]) {
              if (job.material_id === mid) generationJobs.delete(jid);
            }
            materials.delete(mid);
          }
          for (const [cid, card] of [...cards.entries()]) {
            if (card.deck_id !== id) continue;
            cards.delete(cid);
            schedules.delete(cid);
            for (let i = reviewLogs.length - 1; i >= 0; i--) {
              if (reviewLogs[i].card_id === cid) reviewLogs.splice(i, 1);
            }
          }
          decks.delete(id);
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("DELETE FROM review_logs WHERE card_id =")) {
          const cardId = bound[0] as string;
          let changes = 0;
          for (let i = reviewLogs.length - 1; i >= 0; i--) {
            if (reviewLogs[i].card_id === cardId) {
              reviewLogs.splice(i, 1);
              changes += 1;
            }
          }
          return { success: true, meta: { changes } } as D1Result;
        } else if (
          normalized.startsWith("DELETE FROM card_schedules WHERE card_id =")
        ) {
          const cardId = bound[0] as string;
          const had = schedules.delete(cardId);
          return { success: true, meta: { changes: had ? 1 : 0 } } as D1Result;
        } else if (
          normalized.startsWith("DELETE FROM cards WHERE id =") &&
          normalized.includes("status =")
        ) {
          const cardId = bound[0] as string;
          const status = bound[1] as string;
          const row = cards.get(cardId);
          if (!row || row.status !== status) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          cards.delete(cardId);
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("INSERT INTO decks")) {
          // Legacy: (id, user_id, title, subject_hint, created_at) — subject_id null.
          // Current worker SQL uses NULL for subject_hint → 4 binds.
          // With subject_id column: bind subject_id when present in SQL.
          if (normalized.includes("subject_id")) {
            if (
              normalized.includes("subject_hint") &&
              /VALUES \(\?, \?, \?, NULL, \?, \?\)/.test(normalized)
            ) {
              const [id, user_id, title, subject_id, created_at] = bound as [
                string,
                string,
                string,
                string | null,
                string,
              ];
              decks.set(id, {
                id,
                user_id,
                title,
                subject_hint: null,
                subject_id,
                created_at,
              });
            } else if (normalized.includes("subject_hint")) {
              const [id, user_id, title, subject_hint, subject_id, created_at] =
                bound as [
                  string,
                  string,
                  string,
                  string | null,
                  string | null,
                  string,
                ];
              decks.set(id, {
                id,
                user_id,
                title,
                subject_hint,
                subject_id,
                created_at,
              });
            } else {
              const [id, user_id, title, subject_id, created_at] = bound as [
                string,
                string,
                string,
                string | null,
                string,
              ];
              decks.set(id, {
                id,
                user_id,
                title,
                subject_hint: null,
                subject_id,
                created_at,
              });
            }
          } else if (
            normalized.includes("subject_hint") &&
            /VALUES \(\?, \?, \?, NULL, \?\)/.test(normalized)
          ) {
            const [id, user_id, title, created_at] = bound as [
              string,
              string,
              string,
              string,
            ];
            decks.set(id, {
              id,
              user_id,
              title,
              subject_hint: null,
              subject_id: null,
              created_at,
            });
          } else {
            const [id, user_id, title, subject_hint, created_at] = bound as [
              string,
              string,
              string,
              string | null,
              string,
            ];
            decks.set(id, {
              id,
              user_id,
              title,
              subject_hint,
              subject_id: null,
              created_at,
            });
          }
        } else if (normalized.startsWith("INSERT INTO materials")) {
          if (
            normalized.includes("content_hash") &&
            normalized.includes("source_role")
          ) {
            const [
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              content_hash,
              source_role,
            ] = bound as [
              string,
              string,
              string,
              string | null,
              string | null,
              number | null,
              string,
              string,
              string | null,
              string,
            ];
            materials.set(id, {
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              content_hash,
              source_role,
            });
          } else if (normalized.includes("content_hash")) {
            const [
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              content_hash,
            ] = bound as [
              string,
              string,
              string,
              string | null,
              string | null,
              number | null,
              string,
              string,
              string | null,
            ];
            materials.set(id, {
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              content_hash,
              source_role: "lecture",
            });
          } else if (normalized.includes("source_role")) {
            const [
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              source_role,
            ] = bound as [
              string,
              string,
              string,
              string | null,
              string | null,
              number | null,
              string,
              string,
              string,
            ];
            materials.set(id, {
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              source_role,
            });
          } else {
            const [
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
            ] = bound as [
              string,
              string,
              string,
              string | null,
              string | null,
              number | null,
              string,
              string,
            ];
            materials.set(id, {
              id,
              deck_id,
              kind,
              r2_key,
              filename,
              page_count,
              status,
              created_at,
              source_role: "lecture",
            });
          }
        } else if (
          normalized.startsWith("UPDATE materials SET source_role = ? WHERE id = ?")
        ) {
          const [source_role, id] = bound as [string, string];
          const row = materials.get(id);
          if (row) materials.set(id, { ...row, source_role });
        } else if (
          normalized.startsWith(
            "UPDATE materials SET status = ?, content_hash = ? WHERE id = ? AND status = ?",
          )
        ) {
          const [status, content_hash, id, expected] = bound as [
            string,
            string | null,
            string,
            string,
          ];
          const row = materials.get(id);
          if (row && row.status === expected) {
            materials.set(id, { ...row, status, content_hash });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE materials SET status = ? WHERE id = ? AND status = ?",
          )
        ) {
          const [status, id, expected] = bound as [string, string, string];
          const row = materials.get(id);
          if (row && row.status === expected) {
            materials.set(id, { ...row, status });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (normalized.startsWith("UPDATE materials SET status =")) {
          const [status, id] = bound as [string, string];
          const row = materials.get(id);
          if (row) materials.set(id, { ...row, status });
        } else if (normalized.startsWith("DELETE FROM materials WHERE id =")) {
          // Material hard-delete: cascade jobs; SET NULL job_id on remaining cards.
          const materialId = bound[0] as string;
          if (!materials.has(materialId)) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          const deletedJobIds = new Set<string>();
          for (const [jid, job] of [...generationJobs.entries()]) {
            if (job.material_id !== materialId) continue;
            deletedJobIds.add(jid);
            generationJobs.delete(jid);
          }
          for (const [cid, card] of [...cards.entries()]) {
            if (!card.job_id || !deletedJobIds.has(card.job_id)) continue;
            cards.set(cid, { ...card, job_id: null });
          }
          materials.delete(materialId);
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith("INSERT OR IGNORE INTO usage_events") ||
          normalized.startsWith("INSERT INTO usage_events")
        ) {
          const kind = normalized.includes("'regen'") ? "regen" : "generation";
          const isRegen = kind === "regen";
          const [
            id,
            user_id,
            jobOrPath,
            pathOrProvider,
            providerOrTp,
            tpOrTc,
            tcOrTt,
            ttOrCreated,
            createdOrMissing,
          ] = bound as [
            string,
            string,
            string | null,
            string | null,
            string | null,
            number | null | string,
            number | null,
            number | null | string,
            string | undefined,
          ];
          let job_id: string | null;
          let path: string | null;
          let provider: string | null;
          let tokens_prompt: number | null;
          let tokens_completion: number | null;
          let tokens_total: number | null;
          let created_at: string;
          if (isRegen) {
            job_id = null;
            path = jobOrPath;
            provider = pathOrProvider;
            tokens_prompt =
              typeof providerOrTp === "number" ? providerOrTp : null;
            tokens_completion = typeof tpOrTc === "number" ? tpOrTc : null;
            tokens_total =
              typeof tcOrTt === "number" ? tcOrTt : null;
            created_at = String(ttOrCreated);
          } else {
            job_id = jobOrPath;
            path = pathOrProvider;
            provider = typeof providerOrTp === "string" ? providerOrTp : null;
            tokens_prompt = typeof tpOrTc === "number" ? tpOrTc : null;
            tokens_completion =
              typeof tcOrTt === "number" ? tcOrTt : null;
            tokens_total =
              typeof ttOrCreated === "number" ? ttOrCreated : null;
            created_at = String(createdOrMissing);
          }
          if (
            job_id != null &&
            [...usageEvents.values()].some((e) => e.job_id === job_id)
          ) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          usageEvents.set(id, {
            id,
            user_id,
            job_id,
            kind,
            path,
            provider,
            tokens_prompt,
            tokens_completion,
            tokens_total,
            created_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("INSERT INTO generation_jobs")) {
          const [
            id,
            material_id,
            status,
            error,
            coverage_json,
            created_at,
            finished_at,
            figure_extract_mode,
            topic_hints_json,
          ] = bound as [
            string,
            string,
            string,
            string | null,
            string | null,
            string,
            string | null,
            string | undefined,
            string | null | undefined,
          ];
          generationJobs.set(id, {
            id,
            material_id,
            status,
            error,
            coverage_json,
            progress_json: null,
            created_at,
            finished_at,
            figure_extract_mode: figure_extract_mode ?? "fast",
            topic_hints_json: topic_hints_json ?? null,
            avoid_patterns_json: null,
          });
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET avoid_patterns_json = ?, run_topic_hints_json = ? WHERE id =",
          )
        ) {
          const [avoid_patterns_json, run_topic_hints_json, id] = bound as [
            string | null,
            string | null,
            string,
          ];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, {
              ...row,
              avoid_patterns_json,
              run_topic_hints_json,
            });
          }
          return { success: true, meta: { changes: row ? 1 : 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = NULL, progress_json = NULL, finished_at = NULL WHERE id = ? AND status NOT IN",
          )
        ) {
          const [status, id] = bound as [string, string];
          const row = generationJobs.get(id);
          if (!row || row.status === "queued" || row.status === "running") {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, {
            ...row,
            status,
            error: null,
            coverage_json: null,
            progress_json: null,
            finished_at: null,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = NULL, progress_json = NULL, finished_at = NULL WHERE id =",
          )
        ) {
          const [status, id] = bound as [string, string];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, {
              ...row,
              status,
              error: null,
              coverage_json: null,
              progress_json: null,
              finished_at: null,
            });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = ?, finished_at = ?",
          )
        ) {
          const [status, coverage_json, finished_at, id] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, {
              ...row,
              status,
              error: null,
              coverage_json,
              finished_at,
            });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET progress_json = ? WHERE id = ? AND status = ? AND progress_json IS NULL",
          )
        ) {
          const [progress_json, id, requiredStatus] = bound as [
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (
            !row ||
            row.status !== requiredStatus ||
            row.progress_json != null
          ) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, { ...row, progress_json });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET progress_json = ? WHERE id = ? AND status = ? AND progress_json = ?",
          )
        ) {
          const [progress_json, id, requiredStatus, expectedProgress] =
            bound as [string, string, string, string];
          const row = generationJobs.get(id);
          if (
            !row ||
            row.status !== requiredStatus ||
            row.progress_json !== expectedProgress
          ) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, { ...row, progress_json });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET progress_json = ? WHERE id = ?",
          )
        ) {
          const [progress_json, id] = bound as [string, string];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, { ...row, progress_json });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL, progress_json = ? WHERE id = ? AND status =",
          )
        ) {
          const [status, progress_json, id, requiredStatus] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (!row || row.status !== requiredStatus) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, {
            ...row,
            status,
            error: null,
            progress_json,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL, finished_at = ?",
          )
        ) {
          const [status, finished_at, id] = bound as [string, string, string];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, {
              ...row,
              status,
              error: null,
              finished_at,
            });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL WHERE id = ? AND status =",
          )
        ) {
          const [status, id, requiredStatus] = bound as [
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (!row || row.status !== requiredStatus) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, { ...row, status, error: null });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = NULL WHERE id =",
          )
        ) {
          const [status, id] = bound as [string, string];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, { ...row, status, error: null });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET coverage_json = ? WHERE id = ?",
          )
        ) {
          const [coverage_json, id] = bound as [string, string];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, { ...row, coverage_json });
          }
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ?",
          ) &&
          normalized.includes(
            "WHERE id = ? AND status = ? AND progress_json IS NULL",
          )
        ) {
          const [status, error, finished_at, id, requiredStatus] = bound as [
            string,
            string,
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (
            !row ||
            row.status !== requiredStatus ||
            row.progress_json != null
          ) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, {
            ...row,
            status,
            error,
            finished_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ?",
          ) &&
          normalized.includes(
            "WHERE id = ? AND status = ? AND progress_json = ?",
          )
        ) {
          const [status, error, finished_at, id, requiredStatus, expectedProgress] =
            bound as [string, string, string, string, string, string];
          const row = generationJobs.get(id);
          if (
            !row ||
            row.status !== requiredStatus ||
            row.progress_json !== expectedProgress
          ) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, {
            ...row,
            status,
            error,
            finished_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ?",
          ) &&
          normalized.includes("WHERE id = ? AND status = ?")
        ) {
          const [status, error, finished_at, id, requiredStatus] = bound as [
            string,
            string,
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (!row || row.status !== requiredStatus) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          generationJobs.set(id, {
            ...row,
            status,
            error,
            finished_at,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ?",
          )
        ) {
          const [status, error, finished_at, id] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = generationJobs.get(id);
          if (row) {
            generationJobs.set(id, {
              ...row,
              status,
              error,
              finished_at,
            });
          }
          return {
            success: true,
            meta: { changes: row ? 1 : 0 },
          } as D1Result;
        } else if (normalized.startsWith("INSERT INTO user_secrets")) {
          const [user_id, provider, ciphertext, model, created_at, updated_at] =
            bound as [string, string, string, string | null, string, string];
          const existing = userSecrets.get(user_id);
          userSecrets.set(user_id, {
            user_id,
            provider,
            ciphertext,
            model,
            created_at: existing?.created_at ?? created_at,
            updated_at,
          });
        } else if (normalized.startsWith("DELETE FROM user_secrets WHERE user_id =")) {
          const id = bound[0] as string;
          const had = userSecrets.delete(id);
          return { success: true, meta: { changes: had ? 1 : 0 } } as D1Result;
        } else if (normalized.startsWith("INSERT INTO user_study_prefs")) {
          const [
            user_id,
            intro_budget,
            review_budget,
            r_floor,
            desired_retention,
            enable_fuzz,
            updated_at,
          ] = bound as [
            string,
            number,
            number,
            number,
            number,
            number,
            string,
          ];
          const existing = userStudyPrefs.get(user_id);
          if (normalized.includes("DO NOTHING") && existing) {
            // keep existing
          } else if (existing && normalized.includes("DO UPDATE SET")) {
            userStudyPrefs.set(user_id, {
              ...existing,
              intro_budget,
              review_budget,
              r_floor,
              desired_retention,
              enable_fuzz,
              updated_at,
            });
          } else {
            userStudyPrefs.set(user_id, {
              user_id,
              intro_budget,
              review_budget,
              r_floor,
              desired_retention,
              enable_fuzz,
              fsrs_w_json: existing?.fsrs_w_json ?? null,
              fsrs_last_optimized_at: existing?.fsrs_last_optimized_at ?? null,
              fsrs_optimize_pending: existing?.fsrs_optimize_pending ?? 0,
              updated_at,
            });
          }
        } else if (
          normalized.startsWith("UPDATE user_study_prefs") &&
          normalized.includes("fsrs_w_json") &&
          normalized.includes("fsrs_optimize_pending = 0")
        ) {
          // saveFsrsWeights: bind(w_json, last_at, updated_at, user_id)
          // resetFsrsWeights: bind(last_at, updated_at, user_id) with fsrs_w_json = NULL
          const row = userStudyPrefs.get(bound[bound.length - 1] as string);
          if (row) {
            if (normalized.includes("fsrs_w_json = NULL")) {
              const [last_at, updated_at, user_id] = bound as [
                string,
                string,
                string,
              ];
              userStudyPrefs.set(user_id, {
                ...row,
                fsrs_w_json: null,
                fsrs_optimize_pending: 0,
                fsrs_last_optimized_at: last_at,
                updated_at,
              });
            } else {
              const [w_json, last_at, updated_at, user_id] = bound as [
                string,
                string,
                string,
                string,
              ];
              userStudyPrefs.set(user_id, {
                ...row,
                fsrs_w_json: w_json,
                fsrs_optimize_pending: 0,
                fsrs_last_optimized_at: last_at,
                updated_at,
              });
            }
          }
        } else if (
          normalized.startsWith("UPDATE user_study_prefs") &&
          normalized.includes("fsrs_optimize_pending =")
        ) {
          const [pending, updated_at, user_id] = bound as [
            number,
            string,
            string,
          ];
          const row = userStudyPrefs.get(user_id);
          if (row) {
            userStudyPrefs.set(user_id, {
              ...row,
              fsrs_optimize_pending: pending,
              updated_at,
            });
          }
        } else if (normalized.startsWith("INSERT INTO user_study_day")) {
          const [user_id, day] = bound as [string, string];
          const key = `${user_id}\0${day}`;
          const existing = userStudyDay.get(key);
          userStudyDay.set(key, {
            user_id,
            day,
            intros_used: (existing?.intros_used ?? 0) + 1,
          });
        } else if (normalized.startsWith("INSERT INTO cards")) {
          const [
            id,
            deck_id,
            job_id,
            type,
            front_json,
            back_json,
            media_r2_keys_json,
            provenance_json,
            status,
            created_at,
            updated_at,
          ] = bound as [
            string,
            string,
            string | null,
            string,
            string,
            string,
            string | null,
            string | null,
            string,
            string,
            string,
          ];
          cards.set(id, {
            id,
            deck_id,
            job_id,
            type,
            front_json,
            back_json,
            media_r2_keys_json,
            provenance_json,
            status,
            created_at,
            updated_at,
          });
        } else if (
          normalized.startsWith(
            "UPDATE cards SET type = ?, front_json = ?, back_json = ?, provenance_json = ?, media_r2_keys_json = NULL, updated_at = ?",
          )
        ) {
          const [type, front_json, back_json, provenance_json, updated_at, id] =
            bound as [string, string, string, string, string, string];
          const row = cards.get(id);
          if (row) {
            cards.set(id, {
              ...row,
              type,
              front_json,
              back_json,
              provenance_json,
              media_r2_keys_json: null,
              updated_at,
            });
          }
        } else if (
          normalized.startsWith(
            "UPDATE cards SET type = ?, front_json = ?, back_json = ?, updated_at = ?",
          )
        ) {
          const [type, front_json, back_json, updated_at, id] = bound as [
            string,
            string,
            string,
            string,
            string,
          ];
          const row = cards.get(id);
          if (row) {
            cards.set(id, {
              ...row,
              type,
              front_json,
              back_json,
              updated_at,
            });
          }
        } else if (
          normalized.startsWith(
            "UPDATE cards SET deck_id = ?, updated_at = ? WHERE id = ?",
          )
        ) {
          const [deck_id, updated_at, id] = bound as [string, string, string];
          const row = cards.get(id);
          if (row) {
            cards.set(id, { ...row, deck_id, updated_at });
          }
        } else if (
          normalized.startsWith(
            "UPDATE cards SET status = ?, updated_at = ? WHERE job_id = ? AND status = ?",
          )
        ) {
          const [status, updated_at, jobId, expected] = bound as [
            string,
            string,
            string,
            string,
          ];
          let changes = 0;
          for (const [id, card] of [...cards.entries()]) {
            if (card.job_id !== jobId || card.status !== expected) continue;
            cards.set(id, { ...card, status, updated_at });
            changes += 1;
          }
          return { success: true, meta: { changes } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE cards SET status = ?, updated_at = ? WHERE status = ?",
          ) &&
          normalized.includes("job_id IN") &&
          normalized.includes("FROM generation_jobs")
        ) {
          // Accept-all sibling reject: draft cards on other owned needs_review jobs.
          const [
            status,
            updated_at,
            expected,
            userId,
            jobStatus,
            excludeJobId,
          ] = bound as [string, string, string, string, string, string];
          const siblingJobIds = new Set<string>();
          for (const job of generationJobs.values()) {
            if (job.id === excludeJobId || job.status !== jobStatus) continue;
            const material = materials.get(job.material_id);
            if (!material) continue;
            const deck = decks.get(material.deck_id);
            if (!deck || deck.user_id !== userId) continue;
            siblingJobIds.add(job.id);
          }
          let changes = 0;
          for (const [id, card] of [...cards.entries()]) {
            if (card.status !== expected) continue;
            if (!card.job_id || !siblingJobIds.has(card.job_id)) continue;
            cards.set(id, { ...card, status, updated_at });
            changes += 1;
          }
          return { success: true, meta: { changes } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE cards SET status = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND status = ?",
          )
        ) {
          const [status, reject_reason, updated_at, id, expected] = bound as [
            string,
            string | null,
            string,
            string,
            string,
          ];
          const row = cards.get(id);
          if (row && row.status === expected) {
            cards.set(id, { ...row, status, reject_reason, updated_at });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
          )
        ) {
          const [status, updated_at, id, expected] = bound as [
            string,
            string,
            string,
            string,
          ];
          const row = cards.get(id);
          if (row && row.status === expected) {
            cards.set(id, { ...row, status, updated_at });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          return { success: true, meta: { changes: 0 } } as D1Result;
        } else if (
          normalized.startsWith(
            "UPDATE cards SET status = ?, updated_at = ? WHERE id =",
          )
        ) {
          const [status, updated_at, id] = bound as [string, string, string];
          const row = cards.get(id);
          if (row) cards.set(id, { ...row, status, updated_at });
        } else if (
          normalized.startsWith("DELETE FROM cards WHERE job_id IN") &&
          normalized.includes("status IN ('draft', 'rejected')")
        ) {
          // Material hard-delete: remove draft/rejected cards for the material's jobs.
          const jobIds = new Set(bound as string[]);
          for (const [id, card] of [...cards.entries()]) {
            if (!card.job_id || !jobIds.has(card.job_id)) continue;
            if (card.status !== "draft" && card.status !== "rejected") continue;
            cards.delete(id);
            schedules.delete(id);
          }
        } else if (normalized.startsWith("DELETE FROM cards WHERE job_id =")) {
          const jobId = bound[0] as string;
          for (const [id, card] of [...cards.entries()]) {
            if (card.job_id !== jobId) continue;
            cards.delete(id);
            schedules.delete(id);
          }
        } else if (normalized.startsWith("INSERT INTO review_logs")) {
          const [
            id,
            card_id,
            rating,
            scheduled_days,
            elapsed_days,
            reviewed_at,
            state_json,
          ] = bound as [string, string, number, number, number, string, string];
          reviewLogs.push({
            id,
            card_id,
            rating,
            scheduled_days,
            elapsed_days,
            reviewed_at,
            state_json,
          });
        } else if (
          normalized.startsWith("UPDATE card_schedules SET") &&
          normalized.includes("due =") &&
          !normalized.includes("stability") &&
          normalized.includes("WHERE card_id =")
        ) {
          const [due, card_id] = bound as [string, string];
          const existing = schedules.get(card_id);
          if (!existing) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          schedules.set(card_id, { ...existing, due });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith("UPDATE card_schedules SET") &&
          normalized.includes("WHERE card_id =")
        ) {
          const [
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
            card_id,
          ] = bound as [
            string,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            string | null,
            string,
          ];
          const existing = schedules.get(card_id);
          if (!existing) {
            return { success: true, meta: { changes: 0 } } as D1Result;
          }
          schedules.set(card_id, {
            card_id,
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (
          normalized.startsWith("INSERT INTO card_schedules") &&
          normalized.includes("ON CONFLICT(card_id) DO UPDATE")
        ) {
          const [
            card_id,
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
          ] = bound as [
            string,
            string,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            string | null,
          ];
          schedules.set(card_id, {
            card_id,
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
          });
          return { success: true, meta: { changes: 1 } } as D1Result;
        } else if (normalized.startsWith("INSERT INTO card_schedules")) {
          // Conditional accept: INSERT…SELECT WHERE status/updated_at match CAS.
          if (normalized.includes("SELECT c.id")) {
            const [
              due,
              stability,
              difficulty,
              elapsed_days,
              scheduled_days,
              learning_steps,
              reps,
              lapses,
              state,
              last_review,
              card_id,
              status,
              updated_at,
            ] = bound as [
              string,
              number,
              number,
              number,
              number,
              number,
              number,
              number,
              number,
              string | null,
              string,
              string,
              string,
            ];
            const card = cards.get(card_id);
            if (
              !card ||
              card.status !== status ||
              card.updated_at !== updated_at
            ) {
              return { success: true, meta: { changes: 0 } } as D1Result;
            }
            if (schedules.has(card_id)) {
              throw new Error(
                "UNIQUE constraint failed: card_schedules.card_id",
              );
            }
            schedules.set(card_id, {
              card_id,
              due,
              stability,
              difficulty,
              elapsed_days,
              scheduled_days,
              learning_steps,
              reps,
              lapses,
              state,
              last_review,
            });
            return { success: true, meta: { changes: 1 } } as D1Result;
          }
          const [
            card_id,
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
          ] = bound as [
            string,
            string,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            string | null,
          ];
          if (schedules.has(card_id)) {
            throw new Error("UNIQUE constraint failed: card_schedules.card_id");
          }
          schedules.set(card_id, {
            card_id,
            due,
            stability,
            difficulty,
            elapsed_days,
            scheduled_days,
            learning_steps,
            reps,
            lapses,
            state,
            last_review,
          });
        }
        const gamificationRunHit = gamificationRun(
          gamificationState,
          normalized,
          bound,
        );
        if (gamificationRunHit !== null) return gamificationRunHit;
        const atlasRunHit = atlasRun(atlasState, normalized, bound);
        if (atlasRunHit !== null) return atlasRunHit;
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    };
    return stmt;
  }

  async function batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results: D1Result[] = [];
    for (const stmt of statements) {
      results.push(await stmt.run());
    }
    return results;
  }

  const env: TestEnv = {
    DB: { prepare, batch } as unknown as D1Database,
    AI: {
      run: async () => {
        throw new Error("AI.run not stubbed in test env");
      },
    } as unknown as Ai,
    MATERIALS: {
      async put(key: string, value: string | ArrayBuffer | ReadableStream) {
        if (typeof value === "string") {
          r2.set(key, value);
        } else if (value instanceof ArrayBuffer) {
          r2.set(key, value);
        } else {
          r2.set(key, await new Response(value).arrayBuffer());
        }
      },
      async head(key: string) {
        const v = r2.get(key);
        if (v === undefined) return null;
        const size =
          typeof v === "string"
            ? new TextEncoder().encode(v).byteLength
            : v.byteLength;
        return { size, key };
      },
      async get(key: string) {
        const v = r2.get(key);
        if (v === undefined) return null;
        const bytes =
          typeof v === "string"
            ? new TextEncoder().encode(v)
            : new Uint8Array(v);
        return {
          size: bytes.byteLength,
          text: async () =>
            typeof v === "string" ? v : new TextDecoder().decode(v),
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          body: bytes,
        };
      },
      async delete(key: string) {
        r2.delete(key);
      },
    } as unknown as R2Bucket,
    SESSIONS: {
      async get(key: string) {
        return sessions.get(key) ?? null;
      },
      async put(key: string, value: string) {
        sessions.set(key, value);
      },
      async delete(key: string) {
        sessions.delete(key);
      },
    } as unknown as KVNamespace,
    GENERATE_QUEUE: {
      send: async (body: unknown) => {
        queueMessages.push(body);
      },
    } as unknown as Queue,
    ...(opts?.exportQueue === false
      ? {}
      : {
          EXPORT_QUEUE: {
            send: async (body: unknown) => {
              exportQueueMessages.push(body);
            },
          } as unknown as Queue,
        }),
    APP_URL: "http://localhost",
    ASSETS: {
      fetch: async () => new Response("test assets missing", { status: 404 }),
    } as unknown as Fetcher,
    SECRETS_WRAP_KEY: wrapKey,
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "sugarplum-materials",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    ADMIN_EMAILS: opts?.adminEmails,
    seedUser(row) {
      users.set(row.id, {
        ...row,
        disabled_at: row.disabled_at ?? null,
      });
    },
    seedSubject(row) {
      subjects.set(row.id, row);
    },
    seedDeck(row) {
      decks.set(row.id, {
        ...row,
        subject_id: row.subject_id ?? null,
      });
    },
    seedMaterial(row) {
      materials.set(row.id, row);
    },
    seedSession(id, userId, ttlMs = 60_000) {
      const record: SessionRecord = {
        userId,
        expiresAt: Date.now() + ttlMs,
      };
      sessions.set(id, JSON.stringify(record));
    },
    seedUserSecret(row) {
      userSecrets.set(row.user_id, row);
    },
    seedUserStudyPrefs(row) {
      userStudyPrefs.set(row.user_id, row);
    },
    seedUserStudyDay(row) {
      userStudyDay.set(`${row.user_id}\0${row.day}`, row);
    },
    seedCard(row) {
      cards.set(row.id, row);
    },
    seedGenerationJob(row) {
      generationJobs.set(row.id, row);
    },
    seedUsageEvent(row) {
      usageEvents.set(row.id, row);
    },
    seedExportJob(row) {
      exportJobs.set(row.id, row);
    },
    seedSchedule(row) {
      schedules.set(row.card_id, row);
    },
    seedReviewLog(row) {
      reviewLogs.push(row);
    },
    seedR2(key, value) {
      r2.set(key, value);
    },
    getMaterials: () => [...materials.values()],
    getExportJobs: () => [...exportJobs.values()],
    getGenerationJobs: () => [...generationJobs.values()],
    getUserSecrets: () => [...userSecrets.values()],
    getUserStudyPrefs: () => [...userStudyPrefs.values()],
    getCards: () => [...cards.values()],
    getSchedules: () => [...schedules.values()],
    getReviewLogs: () => [...reviewLogs],
    getUsageEvents: () => [...usageEvents.values()],
    getFreeGenUsageRows: () => [...freeGenUsage.values()],
    getQueueMessages: () => [...queueMessages],
    getExportQueueMessages: () => [...exportQueueMessages],
    getR2Keys: () => [...r2.keys()],
    getR2: (key: string) => r2.get(key),
    getAchievementCompletions: () => [
      ...gamificationState.achievementCompletions.values(),
    ],
    getXpLedger: () => [...gamificationState.xpLedger],
    seedAchievementDef: (row) => {
      gamificationState.achievementDefs.set(row.id, row);
    },
    getProgressWrites: () => [...gamificationState.progressWrites],
    getUserGamification: (userId) =>
      gamificationState.userGamification.get(userId),
  };

  return env;
}
