import {
  cardFromOneClaimTypedCompactUserPrompt,
  cardFromOneClaimTypedUserPrompt,
  CARD_FROM_ONE_CLAIM_TYPED_COMPACT_SYSTEM_PROMPT,
  CARD_FROM_ONE_CLAIM_TYPED_SYSTEM_PROMPT,
} from "./card-from-claim-prompts";
import { addUsage, type ClaimStageLlm } from "./claim-stages";
import type { StudyClaim } from "./claims";
import { appendExtraUserSuffix } from "./feedback-hints";
import { isTruncationParseError, parseCardsPayload } from "./llm-json";
import type { LlmTokenUsage } from "./llm";
import { assertValidMcqOptions, type CardDraft } from "./schema";

export type TypedRegenCardType = "qa" | "cloze" | "mcq";

export type TypedRegenDraft = {
  type: TypedRegenCardType;
  front: string;
  back: string;
  options?: string[];
  provenance: CardDraft["provenance"];
};

function parseTypedClaimCard(
  raw: string,
  type: TypedRegenCardType,
): TypedRegenDraft {
  const drafts = parseCardsPayload(raw);
  const hit = drafts.find((d) => d.type === type && typeof d.front === "string");
  if (!hit || typeof hit.front !== "string" || typeof hit.back !== "string") {
    throw new Error(`LLM did not return a ${type} card`);
  }
  const draft: TypedRegenDraft = {
    type,
    front: hit.front,
    back: hit.back,
    provenance: hit.provenance,
  };
  return hit.type === "mcq"
    ? { ...draft, ...assertValidMcqOptions(hit.back, hit.options) }
    : draft;
}

/**
 * Write exactly one card of the requested type from a single claim (sync regen).
 * Leaves `gatewayCache` unset (adapter default skipCache: true). Gateway
 * exact-match can sticky-cache truncated / Layer-1-failing first hops; KV draft
 * cache owns claim→card hits. See claim-card-gateway-l2-closeout design (1A).
 */
export async function writeOneCardFromClaim(
  claim: StudyClaim,
  type: TypedRegenCardType,
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<{ draft: TypedRegenDraft; usage: LlmTokenUsage | null }> {
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const ask = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "cards",
    });

  const user = cardFromOneClaimTypedUserPrompt(claim, type);
  const first = await ask(CARD_FROM_ONE_CLAIM_TYPED_SYSTEM_PROMPT, user);
  try {
    return {
      draft: parseTypedClaimCard(first.text, type),
      usage: first.usage ?? null,
    };
  } catch (err) {
    if (isTruncationParseError(err)) {
      const second = await ask(
        CARD_FROM_ONE_CLAIM_TYPED_COMPACT_SYSTEM_PROMPT,
        cardFromOneClaimTypedCompactUserPrompt(claim, type),
      );
      return {
        draft: parseTypedClaimCard(second.text, type),
        usage: addUsage(first.usage, second.usage),
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    const second = await ask(
      CARD_FROM_ONE_CLAIM_TYPED_SYSTEM_PROMPT,
      `${user}\n\nYour previous reply was rejected: ${message}. Respond with JSON only containing exactly one "${type}" card.`,
    );
    return {
      draft: parseTypedClaimCard(second.text, type),
      usage: addUsage(first.usage, second.usage),
    };
  }
}
