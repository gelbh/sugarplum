import type { Env } from "../env";
import { getDb } from "../db/client";
import { type CardRow, serializeCard } from "../cards/serialize";
import {
  ClaimAwareRegenError,
  REGEN_CARD_TYPES,
  regenerateClaimAwareCard,
  resolveRegenLlm,
  type RegenCardType,
} from "./card-regen";
import { studyClaimFromRow } from "./claims";
import { insertDraftCards } from "./gap-fill";
import { WorkersAiCapacityError } from "./workers-ai";

export class ClaimFillConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimFillConflictError";
  }
}

export class ClaimFillNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimFillNotFoundError";
  }
}

export class ClaimFillBadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimFillBadRequestError";
  }
}

export function parseClaimFillType(body: unknown): RegenCardType {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return "qa";
  }
  const type = (body as { type?: unknown }).type;
  if (type == null || type === "") return "qa";
  if (
    typeof type === "string" &&
    (REGEN_CARD_TYPES as readonly string[]).includes(type)
  ) {
    return type as RegenCardType;
  }
  throw new ClaimFillBadRequestError("Invalid card type");
}

/**
 * Create one draft from an orphan study_claims row via claim-aware write + Layer-1 (no extract).
 * Reserves free slot only after DB guards; refunds on quality fail / lost race (same policy as card regen).
 */
export async function fillDraftFromClaim(args: {
  env: Env;
  userId: string;
  jobId: string;
  claimId: string;
  type: RegenCardType;
}): Promise<ReturnType<typeof serializeCard>> {
  const db = getDb(args.env);

  const owned = await db
    .prepare(
      `SELECT j.id, j.status, m.deck_id AS deck_id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(args.jobId, args.userId)
    .first<{ id: string; status: string; deck_id: string }>();
  if (!owned) {
    throw new ClaimFillNotFoundError("Job not found");
  }
  if (owned.status !== "needs_review") {
    throw new ClaimFillConflictError(
      "Cards can only be generated from claims while the job needs review",
    );
  }

  const claimRow = await db
    .prepare(
      `SELECT id, job_id, deck_id, subject, predicate, source_span, object,
              qualifiers_json, pages_json
       FROM study_claims WHERE id = ?`,
    )
    .bind(args.claimId)
    .first<{
      id: string;
      job_id: string;
      deck_id: string;
      subject: string;
      predicate: string;
      source_span: string;
      object: string | null;
      qualifiers_json: string | null;
      pages_json: string | null;
    }>();
  if (
    !claimRow ||
    claimRow.job_id !== args.jobId ||
    claimRow.deck_id !== owned.deck_id
  ) {
    throw new ClaimFillNotFoundError("Claim not found");
  }

  const linked = await db
    .prepare(`SELECT id FROM cards WHERE claim_id = ? LIMIT 1`)
    .bind(args.claimId)
    .first<{ id: string }>();
  if (linked) {
    throw new ClaimFillConflictError("Claim already has a card");
  }

  const llmBundle = await resolveRegenLlm(args.env, args.userId);
  const claim = studyClaimFromRow(claimRow);

  try {
    const generated = await regenerateClaimAwareCard({
      excerpt: claim.source_span,
      materialText: "",
      type: args.type,
      storedClaim: claim,
      llm: llmBundle.llm,
      apiKey: llmBundle.apiKey,
      provider: llmBundle.provider,
      model: llmBundle.model,
      cache: args.env.CACHE,
    });

    if (generated.servedFromCache) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
    }

    const linkedAfter = await db
      .prepare(`SELECT id FROM cards WHERE claim_id = ? LIMIT 1`)
      .bind(args.claimId)
      .first<{ id: string }>();
    if (linkedAfter) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
      throw new ClaimFillConflictError("Claim already has a card");
    }

    let ids: string[];
    try {
      ids = await insertDraftCards(db, {
        deckId: claimRow.deck_id,
        jobId: args.jobId,
        drafts: [{ ...generated.draft, claimId: args.claimId }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/UNIQUE|unique|constraint/i.test(message)) {
        await llmBundle.releaseQuota().catch((e) => console.error(e));
        throw new ClaimFillConflictError("Claim already has a card");
      }
      throw err;
    }

    const cardId = ids[0];
    if (!cardId) {
      throw new Error("insertDraftCards returned no id");
    }

    const row = await db
      .prepare(
        `SELECT id, deck_id, job_id, type, front_json, back_json,
                media_r2_keys_json, provenance_json, status, created_at, updated_at,
                claim_id
         FROM cards WHERE id = ?`,
      )
      .bind(cardId)
      .first<CardRow>();
    if (!row) {
      throw new Error("Inserted card missing");
    }
    return serializeCard(row);
  } catch (err) {
    if (err instanceof ClaimAwareRegenError) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
      throw err;
    }
    if (err instanceof WorkersAiCapacityError) {
      await llmBundle.releaseQuota().catch((e) => console.error(e));
      throw err;
    }
    throw err;
  }
}
