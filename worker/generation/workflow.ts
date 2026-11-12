import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { processGenerateJob } from "./consumer";
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

/**
 * Durable generation pipeline. Cap-2 slot lease before claim/pass1.
 * Gap-fill runs in afterPersist so a Queues wall-clock kill after persist can
 * resume without wiping drafts. Lease TTL + soft-complete sweeper cover orphans
 * if the Workflow dies before releaseSlot.
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

    let acquired = false;
    for (let attempt = 0; attempt < SLOT_WAIT_MAX_ATTEMPTS; attempt++) {
      const result = await step.do(`acquireSlot-${attempt}`, async () =>
        acquireGenerationSlot(this.env, params.jobId),
      );
      if (result.ok) {
        acquired = true;
        break;
      }

      const stillQueued = await step.do(`slotWaitQueued-${attempt}`, async () => {
        const row = await getDb(this.env)
          .prepare("SELECT status FROM generation_jobs WHERE id = ?")
          .bind(params.jobId)
          .first<{ status: string }>();
        return row?.status === "queued";
      });
      if (!stillQueued) {
        return;
      }

      await step.sleep(`slotWait-${attempt}`, SLOT_WAIT_SLEEP);
    }

    if (!acquired) {
      throw new Error("GENERATION_SLOTS_OVERLOADED");
    }

    await step.do(
      "pass1",
      { retries: PASS1_BUSY_RETRIES },
      async () => {
        const result = await processGenerateJob(this.env, params, {
          phase: "pass1",
        });
        // Throw so Workflow retries until stale reclaim succeeds (or job finishes).
        if (result === "busy") {
          throw new Error("PASS1_BUSY");
        }
        return { result };
      },
    );

    await step.do("afterPersist", async () => {
      await processGenerateJob(this.env, params, {
        phase: "afterPersist",
      });
      return { ok: true as const };
    });

    await step.do("releaseSlot", async () => {
      await releaseGenerationSlot(this.env, params.jobId);
      return { ok: true as const };
    });
  }
}
