import type { Env } from "../env";
import { getDb } from "../db/client";
import type { GenerateQueueMessage } from "./enqueue";
import { failStaleRunningJobs } from "./staleFail";
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
import { startGenerationWorkflow } from "./workflowLifecycle";
export {
  startGenerationWorkflow,
  terminateGenerationWorkflow,
} from "./workflowLifecycle";

export { mergeAndDedupeDrafts };
export type { ProcessGenerateOptions, ProcessGenerateResult };

/**
 * Vitest / legacy single-invocation path: pass1 then afterPersist.
 * Workflow calls runPass1Phase / runAfterPersistPhase directly.
 */
export async function processGenerateJob(
  env: Env,
  message: GenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<ProcessGenerateResult> {
  const pass1 = await runPass1Phase(env, message, opts);
  if (pass1 === "busy") return "busy";
  return runAfterPersistPhase(env, message, opts);
}

/** Cloudflare Queues consumer: create Workflow + ack; sweep stale orphans. */
export async function handleGenerateQueue(
  batch: MessageBatch<GenerateQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await startGenerationWorkflow(env, msg.body);
      msg.ack();
    } catch (err) {
      console.error("generation workflow create failed", msg.body.jobId, err);
      msg.retry({ delaySeconds: GENERATE_QUEUE_RETRY_DELAY_SEC });
    }
  }
  await failStaleRunningJobs(getDb(env));
}
