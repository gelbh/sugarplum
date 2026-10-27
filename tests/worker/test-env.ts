import type { Env } from "../../worker/env";

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  oauth_subject: string | null;
  created_at: string;
};

type SubjectRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
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
};

type UserSecretRow = {
  user_id: string;
  provider: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
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
  seedCard: (row: CardRow) => void;
  seedGenerationJob: (row: GenerationJobRow) => void;
  seedSchedule: (row: ScheduleRow) => void;
  seedReviewLog: (row: ReviewLogRow) => void;
  seedR2: (key: string, value: string) => void;
  getMaterials: () => MaterialRow[];
  getGenerationJobs: () => GenerationJobRow[];
  getUserSecrets: () => UserSecretRow[];
  getCards: () => CardRow[];
  getSchedules: () => ScheduleRow[];
  getReviewLogs: () => ReviewLogRow[];
  getQueueMessages: () => unknown[];
  getR2Keys: () => string[];
};

export function createTestEnv(opts?: {
  secretsWrapKey?: string | null;
}): TestEnv {
  const users = new Map<string, UserRow>();
  const subjects = new Map<string, SubjectRow>();
  const decks = new Map<string, DeckRow>();
  const materials = new Map<string, MaterialRow>();
  const generationJobs = new Map<string, GenerationJobRow>();
  const userSecrets = new Map<string, UserSecretRow>();
  const cards = new Map<string, CardRow>();
  const schedules = new Map<string, ScheduleRow>();
  const reviewLogs: ReviewLogRow[] = [];
  const sessions = new Map<string, string>();
  const r2 = new Map<string, string>();
  const queueMessages: unknown[] = [];

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
        if (normalized.startsWith("SELECT id FROM users WHERE email =")) {
          for (const u of users.values()) {
            if (u.email === bound[0]) return { id: u.id } as T;
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
        if (normalized.startsWith("SELECT id, email FROM users WHERE id =")) {
          const u = users.get(bound[0] as string);
          return u ? ({ id: u.id, email: u.email } as T) : null;
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
          normalized.includes("m.id =") &&
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
            "SELECT provider, ciphertext FROM user_secrets WHERE user_id =",
          )
        ) {
          const row = userSecrets.get(bound[0] as string);
          return row
            ? ({ provider: row.provider, ciphertext: row.ciphertext } as T)
            : null;
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
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
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
          normalized.includes("r2_key LIKE ?") &&
          normalized.includes("kind = 'image'") &&
          normalized.includes("ORDER BY r2_key")
        ) {
          const [deckId, likePrefix] = bound as [string, string];
          const prefix = likePrefix.endsWith("%")
            ? likePrefix.slice(0, -1)
            : likePrefix;
          const allowUploading = normalized.includes("'uploading'");
          const rows = [...materials.values()]
            .filter(
              (m) =>
                m.deck_id === deckId &&
                m.kind === "image" &&
                (m.status === "ready" ||
                  (allowUploading && m.status === "uploading")) &&
                m.r2_key != null &&
                m.r2_key.startsWith(prefix),
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
          normalized.includes("FROM materials WHERE deck_id =") &&
          normalized.includes("r2_key IS NOT NULL")
        ) {
          const rows = [...materials.values()]
            .filter((m) => m.deck_id === bound[0] && m.r2_key != null)
            .map((m) => ({ r2_key: m.r2_key }));
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
        if (normalized.includes("FROM materials WHERE deck_id =")) {
          const rows = [...materials.values()].filter(
            (m) => m.deck_id === bound[0],
          );
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
          const [userId, status, now] = bound as [string, string, string];
          const rows = [...cards.values()]
            .filter((c) => {
              if (c.status !== status) return false;
              const deck = decks.get(c.deck_id);
              if (!deck || deck.user_id !== userId) return false;
              const schedule = schedules.get(c.id);
              if (!schedule || schedule.due > now) return false;
              return true;
            })
            .map((c) => ({ ...c, due: schedules.get(c.id)!.due }))
            .sort((a, b) => a.due.localeCompare(b.due));
          return { results: rows as T[] };
        }
        // GET /api/study/struggling: accepted + schedule + again_14d; SQL filters survivors
        if (
          normalized.includes("FROM cards c") &&
          normalized.includes("INNER JOIN card_schedules s") &&
          normalized.includes("FROM review_logs rl") &&
          normalized.includes("c.status =")
        ) {
          const [since, userId, status] = bound as [string, string, string];
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
              return {
                id: c.id,
                deck_id: c.deck_id,
                front_json: c.front_json,
                lapses: schedule.lapses,
                difficulty: schedule.difficulty,
                due: schedule.due,
                last_review: schedule.last_review,
                again_14d,
              };
            })
            .filter((row) =>
              filterSurvivors ? row.lapses >= 2 || row.again_14d >= 2 : true,
            );
          return { results: rows as T[] };
        }
        return { results: [] };
      },
      async run(): Promise<D1Result> {
        if (normalized.startsWith("INSERT INTO users")) {
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
          });
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
          });
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
        } else if (normalized.startsWith("INSERT INTO generation_jobs")) {
          const [
            id,
            material_id,
            status,
            error,
            coverage_json,
            created_at,
            finished_at,
          ] = bound as [
            string,
            string,
            string,
            string | null,
            string | null,
            string,
            string | null,
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
          });
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
        } else if (normalized.startsWith("INSERT INTO user_secrets")) {
          const [user_id, provider, ciphertext, created_at, updated_at] =
            bound as [string, string, string, string, string];
          const existing = userSecrets.get(user_id);
          userSecrets.set(user_id, {
            user_id,
            provider,
            ciphertext,
            created_at: existing?.created_at ?? created_at,
            updated_at,
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
        const text =
          typeof value === "string"
            ? value
            : value instanceof ArrayBuffer
              ? new TextDecoder().decode(value)
              : await new Response(value).text();
        r2.set(key, text);
      },
      async get(key: string) {
        const v = r2.get(key);
        if (v === undefined) return null;
        const bytes = new TextEncoder().encode(v);
        return {
          text: async () => v,
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
    APP_URL: "http://localhost",
    SECRETS_WRAP_KEY: wrapKey,
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "sugarplum-materials",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key",
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    seedUser(row) {
      users.set(row.id, row);
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
    seedCard(row) {
      cards.set(row.id, row);
    },
    seedGenerationJob(row) {
      generationJobs.set(row.id, row);
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
    getGenerationJobs: () => [...generationJobs.values()],
    getUserSecrets: () => [...userSecrets.values()],
    getCards: () => [...cards.values()],
    getSchedules: () => [...schedules.values()],
    getReviewLogs: () => [...reviewLogs],
    getQueueMessages: () => [...queueMessages],
    getR2Keys: () => [...r2.keys()],
  };

  return env;
}
