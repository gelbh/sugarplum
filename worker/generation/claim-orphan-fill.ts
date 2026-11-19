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

const DEFAULT_TYPE: RegenCardType = "qa";

export type ClaimOrphanFillSummary = {
  attempted: number;
  filled: number;
  skipped: number;
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

    const orphans = results ?? [];
    if (orphans.length === 0) return zeros;

    const summary: ClaimOrphanFillSummary = {
      attempted: 0,
      filled: 0,
      skipped: 0,
    };

    for (const orphan of orphans) {
      if (summary.attempted >= AUTO_ORPHAN_FILL_CAP) break;

      summary.attempted += 1;
      try {
        await fillDraftFromClaim({
          env,
          userId: deck.user_id,
          jobId,
          claimId: orphan.id,
          type: DEFAULT_TYPE,
        });
        summary.filled += 1;
      } catch (err) {
        if (err instanceof ClaimFillConflictError) {
          summary.skipped += 1;
          continue;
        }
        if (isOrphanFillCapacityStop(err)) {
          summary.skipped += 1;
          console.warn("claimOrphanFill capacity stop", jobId, err);
          break;
        }
        if (
          err instanceof ClaimAwareRegenError ||
          err instanceof ClaimFillNotFoundError
        ) {
          summary.skipped += 1;
          console.warn("claimOrphanFill soft skip", jobId, orphan.id, err);
          continue;
        }
        summary.skipped += 1;
        console.error(
          "claimOrphanFill unexpected stop",
          jobId,
          orphan.id,
          err,
        );
        break;
      }
    }

    return summary;
  } catch (err) {
    console.error("claimOrphanFill phase soft-failed", jobId, err);
    return zeros;
  }
}
