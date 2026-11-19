import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  ClaimAwareRegenError,
  loadCardSourceText,
  regenerateClaimAwareCard,
  resolveRegenLlm,
} from "../generation/card-regen";
import { recordRegenUsageEvent } from "../generation/usage";
import { WorkersAiCapacityError } from "../generation/workers-ai";
import {
  parseProvenanceJson,
  provenanceExcerptText,
} from "../../src/study/regenSource";
import { requireOwnedDeck } from "../materials/routes";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";
import { onCardAccepted } from "../gamification/onStudyEvent";
import { parseOptionalJsonBody } from "../optional-json";
import {
  recomputeSubjectKnowledgeSummary,
  refreshKnowledgeSummaryForOwnedCard,
  refreshKnowledgeSummaryForSubject,
  subjectIdForOwnedCard,
} from "../subjects/knowledgeSummary";
import {
  acceptDraftCard,
  requireOwnedCard,
  undoReviewDecision,
} from "./ownership";
import { encodeStoredBack, parseJsonField, serializeCard } from "./serialize";
import {
  isFacePatch,
  mergeProvenancePagesJson,
  parsePatchDraftBody,
  resolveCardFacePatch,
} from "./patch-draft";
import {
  parseMoveBody,
  parseRejectBody,
  parseRegenBody,
} from "./card-action-bodies";

const STUDY_STRUGGLE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export const cardRoutes = new Hono<AppEnv>();

cardRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft" && row.status !== "accepted") {
    throw new HTTPException(400, {
      message: "Only draft or accepted cards can be edited",
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const patch = parsePatchDraftBody(body);

  if (!isFacePatch(patch) && patch.provenance_pages) {
    const nextProvenanceJson = mergeProvenancePagesJson(
      row.provenance_json,
      patch.provenance_pages,
    );
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE cards SET provenance_json = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(nextProvenanceJson, updatedAt, cardId)
      .run();
    return c.json(
      serializeCard({
        ...row,
        provenance_json: nextProvenanceJson,
        updated_at: updatedAt,
      }),
    );
  }

  const resolved = resolveCardFacePatch(row, patch);
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE cards
       SET type = ?, front_json = ?, back_json = ?, provenance_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      resolved.type,
      resolved.front_json,
      resolved.back_json,
      resolved.provenance_json,
      updatedAt,
      cardId,
    )
    .run();

  return c.json(
    serializeCard({
      ...row,
      type: resolved.type,
      front_json: resolved.front_json,
      back_json: resolved.back_json,
      provenance_json: resolved.provenance_json,
      updated_at: updatedAt,
    }),
  );
});

cardRoutes.post("/:id/accept", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft") {
    throw new HTTPException(400, {
      message: "Only draft cards can be accepted",
    });
  }

  const outcome = await acceptDraftCard(db, row);
  if (outcome === "conflict") {
    throw new HTTPException(409, {
      message: "Card is no longer a draft",
    });
  }
  if (outcome === "invalid") {
    throw new HTTPException(400, {
      message: "Invalid MCQ card; fix options before accepting",
    });
  }

  const updatedAt = new Date().toISOString();
  const unlocks = await onCardAccepted(db, userId, {
    cardId: row.id,
    cardType: row.type,
  });
  await refreshKnowledgeSummaryForOwnedCard(db, userId, cardId);
  return c.json({
    ...serializeCard({ ...row, status: "accepted", updated_at: updatedAt }),
    unlocks,
  });
});

