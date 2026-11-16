import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { acceptOwnedJobDrafts } from "./acceptOwnedJobDrafts";
import {
  acceptDraftCard,
  rejectOwnedSiblingDrafts,
} from "./ownership";
import {
  type CardRow,
  serializeCard,
} from "./serialize";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

/** List draft cards for a generation job (owner only). */
export const jobDraftRoutes = new Hono<AppEnv>();

jobDraftRoutes.get("/:id/drafts", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const job = await db
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!job) throw new HTTPException(404, { message: "Job not found" });

  const { results } = await db
    .prepare(
      `SELECT id, deck_id, job_id, type, front_json, back_json,
              media_r2_keys_json, provenance_json, status, created_at, updated_at
       FROM cards
       WHERE job_id = ? AND status = ?
       ORDER BY created_at ASC`,
    )
    .bind(jobId, "draft")
    .all<CardRow>();

  return c.json((results ?? []).map(serializeCard));
});

jobDraftRoutes.post("/:id/drafts/accept-all", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);
  const result = await acceptOwnedJobDrafts(db, {
    userId,
    jobId,
    mode: "all",
    acceptDraftCard,
    rejectOwnedSiblingDrafts,
    serializeCard,
  });
  return c.json({
    accepted: result.accepted,
    failed: result.failed,
    rejectedSiblingCount: result.rejectedSiblingCount,
    unlocks: result.unlocks,
  });
});

/** Accept only drafts that still pass Layer-1 quality when mapped from storage. */
jobDraftRoutes.post("/:id/drafts/accept-safe", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);
  const result = await acceptOwnedJobDrafts(db, {
    userId,
    jobId,
    mode: "safe",
    acceptDraftCard,
    rejectOwnedSiblingDrafts,
    serializeCard,
  });
  return c.json(result);
});
