import { Hono } from "hono";
import type { Env } from "../env";
import type { AuthVariables } from "../auth/session";
import { getDb } from "../db/client";
import { requireAdmin } from "./requireAdmin";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type AdminUserListItem = {
  id: string;
  email: string;
  created_at: string;
  google_linked: boolean;
  deckCount: number;
  cardCount: number;
  jobCount: number;
};

export const adminRoutes = new Hono<AppEnv>();

const LIST_USERS_SQL = `
SELECT u.id, u.email, u.created_at, u.oauth_subject,
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
      deck_count: number;
      card_count: number;
      job_count: number;
    }>();

  const users: AdminUserListItem[] = (results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    google_linked: row.oauth_subject != null,
    deckCount: row.deck_count,
    cardCount: row.card_count,
    jobCount: row.job_count,
  }));
  return c.json({ users });
});