cardRoutes.post("/:id/reject", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  const raw = await c.req.text();
  const parsedBody = parseOptionalJsonBody(raw);
  const body = parsedBody === undefined ? {} : parsedBody;
  const { reason } = parseRejectBody(body);

  if (row.status !== "draft") {
    throw new HTTPException(400, {
      message: "Only draft cards can be rejected",
    });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND status = ?`,
    )
    .bind("rejected", reason, updatedAt, cardId, "draft")
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(409, {
      message: "Card is no longer a draft",
    });
  }

  return c.json(
    serializeCard({ ...row, status: "rejected", updated_at: updatedAt }),
  );
});

/** Undo accept or reject: put the card back into draft review. */
cardRoutes.post("/:id/undo-review", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  const outcome = await undoReviewDecision(db, row);
  if (outcome === "unsupported") {
    throw new HTTPException(400, {
      message: "Only accepted or rejected cards can be undone",
    });
  }
  if (outcome === "conflict") {
    throw new HTTPException(409, {
      message: "Card is no longer accepted or rejected",
    });
  }

  const updatedAt = new Date().toISOString();
  if (row.job_id) {
    await db
      .prepare(
        `UPDATE generation_jobs SET status = ?, finished_at = NULL
         WHERE id = ? AND status = ?`,
      )
      .bind("needs_review", row.job_id, "done")
      .run();
  }

  if (row.status === "accepted") {
    await refreshKnowledgeSummaryForOwnedCard(db, userId, cardId);
  }

  return c.json(
    serializeCard({
      ...row,
      status: "draft",
      updated_at: updatedAt,
    }),
  );
});

cardRoutes.post("/:id/move", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "accepted" && row.status !== "archived") {
    throw new HTTPException(400, {
      message: "Only accepted or archived cards can be moved",
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const { deckId: targetDeckId } = parseMoveBody(body);

  if (targetDeckId === row.deck_id) {
    return c.json(serializeCard(row));
  }

  await requireOwnedDeck(db, targetDeckId, userId);

  const fromSubjectId =
    row.status === "accepted"
      ? await subjectIdForOwnedCard(db, userId, cardId)
      : null;

  const updatedAt = new Date().toISOString();
  await db
    .prepare(`UPDATE cards SET deck_id = ?, updated_at = ? WHERE id = ?`)
    .bind(targetDeckId, updatedAt, cardId)
    .run();

  if (row.status === "accepted") {
    const toSubjectId = await subjectIdForOwnedCard(db, userId, cardId);
    await refreshKnowledgeSummaryForSubject(db, userId, fromSubjectId);
    if (toSubjectId !== fromSubjectId) {
      await refreshKnowledgeSummaryForSubject(db, userId, toSubjectId);
    }
  }

  return c.json(
    serializeCard({
      ...row,
      deck_id: targetDeckId,
      updated_at: updatedAt,
    }),
  );
});

/** Single-card regen: UPDATE one row only; never job-wide DELETE. */
cardRoutes.post("/:id/regen", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft" && row.status !== "accepted") {
    throw new HTTPException(400, {
      message: "Only draft or accepted cards can be regenerated",
    });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const { type: regenType } = parseRegenBody(body);

  const materialText = await loadCardSourceText(c.env, row);
  const excerpt = provenanceExcerptText(
    parseProvenanceJson(row.provenance_json),
  );
  if (!materialText && !excerpt) {
    throw new HTTPException(422, {
      message:
        "No source text available for this card. Edit manually or regenerate from material with text.",
    });
  }

  let llmBundle: Awaited<ReturnType<typeof resolveRegenLlm>>;
  try {
    llmBundle = await resolveRegenLlm(c.env, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM unavailable";
    const freeGenCap = message.includes("Daily free generation limit");
    throw new HTTPException(freeGenCap ? 429 : 502, { message });
  }

  const since = new Date(Date.now() - STUDY_STRUGGLE_WINDOW_MS).toISOString();
  const [scheduleRow, againRow] = await Promise.all([
    db
      .prepare(`SELECT lapses FROM card_schedules WHERE card_id = ?`)
      .bind(cardId)
      .first<{ lapses: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS again_14d FROM review_logs
         WHERE card_id = ? AND rating = 1 AND reviewed_at >= ?`,
      )
      .bind(cardId, since)
      .first<{ again_14d: number }>(),
  ]);
  const studyStruggle = {
    again_14d: Number(againRow?.again_14d) || 0,
    lapses: Number(scheduleRow?.lapses) || 0,
  };

  const existingFront = parseJsonField<unknown>(row.front_json, null);
  let generated: Awaited<ReturnType<typeof regenerateClaimAwareCard>>;
  try {
    generated = await regenerateClaimAwareCard({
      excerpt,
      materialText,
      type: regenType,
      existingFront:
        typeof existingFront === "string" ? existingFront : undefined,
      studyStruggle,
      llm: llmBundle.llm,
      apiKey: llmBundle.apiKey,
      provider: llmBundle.provider,
    });
  } catch (err) {
    if (err instanceof ClaimAwareRegenError) {
      // Soft-fail: no card update; refund free slot reserved at resolve.
      await llmBundle.releaseQuota().catch((e) => console.error(e));
      throw new HTTPException(422, { message: err.message });
    }
    if (err instanceof WorkersAiCapacityError) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
    }
    throw new HTTPException(502, {
      message: err instanceof Error ? err.message : "Card regeneration failed",
    });
  }

  const { draft, usage } = generated;
  const nextBackJson =
    draft.type === "mcq"
      ? encodeStoredBack(draft.type, draft.back, draft.options)
      : encodeStoredBack(draft.type, draft.back);
  const nextFrontJson = JSON.stringify(draft.front);
  const nextProvenanceJson = JSON.stringify(draft.provenance);
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE cards
       SET type = ?, front_json = ?, back_json = ?, provenance_json = ?,
           media_r2_keys_json = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      draft.type,
      nextFrontJson,
      nextBackJson,
      nextProvenanceJson,
      updatedAt,
      cardId,
    )
    .run();

  try {
    await recordRegenUsageEvent(db, {
      userId,
      path: llmBundle.path,
      provider: llmBundle.provider,
      usage,
      createdAt: updatedAt,
    });
  } catch {
    // best-effort metering; card already updated
  }

  return c.json(
    serializeCard({
      ...row,
      type: draft.type,
      front_json: nextFrontJson,
      back_json: nextBackJson,
      provenance_json: nextProvenanceJson,
      media_r2_keys_json: null,
      updated_at: updatedAt,
    }),
  );
});

