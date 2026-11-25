import { describe, expect, it, vi } from "vitest";
import {
  CLAIM_GAP_EXTRACT_MAX,
  runClaimGapExtract,
} from "../../../../worker/generation/claim-gap-extract";
import type { StoredClaim } from "../../../../worker/generation/claims";

function claim(span: string, id = crypto.randomUUID()): StoredClaim {
  return {
    id,
    subject: "X",
    predicate: "is",
    object: "Y",
    source_span: span,
  };
}

describe("runClaimGapExtract", () => {
  const material =
    "ATP is adenosine triphosphate.\nCells make ATP in the mitochondria.";

  it("fills a residual line via one gap pass", async () => {
    const extractOnce = vi.fn(async () => [
      claim("Cells make ATP in the mitochondria."),
    ]);
    const result = await runClaimGapExtract({
      material,
      claims: [claim("ATP is adenosine triphosphate.")],
      extractOnce,
      maxPasses: 1,
    });
    expect(extractOnce).toHaveBeenCalledTimes(1);
    expect(result.passes).toBe(1);
    expect(result.gaps).toEqual([]);
    expect(result.claims).toHaveLength(2);
  });

  it("stops when gap pass adds nothing", async () => {
    const extractOnce = vi.fn(async () => [] as StoredClaim[]);
    const result = await runClaimGapExtract({
      material,
      claims: [claim("ATP is adenosine triphosphate.")],
      extractOnce,
      maxPasses: 2,
    });
    expect(extractOnce).toHaveBeenCalledTimes(1);
    expect(result.passes).toBe(1);
    expect(result.gaps.some((g) => /mitochondria/i.test(g))).toBe(true);
  });

  it("respects maxPasses", async () => {
    const extractOnce = vi.fn(async () => [
      claim(`noise ${crypto.randomUUID()}`),
    ]);
    const result = await runClaimGapExtract({
      material,
      claims: [claim("ATP is adenosine triphosphate.")],
      extractOnce,
      maxPasses: CLAIM_GAP_EXTRACT_MAX,
    });
    expect(extractOnce).toHaveBeenCalledTimes(CLAIM_GAP_EXTRACT_MAX);
    expect(result.passes).toBe(CLAIM_GAP_EXTRACT_MAX);
    expect(result.gaps.length).toBeGreaterThan(0);
  });

  it("soft-fails when extractOnce throws", async () => {
    const extractOnce = vi.fn(async () => {
      throw new Error("llm down");
    });
    const seed = [claim("ATP is adenosine triphosphate.")];
    const result = await runClaimGapExtract({
      material,
      claims: seed,
      extractOnce,
      maxPasses: 1,
    });
    expect(result.passes).toBe(0);
    expect(result.claims).toEqual(seed);
    expect(result.gaps.some((g) => /mitochondria/i.test(g))).toBe(true);
  });
});
