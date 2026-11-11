import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { Env } from "../env";
import { processGenerateJob } from "./consumer";
import type { GenerationWorkflowParams } from "./workflowParams";

export type { GenerationWorkflowParams } from "./workflowParams";

/** Keep retries near RUNNING_JOB_STALE_MS (~20m) so reclaim can win after death. */
const PASS1_BUSY_RETRIES = {
  limit: 40,
  delay: "30 seconds" as const,
  backoff: "constant" as const,
};

/**
 * Durable generation pipeline. Phase 2 uses no-op slot steps; Phase 3 fills them.
 * Gap-fill runs in afterPersist so a Queues wall-clock kill after persist can
 * resume without wiping drafts.
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

    await step.do("acquireSlot", async () => ({ ok: true as const }));

    await step.do(
      "pass1",
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
      { retries: PASS1_BUSY_RETRIES },
    );

    await step.do("afterPersist", async () => {
      await processGenerateJob(this.env, params, {
        phase: "afterPersist",
      });
      return { ok: true as const };
    });

    await step.do("releaseSlot", async () => ({}));
  }
}
