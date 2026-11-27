import { describe, expect, it } from "vitest";
import {
  CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT,
  CARD_FROM_CLAIM_SYSTEM_PROMPT,
  cardFromClaimCompactSystemPrompt,
  cardFromClaimSystemPrompt,
} from "../../../worker/generation/card-from-claim-prompts";
import {
  CLAIM_CARD_ATLAS_PROMPT_VERSION,
  CLAIM_CARD_PROMPT_VERSION,
  claimCardDraftCacheKey,
  claimCardPromptVersion,
} from "../../../worker/generation/claim-card-draft-cache";
import type { StudyClaim } from "../../../worker/generation/claims";

const SUBJECT_ON_FRONT =
  /front\s+must\s+include\s+(?:the\s+)?claim\s+subject/i;

const CLAIM: StudyClaim = {
  subject: "Ascaris suum",
  predicate: "has major organ",
  object: "small intestine",
  source_span: "Major organ: small intestine",
};

const CACHE_BASE = {
  claim: CLAIM,
  type: "qa" as const,
  provider: "workers-ai",
  model: "@cf/zai-org/glm-4.7-flash",
  extraUserSuffix: "",
};

describe("atlas claim→card subject-anchoring prompt", () => {
  it("default CARD_FROM_CLAIM_SYSTEM_PROMPT does not require subject on front", () => {
    expect(CARD_FROM_CLAIM_SYSTEM_PROMPT).not.toMatch(SUBJECT_ON_FRONT);
    expect(CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT).not.toMatch(SUBJECT_ON_FRONT);
    expect(cardFromClaimSystemPrompt()).not.toMatch(SUBJECT_ON_FRONT);
    expect(cardFromClaimSystemPrompt({ atlasSubjectAnchor: false })).not.toMatch(
      SUBJECT_ON_FRONT,
    );
  });

  it("atlas-gated prompt requires front to include claim subject", () => {
    const atlas = cardFromClaimSystemPrompt({ atlasSubjectAnchor: true });
    expect(atlas).toMatch(SUBJECT_ON_FRONT);
    expect(atlas.startsWith(CARD_FROM_CLAIM_SYSTEM_PROMPT)).toBe(true);

    const atlasCompact = cardFromClaimCompactSystemPrompt({
      atlasSubjectAnchor: true,
    });
    expect(atlasCompact).toMatch(SUBJECT_ON_FRONT);
    expect(atlasCompact.startsWith(CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT)).toBe(
      true,
    );
  });

  it("atlas prompt version differs and changes cache key", async () => {
    expect(CLAIM_CARD_ATLAS_PROMPT_VERSION).not.toBe(CLAIM_CARD_PROMPT_VERSION);
    expect(claimCardPromptVersion({ atlasSubjectAnchor: true })).toBe(
      CLAIM_CARD_ATLAS_PROMPT_VERSION,
    );
    expect(claimCardPromptVersion()).toBe(CLAIM_CARD_PROMPT_VERSION);

    const defaultKey = await claimCardDraftCacheKey(CACHE_BASE);
    const atlasKey = await claimCardDraftCacheKey({
      ...CACHE_BASE,
      promptVersion: claimCardPromptVersion({ atlasSubjectAnchor: true }),
    });
    expect(atlasKey).not.toBe(defaultKey);
  });
});
