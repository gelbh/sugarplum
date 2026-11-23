import {
  isWorkersAiDeprecatedModelError,
  WORKERS_AI_CAPACITY_ERROR,
  WORKERS_AI_TIMEOUT_ERROR,
  WorkersAiCapacityError,
} from "./workers-ai";

/**
 * Free-path claim→card specialist (reasoning low); quality-gates fall back to
 * `WORKERS_AI_MODEL` (`@cf/zai-org/glm-4.7-flash`) on workers-ai.
 */
export const WORKERS_AI_CLAIM_CARD_MODEL =
  "@cf/openai/gpt-oss-20b" as const;

export type ClaimCardFallbackReason =
  | "parse"
  | "layer1"
  | "capacity"
  | "timeout"
  | "deprecated";

function isRemappedWorkersAiCapacityMessage(msg: string): boolean {
  // trackingLlm remaps WorkersAiCapacityError → Error after a prior success
  // so free-slot refund stays correct; still escalate claim→card to glm.
  return (
    msg.includes(WORKERS_AI_CAPACITY_ERROR.toLowerCase()) ||
    /temporarily at capacity/.test(msg)
  );
}

/**
 * Classify free-path claim→card escalate-to-glm reasons.
 * Returns null when the error should not hop.
 */
export function classifyClaimCardFallback(
  err: unknown,
): Exclude<ClaimCardFallbackReason, "layer1"> | null {
  if (err instanceof WorkersAiCapacityError) return "capacity";
  if (isWorkersAiDeprecatedModelError(err)) return "deprecated";
  const msg = (
    err instanceof Error ? err.message : String(err ?? "")
  ).toLowerCase();
  if (isRemappedWorkersAiCapacityMessage(msg)) return "capacity";
  if (
    msg.includes(WORKERS_AI_TIMEOUT_ERROR.toLowerCase()) ||
    /3046|request timeout|timed out/.test(msg)
  ) {
    return "timeout";
  }
  // Known write/parse failures from writeOneCardFromClaim / contentFromAiRun
  if (
    /did not return|mid-json|truncated mid-json|empty content|non-json/.test(msg)
  ) {
    return "parse";
  }
  return null;
}
