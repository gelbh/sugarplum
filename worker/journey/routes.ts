import { Hono } from "hono";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  loadJourneyGenerationStatus,
  type JourneyGenerationStatus,
} from "./generationStatus";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JourneyStatus = {
  deckCount: number;
  hasGenerationJob: boolean;
  openReviewJobId: string | null;
  pendingGenerationJobId: string | null;
  acceptedCount: number;
  dueCount: number;
};

export type { JourneyGenerationStatus };

export const journeyRoutes = new Hono<AppEnv>();

/** Job ids only for shell generation polling (no deck/card counts). */
// view-as: allow
journeyRoutes.get("/generation", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  return c.json(await loadJourneyGenerationStatus(db, userId));
});

/** Summary status for owner: decks, jobs, accepted/due cards. */
// view-as: allow
journeyRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const [deckRow, existsJob, generation, acceptedRow, dueRow] =
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
      loadJourneyGenerationStatus(db, userId),
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

  const res: JourneyStatus = {
    deckCount: deckRow?.count ?? 0,
    hasGenerationJob: !!existsJob,
    openReviewJobId: generation.openReviewJobId,
    pendingGenerationJobId: generation.pendingGenerationJobId,
    acceptedCount: acceptedRow?.count ?? 0,
    dueCount: dueRow?.count ?? 0,
  };
  return c.json(res);
});
