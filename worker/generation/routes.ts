import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { requeueGeneration } from "./enqueue";
import { terminateGenerationWorkflow } from "./workflowLifecycle";
import { isRejectReason, type RejectReason } from "../../src/draftReview/rejectReasons";
import { buildAvoidPatternsFromRejected } from "./feedback-hints";
import { getFreeGenUsage } from "./quota";
import { failRunningJobIfStale } from "./staleFail";
import { normalizeTopicHints } from "./topic-hints";
import { parseOptionalJsonBody } from "../optional-json";
import { buildClaimCoverage } from "./claim-coverage";
import {
  ClaimFillBadRequestError,
  ClaimFillConflictError,
  ClaimFillNotFoundError,
  fillDraftFromClaim,
  parseClaimFillType,
} from "./claim-fill";
import { ClaimAwareRegenError } from "./card-regen";
import { WorkersAiCapacityError } from "./workers-ai";
import {
  fillAllInstanceId,
  getFillAllWorkflowStatus,
  startFillAllWorkflow,
  terminateFillAllWorkflow,
} from "./fillAllLifecycle";
import { readEtaPriors } from "./stageDurations";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type JobProgressPayload = {
  stage: string;
  current: number;
  total: number;
  percent: number;
  label: string;
  /** ISO heartbeat; client poll timeout uses the same stale window as the server. */
  updated_at?: string;
  started_at?: string;
  tokens_used?: number;
  tokens_prompt?: number;
  tokens_completion?: number;
  drafts_so_far?: number;
  events?: { at: string; kind: string; stage: string; text: string }[];
  path?: "free" | "byo";
  present_stages?: string[];
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
  /** Present on GET /:id when the poll query joins deck/subject. */
  deck_id?: string;
  deck_title?: string;
  subject_id?: string | null;
  subject_title?: string | null;
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
    if (typeof parsed.updated_at === "string") {
      out.updated_at = parsed.updated_at;
    }
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
    if (Array.isArray(parsed.present_stages)) {
      out.present_stages = parsed.present_stages.filter(
        (s): s is string => typeof s === "string",
      );
    }
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
// view-as: allow
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
// view-as: allow
jobRoutes.get("/:id", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  let row = await db
    .prepare(
      `SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json,
              j.created_at, j.finished_at, m.deck_id AS deck_id, d.title AS deck_title,
              d.subject_id AS subject_id, s.title AS subject_title
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       LEFT JOIN subjects s ON s.id = d.subject_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<JobPollRow>();

  if (!row) throw new HTTPException(404, { message: "Job not found" });

  if (row.status === "running" && !c.get("viewingAs")) {
    const healed = await failRunningJobIfStale(
      c.env,
      {
        id: jobId,
        progress_json: row.progress_json,
        created_at: row.created_at,
      },
      Date.now(),
    );
    if (healed) {
      const refreshed = await db
        .prepare(
          `SELECT j.id, j.material_id, j.status, j.error, j.coverage_json, j.progress_json,
                  j.created_at, j.finished_at, m.deck_id AS deck_id, d.title AS deck_title,
                  d.subject_id AS subject_id, s.title AS subject_title
           FROM generation_jobs j
           INNER JOIN materials m ON m.id = j.material_id
           INNER JOIN decks d ON d.id = m.deck_id
           LEFT JOIN subjects s ON s.id = d.subject_id
           WHERE j.id = ? AND d.user_id = ?`,
        )
        .bind(jobId, userId)
        .first<JobPollRow>();
      if (refreshed) row = refreshed;
    }
  }

  const progress = parseProgressJson(row.progress_json);
  let free_quota: { used: number; cap: number; remaining: number } | null =
    null;
  if (progress && progress.path === "free") {
    free_quota = await getFreeGenUsage(c.env, userId);
  }

  let eta_priors: Awaited<ReturnType<typeof readEtaPriors>> = null;
  try {
    eta_priors = await readEtaPriors(c.env.CACHE);
  } catch {
    eta_priors = null;
  }

  return c.json({
    id: row.id,
    material_id: row.material_id,
    status: row.status,
    error: row.error,
    coverage_json: row.coverage_json,
    progress,
    free_quota,
    eta_priors,
    created_at: row.created_at,
    finished_at: row.finished_at,
    deck_id: row.deck_id,
    deck_title: row.deck_title,
    subject_id: row.subject_id,
    subject_title: row.subject_title,
  });
});

// view-as: allow
jobRoutes.get("/:id/claim-coverage", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const owned = await db
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!owned) throw new HTTPException(404, { message: "Job not found" });

  const { results } = await db
    .prepare(
      `SELECT sc.id, sc.job_id, sc.subject, sc.predicate, sc.object,
              (
                SELECT c.id FROM cards c
                WHERE c.claim_id = sc.id
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT 1
              ) AS card_id,
              (
                SELECT c.status FROM cards c
                WHERE c.claim_id = sc.id
                ORDER BY c.created_at ASC, c.id ASC
                LIMIT 1
              ) AS card_status
       FROM study_claims sc
       WHERE sc.job_id = ?
       ORDER BY sc.created_at ASC`,
    )
    .bind(jobId)
    .all<{
      id: string;
      job_id: string;
      subject: string;
      predicate: string;
      object: string | null;
      card_id: string | null;
      card_status: string | null;
    }>();

  return c.json(buildClaimCoverage(results ?? []));
});

/** Kick off durable Fill-all Workflow (202) or return zeros when no orphans (200). */
// view-as: deny
jobRoutes.post("/:id/claims/fill-orphans", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const raw = await c.req.text();
  const body = parseOptionalJsonBody(raw) ?? {};

  let type: ReturnType<typeof parseClaimFillType>;
  try {
    type = parseClaimFillType(body);
  } catch (err) {
    if (err instanceof ClaimFillBadRequestError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  const owned = await getDb(c.env)
    .prepare(
      `SELECT j.id, j.status
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string; status: string }>();
  if (!owned) {
    throw new HTTPException(404, { message: "Job not found" });
  }
  if (owned.status !== "needs_review") {
    throw new HTTPException(409, {
      message:
        "Cards can only be generated from claims while the job needs review",
    });
  }

  const { results: orphanRows } = await getDb(c.env)
    .prepare(
      `SELECT sc.id AS id
       FROM study_claims sc
       WHERE sc.job_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM cards c WHERE c.claim_id = sc.id
         )
       ORDER BY sc.created_at ASC, sc.id ASC`,
    )
    .bind(jobId)
    .all<{ id: string }>();
  const orphanTotal = (orphanRows ?? []).length;
  if (orphanTotal === 0) {
    return c.json({
      attempted: 0,
      filled: 0,
      skipped: 0,
      remaining: 0,
      cards: [],
    });
  }

  if (!c.env.FILL_ALL_WORKFLOW) {
    throw new HTTPException(503, {
      message: "Fill-all workflow is not configured",
    });
  }

  const started = await startFillAllWorkflow(c.env, {
    jobId,
    userId,
    type,
  });
  if (started === "already") {
    throw new HTTPException(409, {
      message: "Fill-all already in progress",
    });
  }

  return c.json(
    {
      runId: fillAllInstanceId(jobId),
      orphanTotal,
      status: "running" as const,
    },
    202,
  );
});

