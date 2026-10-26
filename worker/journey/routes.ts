import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JourneyStatus = {
  deckCount: number;
  hasGenerationJob: boolean;
  openReviewJobId: string | null;
  acceptedCount: number;
  dueCount: number;
};

export const journeyRoutes = new Hono<AppEnv>();

/** Summary status for owner: decks, jobs, accepted/due cards. */
journeyRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const deckRow = await db
    .prepare("SELECT COUNT(*) AS count FROM decks WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  const deckCount = deckRow?.count ?? 0;

  const existsJob = await db
    .prepare(
      "SELECT 1 FROM generation_jobs j INNER JOIN materials m ON m.id = j.material_id INNER JOIN decks d ON d.id = m.deck_id WHERE d.user_id = ? LIMIT 1",
    )
    .bind(userId)
    .first();
  const hasGenerationJob = !!existsJob;

  const openJob = await db
    .prepare(
      `SELECT j.id FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ? AND j.status = 'needs_review'
         AND EXISTS (SELECT 1 FROM cards c WHERE c.job_id = j.id AND c.status = 'draft')
       ORDER BY j.created_at DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: string }>();
  const openReviewJobId = openJob?.id ?? null;

  const acceptedRow = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM cards c INNER JOIN decks d ON d.id = c.deck_id WHERE d.user_id = ? AND c.status = 'accepted'",
    )
    .bind(userId)
    .first<{ count: number }>();
  const acceptedCount = acceptedRow?.count ?? 0;

  const dueRow = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?`,
    )
    .bind(userId, "accepted", now)
    .first<{ count: number }>();
  const dueCount = dueRow?.count ?? 0;

  const res: JourneyStatus = {
    deckCount,
    hasGenerationJob,
    openReviewJobId,
    acceptedCount,
    dueCount,
  };
  return c.json(res);
});

