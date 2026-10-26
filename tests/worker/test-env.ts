import type { Env } from "../../worker/env";

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  oauth_subject: string | null;
  created_at: string;
};

type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
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

type SessionRecord = { userId: string; expiresAt: number };

/** In-memory Worker bindings for route tests (no Miniflare). */
export type TestEnv = Env & {
  seedUser: (row: UserRow) => void;
  seedDeck: (row: DeckRow) => void;
  seedSession: (id: string, userId: string, ttlMs?: number) => void;
  getMaterials: () => MaterialRow[];
  getR2Keys: () => string[];
};

export function createTestEnv(): TestEnv {
  const users = new Map<string, UserRow>();
  const decks = new Map<string, DeckRow>();
  const materials = new Map<string, MaterialRow>();
  const sessions = new Map<string, string>();
  const r2 = new Map<string, string>();

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
        if (normalized.startsWith("SELECT id, email FROM users WHERE id =")) {
          const u = users.get(bound[0] as string);
          return u ? ({ id: u.id, email: u.email } as T) : null;
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
          return deck
            ? ({ id: deck.id, user_id: deck.user_id } as T)
            : null;
        }
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (
          normalized.includes("FROM decks WHERE user_id =") &&
          normalized.includes("ORDER BY created_at")
        ) {
          const rows = [...decks.values()]
            .filter((d) => d.user_id === bound[0])
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map(({ id, title, subject_hint, created_at }) => ({
              id,
              title,
              subject_hint,
              created_at,
            }));
          return { results: rows as T[] };
        }
        if (normalized.includes("FROM materials WHERE deck_id =")) {
          const rows = [...materials.values()].filter(
            (m) => m.deck_id === bound[0],
          );
          return { results: rows as T[] };
        }
        return { results: [] };
      },
      async run(): Promise<D1Result> {
        if (normalized.startsWith("INSERT INTO users")) {
          const [id, email, password_hash, , created_at] = bound as [
            string,
            string,
            string,
            null,
            string,
          ];
          users.set(id, {
            id,
            email,
            password_hash,
            oauth_subject: null,
            created_at,
          });
        } else if (normalized.startsWith("INSERT INTO decks")) {
          const [id, user_id, title, subject_hint, created_at] = bound as [
            string,
            string,
            string,
            string | null,
            string,
          ];
          decks.set(id, { id, user_id, title, subject_hint, created_at });
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
        }
        return { success: true, meta: { changes: 1 } } as D1Result;
      },
    };
    return stmt;
  }

  const env: TestEnv = {
    DB: { prepare } as unknown as D1Database,
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
        return {
          text: async () => v,
          arrayBuffer: async () => new TextEncoder().encode(v).buffer,
        };
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
    GENERATE_QUEUE: { send: async () => {} } as unknown as Queue,
    APP_URL: "http://localhost",
    SESSION_SECRET: "test-session-secret",
    SECRETS_WRAP_KEY: "test-wrap-key",
    seedUser(row) {
      users.set(row.id, row);
    },
    seedDeck(row) {
      decks.set(row.id, row);
    },
    seedSession(id, userId, ttlMs = 60_000) {
      const record: SessionRecord = {
        userId,
        expiresAt: Date.now() + ttlMs,
      };
      sessions.set(id, JSON.stringify(record));
    },
    getMaterials: () => [...materials.values()],
    getR2Keys: () => [...r2.keys()],
  };

  return env;
}