/** Fill-all Workflow run status (P1; does not read generation progress_json). */
// view-as: allow
jobRoutes.get("/:id/claims/fill-orphans", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");

  const owned = await getDb(c.env)
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!owned) {
    throw new HTTPException(404, { message: "Job not found" });
  }

  return c.json(await getFillAllWorkflowStatus(c.env, jobId));
});

/** Cancel a hung or in-flight Fill-all Workflow. */
// view-as: deny
jobRoutes.delete("/:id/claims/fill-orphans", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");

  const owned = await getDb(c.env)
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!owned) {
    throw new HTTPException(404, { message: "Job not found" });
  }

  if (!c.env.FILL_ALL_WORKFLOW) {
    throw new HTTPException(503, {
      message: "Fill-all workflow is not configured",
    });
  }

  await terminateFillAllWorkflow(c.env, jobId);
  return c.json(await getFillAllWorkflowStatus(c.env, jobId));
});

/** Generate one draft from an orphan study_claims row (write + Layer-1; no extract). */
// view-as: deny
jobRoutes.post("/:id/claims/:claimId/generate", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const claimId = c.req.param("claimId");
  const raw = await c.req.text();
  const body = parseOptionalJsonBody(raw) ?? {};

  let type: ReturnType<typeof parseClaimFillType>;
  try {
    type = parseClaimFillType(body);
  } catch (err) {
    if (err instanceof ClaimFillBadRequestError) {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }

  try {
    const card = await fillDraftFromClaim({
      env: c.env,
      userId,
      jobId,
      claimId,
      type,
    });
    return c.json(card);
  } catch (err) {
    if (err instanceof ClaimFillNotFoundError) {
      throw new HTTPException(404, { message: err.message });
    }
    if (err instanceof ClaimFillConflictError) {
      throw new HTTPException(409, { message: err.message });
    }
    if (err instanceof ClaimAwareRegenError) {
      throw new HTTPException(422, { message: err.message });
    }
    if (err instanceof WorkersAiCapacityError) {
      throw new HTTPException(502, { message: err.message });
    }
    const message = err instanceof Error ? err.message : "Claim fill failed";
    if (message.includes("Daily free generation limit")) {
      throw new HTTPException(429, { message });
    }
    throw new HTTPException(502, { message });
  }
});

