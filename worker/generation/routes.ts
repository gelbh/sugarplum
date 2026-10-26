import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";

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
