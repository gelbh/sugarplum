import {
  cardFromClaimCompactSystemPrompt,
  cardFromClaimCompactUserPrompt,
  cardFromClaimSystemPrompt,
  cardFromClaimUserPrompt,
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
import type { CardDraft } from "./schema";

export type ClaimStageLlm = {
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
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
  args: ClaimStageLlm & {
    extraUserSuffix?: string;
    /** Atlas job provenance: require claim subject on card front. */
    atlasSubjectAnchor?: boolean;
  },
): Promise<CardDraft[]> {
  if (claims.length === 0) return [];
  const { llm, apiKey, provider, extraUserSuffix, atlasSubjectAnchor } = args;
  const promptOpts = { atlasSubjectAnchor: Boolean(atlasSubjectAnchor) };
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
              cardFromClaimSystemPrompt(promptOpts),
              cardFromClaimUserPrompt(claims),
            )
          ).text,
        ),
      async () =>
        parseCardsPayload(
          (
            await completeOnce(
              cardFromClaimCompactSystemPrompt(promptOpts),
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