import type { Env } from "../env";
import type {
  CardRegenQueueMessage,
  GenerateQueueMessage,
  MaterialGenerateQueueMessage,
} from "./enqueue";
import { failStaleRunningJobs } from "./staleFail";
import {
  CARD_REGEN_QUEUE_RETRY_DELAY_SEC,
  failStaleCardRegenOps,
  processCardRegenOp,
} from "./card-regen-op";
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

function isLegacyCardRegenBody(
  body: unknown,
): body is CardRegenQueueMessage {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { kind?: unknown }).kind === "cardRegen"
  );
}

function safeErrorType(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Consumer may still see in-flight cardRegen after cutover; producer stays material-only. */
export type GenerateConsumerMessage =
  | GenerateQueueMessage
  | CardRegenQueueMessage;

/** Cloudflare Queues consumer: create Workflow + ack; sweep stale orphans. */
export async function handleGenerateQueue(
  batch: MessageBatch<GenerateConsumerMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      // Deploy compat: drain in-flight cardRegen still on sugarplum-generate.
      if (isLegacyCardRegenBody(msg.body)) {
        await processCardRegenOp(env, msg.body);
        msg.ack();
        continue;
      }
      await startGenerationWorkflow(env, msg.body);
      msg.ack();
    } catch (err) {
      const label = isLegacyCardRegenBody(msg.body)
        ? `legacy card regen ${msg.body.opId}`
        : `generation workflow create failed ${msg.body.jobId}`;
      console.error(label, safeErrorType(err));
      msg.retry({ delaySeconds: GENERATE_QUEUE_RETRY_DELAY_SEC });
    }
  }
  await failStaleRunningJobs(env);
}

/** Dedicated card-regen consumer; does not share GENERATE_QUEUE slots. */
export async function handleCardRegenQueue(
  batch: MessageBatch<CardRegenQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processCardRegenOp(env, msg.body);
      msg.ack();
    } catch (err) {
      console.error(`card regen ${msg.body.opId}`, safeErrorType(err));
      msg.retry({ delaySeconds: CARD_REGEN_QUEUE_RETRY_DELAY_SEC });
    }
  }
  await failStaleCardRegenOps(env);
}
