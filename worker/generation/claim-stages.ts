import {
  CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT,
  CARD_FROM_CLAIM_SYSTEM_PROMPT,
  cardFromClaimCompactUserPrompt,
  cardFromClaimUserPrompt,
  cardFromOneClaimTypedCompactUserPrompt,
  cardFromOneClaimTypedUserPrompt,
  CARD_FROM_ONE_CLAIM_TYPED_COMPACT_SYSTEM_PROMPT,
  CARD_FROM_ONE_CLAIM_TYPED_SYSTEM_PROMPT,
} from "./card-from-claim-prompts";
import {
  CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
  CLAIM_EXTRACT_SYSTEM_PROMPT,
  CLAIM_GAP_EXTRACT_SYSTEM_PROMPT,
  claimExtractCompactUserPrompt,
  claimExtractUserPrompt,
  claimGapExtractUserPrompt,
} from "./claim-prompts";
import {
  filterClaimsAgainstChunk,
  parseClaimsPayload,
  type StudyClaim,
} from "./claims";
import { appendExtraUserSuffix } from "./feedback-hints";
import {
  isTruncationParseError,
  parseCardsPayload,
  withCompactTruncationRetry,
} from "./llm-json";
import type { LlmAdapter, LlmTokenUsage } from "./llm";
import { assertValidMcqOptions, type CardDraft } from "./schema";

export type ClaimStageLlm = {
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
};

export type TypedRegenCardType = "qa" | "cloze" | "mcq";

export type TypedRegenDraft = {
  type: TypedRegenCardType;
  front: string;
  back: string;
  options?: string[];
  provenance: CardDraft["provenance"];
};

function isCardsParseFailure(err: unknown): boolean {
  return (
    err instanceof Error &&
    (/non-JSON/i.test(err.message) ||
      /must be an array or \{\"cards\"/i.test(err.message))
  );
}

export function addUsage(
  a: LlmTokenUsage | null | undefined,
  b: LlmTokenUsage | null | undefined,
): LlmTokenUsage | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const sum = (x?: number | null, y?: number | null) =>
    x == null && y == null ? null : (x ?? 0) + (y ?? 0);
  return {
    prompt_tokens: sum(a.prompt_tokens, b.prompt_tokens),
    completion_tokens: sum(a.completion_tokens, b.completion_tokens),
    total_tokens: sum(a.total_tokens, b.total_tokens),
  };
}

/** Extract + ground-filter claims for one chunk (job pipeline + sync regen). */
export async function extractClaimsForChunk(
  chunk: string,
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<StudyClaim[]> {
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const completeOnce = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "claims",
    });

  try {
    return await withCompactTruncationRetry(
      async () =>
        filterClaimsAgainstChunk(
          parseClaimsPayload(
            (
              await completeOnce(
                CLAIM_EXTRACT_SYSTEM_PROMPT,
                claimExtractUserPrompt(chunk),
              )
            ).text,
          ),
          chunk,
        ),
      async () =>
        filterClaimsAgainstChunk(
          parseClaimsPayload(
            (
              await completeOnce(
                CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
                claimExtractCompactUserPrompt(chunk),
              )
            ).text,
          ),
          chunk,
        ),
    );
  } catch (err) {
    if (isTruncationParseError(err)) return [];
    throw err;
  }
}

/**
 * Gap-pass extract for uncovered lines. Ground-filter against the full chunk
 * (not only the gap list) so spans still resolve in context.
 */
export async function extractClaimsForGapLines(
  uncoveredLines: string[],
  groundingChunk: string,
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<StudyClaim[]> {
  if (uncoveredLines.length === 0) return [];
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const completeOnce = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "claims",
    });

  try {
    return filterClaimsAgainstChunk(
      parseClaimsPayload(
        (
          await completeOnce(
            CLAIM_GAP_EXTRACT_SYSTEM_PROMPT,
            claimGapExtractUserPrompt(uncoveredLines),
          )
        ).text,
      ),
      groundingChunk,
    );
  } catch (err) {
    if (isTruncationParseError(err)) return [];
    throw err;
  }
}

/** Batch write ≤1 card per claim (job pipeline). */
export async function writeCardsFromClaims(
  claims: StudyClaim[],
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<CardDraft[]> {
  if (claims.length === 0) return [];
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const completeOnce = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "cards",
    });

  try {
    return await withCompactTruncationRetry(
      async () =>
        parseCardsPayload(
          (
            await completeOnce(
              CARD_FROM_CLAIM_SYSTEM_PROMPT,
              cardFromClaimUserPrompt(claims),
            )
          ).text,
        ),
      async () =>
        parseCardsPayload(
          (
            await completeOnce(
              CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT,
              cardFromClaimCompactUserPrompt(claims),
            )
          ).text,
        ),
    );
  } catch (err) {
    if (isTruncationParseError(err) || isCardsParseFailure(err)) return [];
    throw err;
  }
}

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
 * Does not opt into AI Gateway response cache: sticky truncated/Layer-1-failing
 * completions would burn latency for the TTL; KV draft cache owns claim→card hits.
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
