import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { serializeCard, type CardRow } from "../cards/routes";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type DueRow = CardRow & { due: string };

export const studyRoutes = new Hono<AppEnv>();

/**
 * Cards ready for study: accepted + schedule due <= now.
 * Drafts never appear here.
 */
studyRoutes.get("/due", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at,
              s.due
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?
       ORDER BY s.due ASC`,
    )
    .bind(userId, "accepted", now)
    .all<DueRow>();

  return c.json(
    (results ?? []).map((row) => ({
      ...serializeCard(row),
      due: row.due,
    })),
  );
});