/**
 * Clear a failed (or empty needs_review) job from pending chrome.
 * Rejects leftover drafts, marks job done; returns deck_id for navigation.
 */
// view-as: deny
jobRoutes.post("/:id/dismiss", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const row = await db
    .prepare(
      `SELECT j.id, j.status, j.error, j.finished_at, m.deck_id AS deck_id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{
      id: string;
      status: string;
      error: string | null;
      finished_at: string | null;
      deck_id: string;
    }>();

  if (!row) throw new HTTPException(404, { message: "Job not found" });

  if (row.status === "queued" || row.status === "running") {
    throw new HTTPException(409, { message: "Job already in progress" });
  }

  if (row.status !== "failed" && row.status !== "needs_review") {
    throw new HTTPException(409, { message: "Job cannot be dismissed" });
  }

  if (row.status === "needs_review") {
    const draft = await db
      .prepare(
        `SELECT 1 AS ok FROM cards WHERE job_id = ? AND status = ? LIMIT 1`,
      )
      .bind(jobId, "draft")
      .first<{ ok: number }>();
    if (draft) {
      throw new HTTPException(409, {
        message: "Reject remaining drafts before dismissing",
      });
    }
  }

  const updatedAt = new Date().toISOString();
  const dismissed = await db
    .prepare(
      `UPDATE generation_jobs SET status = ?, error = ?, finished_at = ?
       WHERE id = ? AND status IN ('failed', 'needs_review')`,
    )
    .bind("done", row.error, row.finished_at ?? updatedAt, jobId)
    .run();
  if ((dismissed.meta?.changes ?? 0) === 0) {
    throw new HTTPException(409, { message: "Job cannot be dismissed" });
  }

  await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ? WHERE job_id = ? AND status = ?`,
    )
    .bind("rejected", updatedAt, jobId, "draft")
    .run();

  return c.json({ deck_id: row.deck_id });
});

/** Soft-clean: mark remaining drafts rejected; keep accepted; no requeue (owner only). */
// view-as: deny
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
// view-as: deny
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
  const body = parseOptionalJsonBody(raw);
  if (body !== undefined) {
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
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
  // Promote to Accurate when Docling is configured so empty-text PDFs can use figures.
  const claim = c.env.DOCLING_URL?.trim()
    ? await db
        .prepare(
          `UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = NULL, progress_json = NULL, finished_at = NULL, figure_extract_mode = ?
           WHERE id = ? AND status NOT IN ('queued', 'running')`,
        )
        .bind("queued", "accurate", jobId)
        .run()
    : await db
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
    } catch {}
  }
  const patterns = buildAvoidPatternsFromRejected(entries);
  await db
    .prepare(
      "UPDATE generation_jobs SET avoid_patterns_json = ?, run_topic_hints_json = ? WHERE id = ?",
    )
    .bind(
      patterns.length > 0 ? JSON.stringify(patterns) : null,
      selectedHints ? JSON.stringify(selectedHints) : null,
      jobId,
    )
    .run();

  // Wipe claims with cards so coverage does not accumulate orphans across regens.
  await db
    .prepare("DELETE FROM study_claims WHERE job_id = ?")
    .bind(jobId)
    .run();
  await db.prepare("DELETE FROM cards WHERE job_id = ?").bind(jobId).run();

  try {
    await terminateGenerationWorkflow(c.env, jobId);
    await requeueGeneration(c.env, {
      jobId: row.id,
      materialId: row.material_id,
      deckId: row.deck_id,
      autoFollowup: false,
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
