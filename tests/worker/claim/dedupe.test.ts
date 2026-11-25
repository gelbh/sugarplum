import { describe, expect, it, vi } from "vitest";
import {
  CLAIM_SEMANTIC_COSINE,
  claimExactKey,
  cosineSimilarity,
  mergeClaimInto,
  mergeClaimsForJob,
} from "../../../worker/generation/claim-dedupe";
import type { StoredClaim } from "../../../worker/generation/claims";

function claim(
  partial: Partial<StoredClaim> & Pick<StoredClaim, "id" | "subject" | "predicate" | "source_span">,
): StoredClaim {
  return { ...partial };
}

describe("claimExactKey", () => {
  it("normalizes whitespace and case", () => {
    expect(
      claimExactKey(
        claim({
          id: "a",
          subject: "  Lysozyme ",
          predicate: "DIGESTS",
          object: "peptidoglycan",
          source_span: "x",
        }),
      ),
    ).toBe("lysozyme|digests|peptidoglycan");
  });
});

describe("mergeClaimInto", () => {
  it("keeps into id and source_span, unions pages", () => {
    const into = claim({
      id: "keep",
      subject: "IgA",
      predicate: "protects",
      source_span: "short",
      pages: [1],
    });
    const from = claim({
      id: "drop",
      subject: "IgA",
      predicate: "protects",
      source_span: "a much longer source span",
      pages: [2, 1],
      object: "mucosa",
    });
    const merged = mergeClaimInto(into, from);
    expect(merged.id).toBe("keep");
    expect(merged.source_span).toBe("short");
    expect(merged.pages).toEqual([1, 2]);
    expect(merged.object).toBe("mucosa");
  });
});

describe("mergeClaimsForJob", () => {
  it("merges exact keys and unions pages", async () => {
    const out = await mergeClaimsForJob([
      claim({
        id: "a",
        subject: "C1",
        predicate: "is called",
        object: "atlas",
        source_span: "C1 is atlas",
        pages: [1],
      }),
      claim({
        id: "b",
        subject: "c1",
        predicate: "Is Called",
        object: "Atlas",
        source_span: "C1 vertebra is called the atlas vertebra",
        pages: [3],
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
    expect(out[0]!.pages).toEqual([1, 3]);
    expect(out[0]!.source_span).toBe("C1 is atlas");
  });

  it("merges fuzzy near-duplicate claim text", async () => {
    const out = await mergeClaimsForJob([
      claim({
        id: "a",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan in bacterial walls",
        source_span: "span a",
      }),
      claim({
        id: "b",
        subject: "Lysozyme",
        predicate: "digests peptidoglycan in bacterial cell walls",
        source_span: "span b longer here",
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
  });

  it("merges fuzzy pairs transitively via union-find", async () => {
    // A≈B and B≈C at Jaccard 0.8; A≉C (~0.64). Order [A,C,B] breaks greedy merge.
    const a = claim({
      id: "a",
      subject: "tok01 tok02 tok03 tok04 tok05",
      predicate: "tok06 tok07 tok08 tok09",
      source_span: "a",
    });
    const b = claim({
      id: "b",
      subject: "tok01 tok02 tok03 tok04 tok05",
      predicate: "tok06 tok07 tok08 tok10",
      source_span: "b",
    });
    const c = claim({
      id: "c",
      subject: "tok01 tok02 tok03 tok04 tok05",
      predicate: "tok06 tok07 tok10 tok11",
      source_span: "c",
    });
    const out = await mergeClaimsForJob([a, c, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
  });

  it("merges semantic paraphrases when embed cosine is high", async () => {
    const v1 = [1, 0, 0];
    const v2 = [0.999, 0.01, 0];
    expect(cosineSimilarity(v1, v2)).toBeGreaterThanOrEqual(
      CLAIM_SEMANTIC_COSINE,
    );
    const embed = vi.fn(async () => [v1, v2]);
    const out = await mergeClaimsForJob(
      [
        claim({
          id: "a",
          subject: "Etiology of X",
          predicate: "is bacterial",
          source_span: "etiology span",
        }),
        claim({
          id: "b",
          subject: "Causes of X",
          predicate: "are bacterial",
          source_span: "causes span",
        }),
      ],
      embed,
    );
    expect(embed).toHaveBeenCalledOnce();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a");
  });

  it("keeps distinct claims below semantic threshold", async () => {
    const embed = vi.fn(async () => [
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const out = await mergeClaimsForJob(
      [
        claim({
          id: "a",
          subject: "MHC I",
          predicate: "presents to CD8",
          source_span: "mhc1",
        }),
        claim({
          id: "b",
          subject: "MHC II",
          predicate: "presents to CD4",
          source_span: "mhc2",
        }),
      ],
      embed,
    );
    expect(out).toHaveLength(2);
  });

  it("fail-opens when embed returns null", async () => {
    const embed = vi.fn(async () => null);
    const out = await mergeClaimsForJob(
      [
        claim({
          id: "a",
          subject: "Alpha",
          predicate: "does one thing",
          source_span: "a",
        }),
        claim({
          id: "b",
          subject: "Beta",
          predicate: "does another",
          source_span: "b",
        }),
      ],
      embed,
    );
    expect(out).toHaveLength(2);
  });

  it("fail-opens when embed throws", async () => {
    const embed = vi.fn(async () => {
      throw new Error("neurons exhausted");
    });
    const out = await mergeClaimsForJob(
      [
        claim({
          id: "a",
          subject: "Alpha",
          predicate: "does one thing",
          source_span: "a",
        }),
        claim({
          id: "b",
          subject: "Beta",
          predicate: "does another",
          source_span: "b",
        }),
      ],
      embed,
    );
    expect(out).toHaveLength(2);
  });
});
