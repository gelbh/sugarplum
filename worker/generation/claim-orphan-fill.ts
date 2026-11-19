import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  ClaimAwareRegenError,
  type RegenCardType,
} from "./card-regen";
import {
  ClaimFillConflictError,
  ClaimFillNotFoundError,
  fillDraftFromClaim,
} from "./claim-fill";
import type { GenerateQueueMessage } from "./enqueue";
import { isFreeGenCapError } from "./quota";
import { WorkersAiCapacityError } from "./workers-ai";

/** Max claim fills attempted per job in the auto orphan pass. */
export const AUTO_ORPHAN_FILL_CAP = 5;

/**
 * Max claim fills attempted per Fill-all HTTP request.
 * Kept small so one Worker request stays under timeout (re-click for leftovers).
 */
export const FILL_ALL_REQUEST_CAP = 8;

const DEFAULT_TYPE: RegenCardType = "qa";

export type ClaimOrphanFillSummary = {
  attempted: number;
  filled: number;
  skipped: number;
};

export type FillOrphanClaimsResult = ClaimOrphanFillSummary & {
  remaining: number;
  cards: Awaited<ReturnType<typeof fillDraftFromClaim>>[];
};

type DeckOwnerRow = {
  id: string;
  user_id: string;
};

/** Free-slot denial, Workers AI capacity, or remapped capacity Error from regen. */
function isOrphanFillCapacityStop(err: unknown): boolean {
  if (err instanceof WorkersAiCapacityError) return true;
  if (isFreeGenCapError(err)) return true;
  if (!(err instanceof Error)) return false;
  // regenerateClaimAwareCard remaps WorkersAiCapacityError after a successful call.
  return /capacity|rate.?limit|too many requests|neuron|overloaded/i.test(
    err.message,
  );
}

async function listOrphanIds(
  db: ReturnType<typeof getDb>,
  jobId: string,
): Promise<string[]> {
  const { results } = await db
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
  return (results ?? []).map((r) => r.id);
}

/**
 * Fill orphan study_claims via fillDraftFromClaim (soft-fail).
 * Cap limits attempts this call; capacity / free-slot stops early.
 */
export async function fillOrphanClaims(args: {
  env: Env;
  userId: string;
  jobId: string;
  cap: number;
  type?: RegenCardType;
}): Promise<FillOrphanClaimsResult> {
  const zeros: FillOrphanClaimsResult = {
    attempted: 0,
    filled: 0,
    skipped: 0,
    remaining: 0,
    cards: [],
  };
  const db = getDb(args.env);
  const type = args.type ?? DEFAULT_TYPE;
  const { jobId, userId, cap } = args;

  let orphanIds: string[];
  try {
    const statusRow = await db
      .prepare(
        "SELECT status, progress_json, created_at FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        status: string;
        progress_json: string | null;
        created_at: string;
      }>();
    if (!statusRow || statusRow.status !== "needs_review") {
      return zeros;
    }
    orphanIds = await listOrphanIds(db, jobId);
  } catch (err) {
    console.error("fillOrphanClaims setup soft-failed", jobId, err);
    return zeros;
  }

  if (orphanIds.length === 0) {
    return { ...zeros, remaining: 0 };
  }

  const summary: FillOrphanClaimsResult = {
    attempted: 0,
    filled: 0,
    skipped: 0,
    remaining: 0,
    cards: [],
  };

  for (const claimId of orphanIds) {
    if (summary.attempted >= cap) break;

    summary.attempted += 1;
    try {
      const card = await fillDraftFromClaim({
        env: args.env,
        userId,
        jobId,
        claimId,
        type,
      });
      summary.filled += 1;
      summary.cards.push(card);
    } catch (err) {
      if (err instanceof ClaimFillConflictError) {
        summary.skipped += 1;
        continue;
      }
      if (isOrphanFillCapacityStop(err)) {
        summary.skipped += 1;
        console.warn("fillOrphanClaims capacity stop", jobId, err);
        break;
      }
      if (
        err instanceof ClaimAwareRegenError ||
        err instanceof ClaimFillNotFoundError
      ) {
        summary.skipped += 1;
        console.warn("fillOrphanClaims soft skip", jobId, claimId, err);
        continue;
      }
      summary.skipped += 1;
      console.error(
        "fillOrphanClaims unexpected stop",
        jobId,
        claimId,
        err,
      );
      break;
    }
  }

  // Never wipe filled cards from the HTTP summary if remaining recount fails.
  try {
    summary.remaining = (await listOrphanIds(db, jobId)).length;
  } catch (err) {
    console.error("fillOrphanClaims remaining recount failed", jobId, err);
    summary.remaining = Math.max(0, orphanIds.length - summary.filled);
  }
  return summary;
}

/**
 * After needs_review: fill orphan study_claims via fillDraftFromClaim (soft-fail).
 * Not gated on autoFollowup. Cap AUTO_ORPHAN_FILL_CAP; stop early on capacity.
 */
export async function runClaimOrphanFillPhase(
  env: Env,
  message: GenerateQueueMessage,
): Promise<ClaimOrphanFillSummary> {
  const zeros: ClaimOrphanFillSummary = {
    attempted: 0,
    filled: 0,
    skipped: 0,
  };
  const db = getDb(env);
  const { jobId, deckId } = message;

  try {
    const statusRow = await db
      .prepare(
        "SELECT status, progress_json, created_at FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        status: string;
        progress_json: string | null;
        created_at: string;
      }>();
    if (!statusRow || statusRow.status !== "needs_review") {
      return zeros;
    }

    const deck = await db
      .prepare("SELECT id, user_id FROM decks WHERE id = ?")
      .bind(deckId)
      .first<DeckOwnerRow>();
    if (!deck) {
      console.warn("claimOrphanFill missing deck", jobId, deckId);
      return zeros;
    }

    const result = await fillOrphanClaims({
      env,
      userId: deck.user_id,
      jobId,
      cap: AUTO_ORPHAN_FILL_CAP,
      type: DEFAULT_TYPE,
    });
    return {
      attempted: result.attempted,
      filled: result.filled,
      skipped: result.skipped,
    };
  } catch (err) {
    console.error("claimOrphanFill phase soft-failed", jobId, err);
    return zeros;
  }
}
