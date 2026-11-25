import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
} from "../../harness";
import { afterEach, describe, it, expect } from "vitest";
import type { StudyClaim } from "../../../../worker/generation/claims";
import {
  CLAIM_CARD_DRAFT_CACHE_TTL_SECONDS,
  CLAIM_CARD_PROMPT_VERSION,
  claimCardDraftCacheKey,
  readClaimCardDraft,
  writeClaimCardDraft,
} from "../../../../worker/generation/claim-card-draft-cache";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const CLAIM: StudyClaim = {
  subject: "Mitochondria",
  predicate: "produce ATP",
  object: "ATP",
  source_span: "Mitochondria produce ATP",
};

const BASE = {
  claim: CLAIM,
  type: "mcq" as const,
  provider: "workers-ai",
  model: "@cf/zai-org/glm-4.7-flash",
  extraUserSuffix: "Write a shorter single-fact card.",
};

describe("claimCardDraftCacheKey", () => {
  it("is stable for identical inputs", async () => {
    const a = await claimCardDraftCacheKey(BASE);
    const b = await claimCardDraftCacheKey({ ...BASE });
    expect(a).toBe(b);
    expect(a.startsWith("cache:claim-card:v1:")).toBe(true);
  });

  it("changes when source_span, type, suffix, model, pages, or promptVersion differ", async () => {
    const base = await claimCardDraftCacheKey(BASE);
    expect(
      await claimCardDraftCacheKey({
        ...BASE,
        claim: { ...CLAIM, source_span: "Different span" },
      }),
    ).not.toBe(base);
    expect(await claimCardDraftCacheKey({ ...BASE, type: "qa" })).not.toBe(
      base,
    );
    expect(
      await claimCardDraftCacheKey({
        ...BASE,
        extraUserSuffix: "other suffix",
      }),
    ).not.toBe(base);
    expect(
      await claimCardDraftCacheKey({ ...BASE, model: "other-model" }),
    ).not.toBe(base);
    expect(
      await claimCardDraftCacheKey({
        ...BASE,
        claim: { ...CLAIM, pages: [1, 2] },
      }),
    ).not.toBe(base);
    expect(
      await claimCardDraftCacheKey({
        ...BASE,
        promptVersion: `${CLAIM_CARD_PROMPT_VERSION}-bump`,
      }),
    ).not.toBe(base);
  });

  it("ignores claim id for keying", async () => {
    const withId = await claimCardDraftCacheKey({
      ...BASE,
      claim: { ...CLAIM },
    });
    expect(withId).toBe(await claimCardDraftCacheKey(BASE));
  });
});

describe("readClaimCardDraft / writeClaimCardDraft", () => {
  it("round-trips a Layer-1-passing draft through env.CACHE", async () => {
    const env = cfEnv;
    const draft = {
      type: "mcq" as const,
      front: "Which organelle produces ATP?",
      back: "Mitochondria",
      options: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
      provenance: { pages: [1], excerpt: "Mitochondria produce ATP" },
    };
    expect(CLAIM_CARD_DRAFT_CACHE_TTL_SECONDS).toBe(86400);
    await writeClaimCardDraft(env.CACHE, BASE, draft);
    expect(await readClaimCardDraft(env.CACHE, BASE)).toEqual(draft);
    expect(
      await readClaimCardDraft(env.CACHE, {
        ...BASE,
        extraUserSuffix: "miss",
      }),
    ).toBeNull();
  });
});
