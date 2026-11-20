import type { Env } from "../env";
import type {
  GenerateQueueMessage,
  MaterialGenerateQueueMessage,
} from "./enqueue";
import { failStaleRunningJobs } from "./staleFail";
import { failStaleCardRegenOps, processCardRegenOp } from "./card-regen-op";
import { GENERATE_QUEUE_RETRY_DELAY_SEC } from "./progress";
import { insertDraftCards } from "./gap-fill";
export { insertDraftCards };
import {
  mergeAndDedupeDrafts,
  runPass1Phase,
  type ProcessGenerateOptions,
  type ProcessGenerateResult,
} from "./pass1";
import { runAfterPersistPhase } from "./afterPersist";
import { runClaimOrphanFillPhase } from "./claim-orphan-fill";
import { startGenerationWorkflow } from "./workflowLifecycle";
export {
  startGenerationWorkflow,
  terminateGenerationWorkflow,
} from "./workflowLifecycle";

export { mergeAndDedupeDrafts };
export type { ProcessGenerateOptions, ProcessGenerateResult };

/**
 * Vitest / legacy single-invocation path: pass1, afterPersist, claimOrphanFill.
 * Workflow calls the same phases via durable steps.
 */
export async function processGenerateJob(
  env: Env,
  message: MaterialGenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<ProcessGenerateResult> {
  const pass1 = await runPass1Phase(env, message, opts);
  if (pass1 === "busy") return "busy";
  const after = await runAfterPersistPhase(env, message, opts);
  // Workflow always runs claimOrphanFill. Vitest injects opts.llm and does not
  // stub claim-write AI; skip here so free-gen / card-count assertions stay honest.
  if (!opts?.llm) {
    await runClaimOrphanFillPhase(env, message);
  }
  return after;
}

/** Cloudflare Queues consumer: create Workflow + ack; sweep stale orphans. */
export async function handleGenerateQueue(
  batch: MessageBatch<GenerateQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      if (msg.body.kind === "cardRegen") {
        await processCardRegenOp(env, msg.body);
        msg.ack();
        continue;
      }
      await startGenerationWorkflow(env, msg.body);
      msg.ack();
    } catch (err) {
      const label =
        msg.body.kind === "cardRegen"
          ? `card regen ${msg.body.opId}`
          : `generation workflow create failed ${msg.body.jobId}`;
      console.error(label, err);
      msg.retry({ delaySeconds: GENERATE_QUEUE_RETRY_DELAY_SEC });
    }
  }
  await failStaleRunningJobs(env);
  await failStaleCardRegenOps(env);
}
