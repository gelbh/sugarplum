import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { requeueGeneration } from "./enqueue";
import {
  isRejectReason,
  type RejectReason,
} from "../../src/lib/rejectReasons";
import { buildAvoidPatternsFromRejected } from "./feedback-hints";
import { getFreeGenUsage } from "./quota";
import { normalizeTopicHints } from "./topic-hints";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JobProgressPayload = {
  stage: string;
  current: number;
  total: number;
  percent: number;
  label: string;
  started_at?: string;
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  drafts_so_far?: number;
  events?: { at: string; kind: string; stage: string; text: string }[];
  path?: "free" | "byo";
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

function parseProgressJson(raw: string | null): JobProgressPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.stage !== "string" ||
      typeof parsed.current !== "number" ||
      typeof parsed.total !== "number" ||
      typeof parsed.percent !== "number" ||
      typeof parsed.label !== "string"
    ) {
      return null;
    }
    const out: JobProgressPayload = {
      stage: parsed.stage as string,
      current: parsed.current as number,
      total: parsed.total as number,
      percent: parsed.percent as number,
      label: parsed.label as string,
    };
    if (typeof parsed.started_at === "string") {
      out.started_at = parsed.started_at;
    }
    if (typeof parsed.tokens_used === "number")
      out.tokens_used = parsed.tokens_used as number;
    if (typeof parsed.tokens_prompt === "number")
      out.tokens_prompt = parsed.tokens_prompt as number;
    if (typeof parsed.tokens_completion === "number")
      out.tokens_completion = parsed.tokens_completion as number;
    if (typeof parsed.drafts_so_far === "number")
      out.drafts_so_far = parsed.drafts_so_far as number;
    if (Array.isArray(parsed.events)) out.events = parsed.events as any;
    if (parsed.path === "free" || parsed.path === "byo")
      out.path = parsed.path as "free" | "byo";
    return out;
  } catch {
    return null;
  }
}

export const jobRoutes = new Hono<AppEnv>();

export type JobListItem = {
  id: string;
  status: string;
  draft_count: number;
  deck_id: string;
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
      `SELECT j.id, j.status, j.created_at, m.deck_id, d.title AS deck_title, m.filename,
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
      deck_id: string;
      deck_title: string;
      filename: string | null;
      draft_count: number;
    }>();

  const items: JobListItem[] = (results ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    draft_count: Number(row.draft_count),
    deck_id: row.deck_id,
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

  const progress = parseProgressJson(row.progress_json);
  let free_quota: { used: number; cap: number; remaining: number } | null =
    null;
  if (progress && progress.path === "free") {
    free_quota = await getFreeGenUsage(c.env, userId);
  }

  return c.json({
    id: row.id,
    material_id: row.material_id,
    status: row.status,
    error: row.error,
    coverage_json: row.coverage_json,
    progress,
    free_quota,
    created_at: row.created_at,
    finished_at: row.finished_at,
  });
});

/** Soft-clean: mark remaining drafts rejected; keep accepted; no requeue (owner only). */
jobRoutes.post("/:id/reject-drafts", async (c) => {
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

  if (row.status === "queued" || row.status === "running") {
    throw new HTTPException(409, { message: "Job already in progress" });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ? WHERE job_id = ? AND status = ?`,
    )
    .bind("rejected", updatedAt, jobId, "draft")
    .run();

  return c.json({ rejectedCount: result.meta.changes ?? 0 });
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

  // Validate before the claim so a bad body never wipes or requeues.
  const raw = await c.req.text();
  let selectedHints: string[] | null = null;
  if (raw.trim()) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HTTPException(400, { message: "Invalid regen body" });
    }
    try {
      selectedHints = normalizeTopicHints(
        (body as { topicHints?: unknown }).topicHints,
      );
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid topicHints",
      });
    }
  }

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

  // Snapshot rejected fronts before wipe so the consumer can avoid them.
  const rejected = await db
    .prepare(
      "SELECT front_json, reject_reason FROM cards WHERE job_id = ? AND status = ? ORDER BY updated_at DESC",
    )
    .bind(jobId, "rejected")
    .all<{ front_json: string; reject_reason: string | null }>();
  const entries: { front: unknown; reason: RejectReason | null }[] = [];
  for (const row of rejected.results ?? []) {
    try {
      entries.push({
        front: JSON.parse(row.front_json) as unknown,
        reason: isRejectReason(row.reject_reason) ? row.reject_reason : null,
      });
    } catch {
    }
  }
  const patterns = buildAvoidPatternsFromRejected(entries);
  await db
    .prepare("UPDATE generation_jobs SET avoid_patterns_json = ? WHERE id = ?")
    .bind(patterns.length > 0 ? JSON.stringify(patterns) : null, jobId)
    .run();

  await db.prepare("DELETE FROM cards WHERE job_id = ?").bind(jobId).run();

  try {
    await requeueGeneration(c.env, {
      jobId: row.id,
      materialId: row.material_id,
      deckId: row.deck_id,
      ...(selectedHints ? { topicHints: selectedHints } : {}),
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
