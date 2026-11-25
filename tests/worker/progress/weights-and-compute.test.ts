import { describe, expect, it } from "vitest";
import {
  IMAGE_STAGES,
  PDF_STAGES,
  PIPELINE_BAND,
  RULES_ONLY_STAGES,
  STAGE_WEIGHTS,
  TEXT_LLM_STAGES,
  computePercent,
  computePipelineBandPercent,
  effectiveWeights,
} from "../../../worker/generation/progress";

const FULL_STAGES = [
  "queued",
  "extract",
  "rules",
  "claims",
  "generate",
  "critique",
  "persist",
  "enrich",
] as const;

const NO_FREE_GEN = ["queued", "extract", "generate", "persist"] as const;

describe("STAGE_WEIGHTS", () => {
  it("covers catalog stages and sums to 1", () => {
    expect(STAGE_WEIGHTS.queued).toBe(0.02);
    expect(STAGE_WEIGHTS.extract).toBe(0.08);
    expect(STAGE_WEIGHTS.figures).toBe(0.1);
    expect(STAGE_WEIGHTS.rules).toBe(0.05);
    expect(STAGE_WEIGHTS.claims).toBe(0.15);
    expect(STAGE_WEIGHTS.generate).toBe(0.2);
    expect(STAGE_WEIGHTS.critique).toBe(0.2);
    expect(STAGE_WEIGHTS.persist).toBe(0.05);
    expect(STAGE_WEIGHTS.enrich).toBe(0.15);
    const sum = Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("includes claims in TEXT_LLM and PDF catalogs only", () => {
    expect(TEXT_LLM_STAGES).toContain("claims");
    expect(PDF_STAGES).toContain("claims");
    expect(IMAGE_STAGES).not.toContain("claims");
    expect(RULES_ONLY_STAGES).not.toContain("claims");
  });

  it("includes enrich in TEXT_LLM and PDF catalogs only", () => {
    expect(TEXT_LLM_STAGES).toContain("enrich");
    expect(PDF_STAGES).toContain("enrich");
    expect(IMAGE_STAGES).not.toContain("enrich");
    expect(RULES_ONLY_STAGES).not.toContain("enrich");
  });
});

describe("effectiveWeights overlay", () => {
  const present = ["queued", "extract", "persist"] as const;

  it("prefers duration-share overlay when sum is within ±0.01 of 1", () => {
    const weights = effectiveWeights(present, {
      extract: 0.25,
      persist: 0.75,
    });
    expect(weights.extract).toBeCloseTo(0.25, 5);
    expect(weights.persist).toBeCloseTo(0.75, 5);
    expect(weights.queued).toBe(0);
  });

  it("falls back to catalog when overlay is corrupt or missing", () => {
    const catalog = effectiveWeights(present);
    expect(effectiveWeights(present, null)).toEqual(catalog);
    expect(
      effectiveWeights(present, { extract: 0.9, persist: 0.9 }),
    ).toEqual(catalog);
    expect(effectiveWeights(present, { extract: Number.NaN })).toEqual(
      catalog,
    );
  });

  it("falls back to catalog when overlay omits a present non-queued stage", () => {
    const withFigures = [
      "queued",
      "extract",
      "figures",
      "persist",
    ] as const;
    const catalog = effectiveWeights(withFigures);
    expect(
      effectiveWeights(withFigures, { extract: 0.25, persist: 0.75 }),
    ).toEqual(catalog);
  });
});

describe("computePercent", () => {
  it("computes mid-chunk generate percent with full stage set", () => {
    // completed: queued+extract+rules+claims = 0.30; figures→generate 0.30 * (2/5) = 0.12 → 42%
    expect(computePercent("generate", 2, 5, [...FULL_STAGES])).toBeCloseTo(
      42,
      5,
    );
  });

  it("rolls skipped rules and critique weights into generate", () => {
    // skipped figures+rules+claims+critique+enrich = 0.65 → generate 0.85
    // completed: queued+extract = 0.10; within = 2/5 → 0.10 + 0.34 = 0.44 → 44%
    expect(computePercent("generate", 2, 5, [...NO_FREE_GEN])).toBeCloseTo(
      44,
      5,
    );

    // at start of generate (0/5): only completed weight
    expect(computePercent("generate", 0, 5, [...NO_FREE_GEN])).toBeCloseTo(
      10,
      5,
    );

    // after generate chunks done, still in generate: 0.10 + 0.85 = 0.95 → 95%
    expect(computePercent("generate", 5, 5, [...NO_FREE_GEN])).toBeCloseTo(
      95,
      5,
    );

    // persist with no within-stage units: completed before persist
    // 0.02+0.08+0.85 = 0.95 → 95%
    expect(computePercent("persist", 0, 0, [...NO_FREE_GEN])).toBeCloseTo(
      95,
      5,
    );
  });

  it("clamps to [0, 100]", () => {
    expect(computePercent("queued", -1, 1, [...FULL_STAGES])).toBe(0);
    expect(computePercent("persist", 99, 1, [...FULL_STAGES])).toBe(100);
  });

  it("treats total 0 as within-stage 0", () => {
    // still in extract: only queued completed = 2%
    expect(computePercent("extract", 0, 0, [...FULL_STAGES])).toBeCloseTo(2, 5);
  });

  it("is monotonic as generate current increases", () => {
    const stages = [...NO_FREE_GEN];
    let prev = -1;
    for (let current = 0; current <= 5; current++) {
      const p = computePercent("generate", current, 5, stages);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it("rolls skipped generate/critique into persist for rules-only runs", () => {
    const rulesOnly = ["queued", "extract", "rules", "persist"] as const;
    // completed before persist: 0.02+0.08+0.05 = 0.15; persist gets 0.05+0.80 = 0.85
    expect(computePercent("persist", 0, 1, [...rulesOnly])).toBeCloseTo(15, 5);
    expect(computePercent("persist", 1, 1, [...rulesOnly])).toBeCloseTo(100, 5);
  });

  it("is monotonic from generate into critique with full stages", () => {
    const stages = [...FULL_STAGES];
    const atGenerateDone = computePercent("generate", 2, 2, stages);
    const atCritiqueStart = computePercent("critique", 0, 2, stages);
    expect(atCritiqueStart).toBeGreaterThanOrEqual(atGenerateDone);
  });

  it("persist complete stays under 100 when enrich is present", () => {
    const stages = [
      "queued",
      "extract",
      "rules",
      "claims",
      "generate",
      "critique",
      "persist",
      "enrich",
    ] as const;
    expect(computePercent("persist", 1, 1, [...stages])).toBeLessThan(100);
    expect(computePercent("enrich", 1, 1, [...stages])).toBe(100);
  });
});

describe("computePipelineBandPercent", () => {
  it("is monotonic across interleaved generate/critique half-steps", () => {
    expect(PIPELINE_BAND).toContain("claims");
    expect(PIPELINE_BAND).toContain("generate");
    expect(PIPELINE_BAND).toContain("critique");
    const stages = [...FULL_STAGES];
    const n = 2;
    // Per chunk i: gen start 2i, gen done 2i+1, critique start 2i+1, critique done 2i+2
    const halfSteps = [0, 1, 1, 2, 2, 3, 3, 4];
    let prev = -1;
    for (const h of halfSteps) {
      const p = computePipelineBandPercent(h, n, stages);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    // After all LLM half-steps: base 0.15 + band 0.65 = 0.80 → 80%
    // (figures→generate; persist+enrich remain after band)
    expect(computePipelineBandPercent(4, n, stages)).toBeCloseTo(80, 5);
    // Mid: after first generate done (1/4 of band): 0.15 + 0.65*0.25 = 0.3125 → 31.25%
    expect(computePipelineBandPercent(1, n, stages)).toBeCloseTo(31.25, 5);
  });

  it("drops claims from the band when the catalog omits claims", () => {
    const withClaims = [...FULL_STAGES];
    const withoutClaims = FULL_STAGES.filter((s) => s !== "claims");
    // Same pre-band base (queued+extract+rules); without claims, that weight
    // rolls into generate so end-of-band percent stays 80.
    expect(computePipelineBandPercent(0, 2, withClaims)).toBeCloseTo(15, 5);
    expect(computePipelineBandPercent(0, 2, withoutClaims)).toBeCloseTo(15, 5);
    expect(computePipelineBandPercent(4, 2, withClaims)).toBeCloseTo(80, 5);
    expect(computePipelineBandPercent(4, 2, withoutClaims)).toBeCloseTo(80, 5);
  });

  it("does not rewind when re-entering generate after critique (vs computePercent)", () => {
    const stages = [...FULL_STAGES];
    const n = 2;
    // Old model rewound here; band model stays at critique-done of chunk 0 (= 2 half-steps)
    const afterCritiqueChunk0 = computePipelineBandPercent(2, n, stages);
    const generateChunk1Start = computePipelineBandPercent(2, n, stages);
    expect(generateChunk1Start).toBe(afterCritiqueChunk0);
    expect(generateChunk1Start).toBeGreaterThan(
      computePercent("generate", 1, 2, stages),
    );
  });
});
