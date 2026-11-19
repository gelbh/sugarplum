import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { runAfterPersistPhase } from "./afterPersist";
import { runClaimOrphanFillPhase } from "./claim-orphan-fill";
import { runPass1Phase } from "./pass1";
import {
  acquireGenerationSlot,
  releaseGenerationSlot,
} from "./slots";
import type { GenerationWorkflowParams } from "./workflowParams";

export type { GenerationWorkflowParams } from "./workflowParams";

/** Keep retries near RUNNING_JOB_STALE_MS (~20m) so reclaim can win after death. */
const PASS1_BUSY_RETRIES = {
  limit: 40,
  delay: "30 seconds" as const,
  backoff: "constant" as const,
};

/** Sleep between slot acquire attempts while D1 stays queued. */
const SLOT_WAIT_SLEEP = "30 seconds" as const;

/** ~6h at 30s intervals before treating the free pool as overloaded. */
const SLOT_WAIT_MAX_ATTEMPTS = 720;

export const GENERATION_SLOTS_OVERLOADED_ERROR = "GENERATION_SLOTS_OVERLOADED";

/**
 * Durable generation pipeline. Cap-2 slot lease before claim/pass1.
 * Gap-fill runs in afterPersist so a Queues wall-clock kill after persist can
 * resume without wiping drafts. Lease TTL covers abrupt termination before
 * releaseSlot; normal failures release in finally.
 */
export class GenerationWorkflow extends WorkflowEntrypoint<
  Env,
  GenerationWorkflowParams
> {
  async run(
    event: WorkflowEvent<GenerationWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const params = event.payload;

    let outcome: { acquired: true } | { acquired: false };
    try {
      outcome = await step.do(
        "acquireSlot",
        {
          retries: {
            limit: SLOT_WAIT_MAX_ATTEMPTS,
            delay: SLOT_WAIT_SLEEP,
            backoff: "constant",
          },
        },
        async () => {
          const result = await acquireGenerationSlot(this.env, params.jobId);
          if (result.ok) return { acquired: true as const };
          const row = await getDb(this.env)
            .prepare("SELECT status FROM generation_jobs WHERE id = ?")
            .bind(params.jobId)
            .first<{ status: string }>();
          if (row?.status !== "queued") return { acquired: false as const };
          throw new Error("SLOT_BUSY");
        },
      );
    } catch {
      await step.do("failOverloaded", async () => {
        await getDb(this.env)
          .prepare(
            "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ? AND status = ?",
          )
          .bind(
            "failed",
            GENERATION_SLOTS_OVERLOADED_ERROR,
            new Date().toISOString(),
            params.jobId,
            "queued",
          )
          .run();
        return { ok: true as const };
      });
      throw new Error(GENERATION_SLOTS_OVERLOADED_ERROR);
    }

    if (!outcome.acquired) {
      return;
    }

    try {
      await step.do(
        "pass1",
        { retries: PASS1_BUSY_RETRIES },
        async () => {
          // Idempotent acquire refreshes lease TTL for long PDF runs.
          const hold = await acquireGenerationSlot(this.env, params.jobId);
          if (!hold.ok) {
            throw new Error("GENERATION_SLOT_LOST");
          }
          const result = await runPass1Phase(this.env, params);
          // Throw so Workflow retries until stale reclaim succeeds (or job finishes).
          if (result === "busy") {
            throw new Error("PASS1_BUSY");
          }
          return { result };
        },
      );

      await step.do("afterPersist", async () => {
        const hold = await acquireGenerationSlot(this.env, params.jobId);
        if (!hold.ok) {
          throw new Error("GENERATION_SLOT_LOST");
        }
        await runAfterPersistPhase(this.env, params);
        return { ok: true as const };
      });

      await step.do("claimOrphanFill", async () => {
        const hold = await acquireGenerationSlot(this.env, params.jobId);
        if (!hold.ok) {
          throw new Error("GENERATION_SLOT_LOST");
        }
        return runClaimOrphanFillPhase(this.env, params);
      });
    } finally {
      // step.do retries stay inside await; finally runs after permanent fail or success.
      await step.do("releaseSlot", async () => {
        await releaseGenerationSlot(this.env, params.jobId);
        return { ok: true as const };
      });
    }
  }
}