cardRoutes.post("/:id/archive", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "accepted") {
    throw new HTTPException(400, {
      message: "Only accepted cards can be archived",
    });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
    )
    .bind("archived", updatedAt, cardId, "accepted")
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(400, {
      message: "Only accepted cards can be archived",
    });
  }

  await refreshKnowledgeSummaryForOwnedCard(db, userId, cardId);

  return c.json(
    serializeCard({ ...row, status: "archived", updated_at: updatedAt }),
  );
});

cardRoutes.delete("/:id", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);
  if (row.status !== "accepted") {
    throw new HTTPException(400, {
      message: "Only accepted cards can be deleted",
    });
  }
  const subjectId = await subjectIdForOwnedCard(db, userId, cardId);
  const result = await db
    .prepare("DELETE FROM cards WHERE id = ? AND status = ?")
    .bind(cardId, "accepted")
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(400, {
      message: "Only accepted cards can be deleted",
    });
  }
  await db
    .prepare("DELETE FROM review_logs WHERE card_id = ?")
    .bind(cardId)
    .run();
  await db
    .prepare("DELETE FROM card_schedules WHERE card_id = ?")
    .bind(cardId)
    .run();
  if (subjectId != null) {
    await recomputeSubjectKnowledgeSummary(db, userId, subjectId);
  }
  return c.body(null, 204);
});

cardRoutes.post("/:id/restore", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "archived") {
    throw new HTTPException(400, {
      message: "Only archived cards can be restored",
    });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
    )
    .bind("accepted", updatedAt, cardId, "archived")
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(400, {
      message: "Only archived cards can be restored",
    });
  }

  await refreshKnowledgeSummaryForOwnedCard(db, userId, cardId);

  return c.json(
    serializeCard({ ...row, status: "accepted", updated_at: updatedAt }),
  );
});

cardRoutes.post("/:id/reset-schedule", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "accepted") {
    throw new HTTPException(404, { message: "Card not found" });
  }

  const schedule = scheduleColumnsFromCard(newCard());
  await db
    .prepare(
      `INSERT INTO card_schedules (
         card_id, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(card_id) DO UPDATE SET
         due = excluded.due,
         stability = excluded.stability,
         difficulty = excluded.difficulty,
         elapsed_days = excluded.elapsed_days,
         scheduled_days = excluded.scheduled_days,
         learning_steps = excluded.learning_steps,
         reps = excluded.reps,
         lapses = excluded.lapses,
         state = excluded.state,
         last_review = excluded.last_review`,
    )
    .bind(
      cardId,
      schedule.due,
      schedule.stability,
      schedule.difficulty,
      schedule.elapsed_days,
      schedule.scheduled_days,
      schedule.learning_steps,
      schedule.reps,
      schedule.lapses,
      schedule.state,
      schedule.last_review,
    )
    .run();

  await refreshKnowledgeSummaryForOwnedCard(db, userId, cardId);

  return c.json(serializeCard(row));
});
