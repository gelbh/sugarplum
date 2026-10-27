import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JourneyStatus = {
  deckCount: number;
  hasGenerationJob: boolean;
  openReviewJobId: string | null;
  pendingGenerationJobId: string | null;
  acceptedCount: number;
  dueCount: number;
};

export const journeyRoutes = new Hono<AppEnv>();

/** Summary status for owner: decks, jobs, accepted/due cards. */
journeyRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const [deckRow, existsJob, openJob, pendingJob, acceptedRow, dueRow] =
    await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS count FROM decks WHERE user_id = ?")
        .bind(userId)
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT 1 FROM generation_jobs j INNER JOIN materials m ON m.id = j.material_id INNER JOIN decks d ON d.id = m.deck_id WHERE d.user_id = ? LIMIT 1",
        )
        .bind(userId)
        .first(),
      db
        .prepare(
          `SELECT j.id FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ? AND j.status = 'needs_review'
         AND EXISTS (SELECT 1 FROM cards c WHERE c.job_id = j.id AND c.status = 'draft')
       ORDER BY j.created_at DESC LIMIT 1`,
        )
        .bind(userId)
        .first<{ id: string }>(),
      db
        .prepare(
          `SELECT j.id, j.status FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ?
       ORDER BY j.created_at DESC LIMIT 1`,
        )
        .bind(userId)
        .first<{ id: string; status: string }>(),
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM cards c INNER JOIN decks d ON d.id = c.deck_id WHERE d.user_id = ? AND c.status = 'accepted'",
        )
        .bind(userId)
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?`,
        )
        .bind(userId, "accepted", now)
        .first<{ count: number }>(),
    ]);

  const pendingStatuses = new Set(["queued", "running", "failed"]);
  const res: JourneyStatus = {
    deckCount: deckRow?.count ?? 0,
    hasGenerationJob: !!existsJob,
    openReviewJobId: openJob?.id ?? null,
    pendingGenerationJobId:
      pendingJob && pendingStatuses.has(pendingJob.status)
        ? pendingJob.id
        : null,
    acceptedCount: acceptedRow?.count ?? 0,
    dueCount: dueRow?.count ?? 0,
  };
  return c.json(res);
});
