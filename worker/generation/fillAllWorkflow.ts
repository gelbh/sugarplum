import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  FILL_ALL_REQUEST_CAP,
  FILL_ALL_SOFT_FAIL_BUDGET,
  fillOrphanClaims,
  type FillOrphanClaimsResult,
} from "./claim-orphan-fill";
import type {
  FillAllRunOutput,
  FillAllStopReason,
  FillAllWorkflowParams,
} from "./fillAllWorkflowParams";

/** Safety ceiling: enough for large orphan sets without runaway steps. */
export const FILL_ALL_MAX_CHUNKS = 256;

export type FillChunkResult = FillOrphanClaimsResult;

type FillChunkFn = (args: {
  softFailCounts: Record<string, number>;
}) => Promise<FillChunkResult>;

/**
 * Pure chunk loop for tests + Workflow. Each fillChunk is one durable step.
 */
export async function executeFillAllChunks(args: {
  fillChunk: FillChunkFn;
  maxChunks?: number;
  cap?: number;
}): Promise<FillAllRunOutput> {
  const maxChunks = args.maxChunks ?? FILL_ALL_MAX_CHUNKS;
  const cap = args.cap ?? FILL_ALL_REQUEST_CAP;
  let attempted = 0;
  let filled = 0;
  let skipped = 0;
  let remaining = 0;
  let softFailCounts: Record<string, number> = {};
  let stopReason: FillAllStopReason = "complete";

  for (let n = 0; n < maxChunks; n += 1) {
    const chunk = await args.fillChunk({ softFailCounts });
    attempted += chunk.attempted;
    filled += chunk.filled;
    skipped += chunk.skipped;
    remaining = chunk.remaining;
    softFailCounts = chunk.softFailCounts ?? softFailCounts;

    if (chunk.inconclusive) {
      stopReason = "error";
      break;
    }

    if (chunk.softFailBudgetExhausted) {
      stopReason = "soft_fail_budget";
      break;
    }

    if (chunk.remaining === 0) {
      stopReason = attempted === 0 && filled === 0 ? "empty" : "complete";
      break;
    }

    // Helper returned before exhausting the per-chunk cap while orphans remain
    // → capacity / soft early stop (do not start another chunk).
    if (chunk.attempted < cap) {
      stopReason = "capacity";
      break;
    }

    if (n === maxChunks - 1) {
      stopReason = "capacity";
      break;
    }
  }

  return { attempted, filled, skipped, remaining, stopReason };
}

/**
 * Durable Fill-all: chunked fillOrphanClaims without generation slots.
 * Job stays needs_review for the whole run.
 */
export class FillAllWorkflow extends WorkflowEntrypoint<
  Env,
  FillAllWorkflowParams
> {
  async run(
    event: WorkflowEvent<FillAllWorkflowParams>,
    step: WorkflowStep,
  ): Promise<FillAllRunOutput> {
    const { jobId, userId, type } = event.payload;

    const guard = await step.do("guard", async () => {
      const row = await getDb(this.env)
        .prepare("SELECT status FROM generation_jobs WHERE id = ?")
        .bind(jobId)
        .first<{ status: string }>();
      return { ok: row?.status === "needs_review" };
    });

    if (!guard.ok) {
      return {
        attempted: 0,
        filled: 0,
        skipped: 0,
        remaining: 0,
        stopReason: "not_needs_review",
      };
    }

    let chunkIndex = 0;
    return executeFillAllChunks({
      cap: FILL_ALL_REQUEST_CAP,
      maxChunks: FILL_ALL_MAX_CHUNKS,
      fillChunk: async ({ softFailCounts }) => {
        const n = chunkIndex;
        chunkIndex += 1;
        return step.do(`fill-chunk-${n}`, async () => {
          const result = await fillOrphanClaims({
            env: this.env,
            userId,
            jobId,
            cap: FILL_ALL_REQUEST_CAP,
            type,
            softFailBudget: FILL_ALL_SOFT_FAIL_BUDGET,
            softFailCounts,
          });
          // Persist summary only (avoid Workflow step state bloat from cards[]).
          return {
            attempted: result.attempted,
            filled: result.filled,
            skipped: result.skipped,
            remaining: result.remaining,
            cards: [],
            inconclusive: result.inconclusive,
            softFailBudgetExhausted: result.softFailBudgetExhausted,
            softFailCounts: result.softFailCounts,
          };
        });
      },
    });
  }
}
