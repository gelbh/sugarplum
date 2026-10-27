import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { requeueGeneration } from "./enqueue";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JobProgressPayload = {
  stage: string;
  current: number;
  total: number;
  percent: number;
  label: string;
};

export type JobPollRow = {
  id: string;
  material_id: string;
  status: string;
  error: string | null;
  coverage_json: string | null;
  progress_json: string | null;
  created_at: string;
  finished_at: string | null;
};

function parseProgressJson(
  raw: string | null,
): JobProgressPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as JobProgressPayload;
    if (
      typeof parsed.stage !== "string" ||
      typeof parsed.current !== "number" ||
      typeof parsed.total !== "number" ||
      typeof parsed.percent !== "number" ||
      typeof parsed.label !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const jobRoutes = new Hono<AppEnv>();

export type JobListItem = {
  id: string;
  status: string;
  draft_count: number;
  deck_title: string;
  filename: string | null;
  created_at: string;
};

/** List owner jobs that still have draft cards (newest first). */
jobRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);

  const { results } = await db
    .prepare(
      `SELECT j.id, j.status, j.created_at, d.title AS deck_title, m.filename,
              COUNT(c.id) AS draft_count
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       INNER JOIN cards c ON c.job_id = j.id AND c.status = 'draft'
       WHERE d.user_id = ?
       GROUP BY j.id
       ORDER BY j.created_at DESC`,
    )
    .bind(userId)
    .all<{
      id: string;
      status: string;
      created_at: string;
      deck_title: string;
      filename: string | null;
      draft_count: number;
    }>();

  const items: JobListItem[] = (results ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    draft_count: Number(row.draft_count),
    deck_title: row.deck_title,
    filename: row.filename,
    created_at: row.created_at,
  }));
  return c.json(items);
});

/** Poll generation job status (owner only). */
jobRoutes.get("/:id", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const row = await db
    .prepare(
      `SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json, j.created_at, j.finished_at
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<JobPollRow>();

  if (!row) throw new HTTPException(404, { message: "Job not found" });

  return c.json({
    id: row.id,
    material_id: row.material_id,
    status: row.status,
    error: row.error,
    coverage_json: row.coverage_json,
    progress: parseProgressJson(row.progress_json),
    created_at: row.created_at,
    finished_at: row.finished_at,
  });
});

/** Wipe job cards, reset to queued, and requeue generation (owner only). */
jobRoutes.post("/:id/regen", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const row = await db
    .prepare(
      `SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json, j.created_at, j.finished_at, m.deck_id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<JobPollRow & { deck_id: string }>();

  if (!row) throw new HTTPException(404, { message: "Job not found" });

  // Claim first so concurrent regens lose the race before any wipe.
  const claim = await db
    .prepare(
      `UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = NULL, progress_json = NULL, finished_at = NULL
       WHERE id = ? AND status NOT IN ('queued', 'running')`,
    )
    .bind("queued", jobId)
    .run();
  if (!claim.meta.changes) {
    throw new HTTPException(409, { message: "Job already in progress" });
  }

  await db.prepare("DELETE FROM cards WHERE job_id = ?").bind(jobId).run();

  try {
    await requeueGeneration(c.env, {
      jobId: row.id,
      materialId: row.material_id,
      deckId: row.deck_id,
    });
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const messageText =
      err instanceof Error ? err.message : "Failed to enqueue regeneration";
    await db
      .prepare(
        "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
      )
      .bind("failed", messageText, finishedAt, jobId)
      .run();
    throw new HTTPException(502, {
      message: "Could not enqueue regeneration; job marked failed",
    });
  }

  return c.json({
    id: row.id,
    material_id: row.material_id,
    status: "queued",
    error: null,
    coverage_json: null,
    progress: null,
    created_at: row.created_at,
    finished_at: null,
  });
});
