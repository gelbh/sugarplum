import { describe, expect, it } from "vitest";
import {
  STAGE_WEIGHTS,
  computePercent,
  computePipelineBandPercent,
  toProgressJson,
  writeJobProgress,
} from "../../worker/generation/progress";
import { createTestEnv } from "./test-env";

const FULL_STAGES = [
  "queued",
  "extract",
  "rules",
  "generate",
  "critique",
  "persist",
] as const;

const NO_FREE_GEN = ["queued", "extract", "generate", "persist"] as const;

describe("STAGE_WEIGHTS", () => {
  it("covers catalog stages and sums to 1", () => {
    expect(STAGE_WEIGHTS.queued).toBe(0.02);
    expect(STAGE_WEIGHTS.extract).toBe(0.08);
    expect(STAGE_WEIGHTS.figures).toBe(0.1);
    expect(STAGE_WEIGHTS.rules).toBe(0.05);
    expect(STAGE_WEIGHTS.generate).toBe(0.35);
    expect(STAGE_WEIGHTS.critique).toBe(0.3);
    expect(STAGE_WEIGHTS.persist).toBe(0.1);
    const sum = Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("computePercent", () => {
  it("computes mid-chunk generate percent with full stage set", () => {
    // completed: queued+extract+rules = 0.15; generate 0.45 * (2/5) = 0.18 → 33%
    expect(
      computePercent("generate", 2, 5, [...FULL_STAGES]),
    ).toBeCloseTo(33, 5);
  });

  it("rolls skipped rules and critique weights into generate", () => {
    // generate effective = 0.45 + 0.05 + 0.30 = 0.80
    // completed: queued+extract = 0.10; within = 2/5 → 0.10 + 0.32 = 0.42 → 42%
    expect(
      computePercent("generate", 2, 5, [...NO_FREE_GEN]),
    ).toBeCloseTo(42, 5);

    // at start of generate (0/5): only completed weight
    expect(
      computePercent("generate", 0, 5, [...NO_FREE_GEN]),
    ).toBeCloseTo(10, 5);

    // after generate chunks done, still in generate: 0.10 + 0.80 = 0.90 → 90%
    expect(
      computePercent("generate", 5, 5, [...NO_FREE_GEN]),
    ).toBeCloseTo(90, 5);

    // persist with no within-stage units: completed before persist
    // 0.02+0.08+0.80 = 0.90 → 90%
    expect(
      computePercent("persist", 0, 0, [...NO_FREE_GEN]),
    ).toBeCloseTo(90, 5);
  });

  it("clamps to [0, 100]", () => {
    expect(computePercent("queued", -1, 1, [...FULL_STAGES])).toBe(0);
    expect(computePercent("persist", 99, 1, [...FULL_STAGES])).toBe(100);
  });

  it("treats total 0 as within-stage 0", () => {
    // still in extract: only queued completed = 2%
    expect(
      computePercent("extract", 0, 0, [...FULL_STAGES]),
    ).toBeCloseTo(2, 5);
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
    // completed before persist: 0.02+0.08+0.05 = 0.15; persist gets 0.10+0.75 = 0.85
    expect(computePercent("persist", 0, 1, [...rulesOnly])).toBeCloseTo(15, 5);
    expect(computePercent("persist", 1, 1, [...rulesOnly])).toBeCloseTo(100, 5);
  });

  it("is monotonic from generate into critique with full stages", () => {
    const stages = [...FULL_STAGES];
    const atGenerateDone = computePercent("generate", 2, 2, stages);
    const atCritiqueStart = computePercent("critique", 0, 2, stages);
    expect(atCritiqueStart).toBeGreaterThanOrEqual(atGenerateDone);
  });
});

describe("computePipelineBandPercent", () => {
  it("is monotonic across interleaved generate/critique half-steps", () => {
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
    // After all LLM half-steps: base 0.15 + band 0.75 = 0.90 → 90%
    expect(computePipelineBandPercent(4, n, stages)).toBeCloseTo(90, 5);
    // Mid: after first generate done (1/4 of band): 0.15 + 0.75*0.25 = 0.3375 → 33.75%
    expect(computePipelineBandPercent(1, n, stages)).toBeCloseTo(33.75, 5);
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

describe("toProgressJson", () => {
  it("serializes server progress snapshot fields", () => {
    const json = toProgressJson({
      stage: "generate",
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
    });
    expect(JSON.parse(json)).toEqual({
      stage: "generate",
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
    });
  });
});

describe("writeJobProgress", () => {
  it("persists progress_json on the generation job row", async () => {
    const env = createTestEnv();
    const createdAt = "2026-10-26T00:00:00.000Z";
    env.seedUser({
      id: "u1",
      email: "a@b.co",
      password_hash: "x",
      oauth_subject: null,
      created_at: createdAt,
    });
    env.seedDeck({
      id: "d1",
      user_id: "u1",
      title: "Deck",
      subject_hint: null,
      created_at: createdAt,
    });
    env.seedMaterial({
      id: "m1",
      deck_id: "d1",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: createdAt,
    });
    await env.DB.prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("j1", "m1", "running", null, null, createdAt, null)
      .run();

    const patch = {
      stage: "generate" as const,
      current: 2,
      total: 5,
      percent: 42,
      label: "Generating cards (chunk 2/5)",
    };
    await writeJobProgress(env.DB, "j1", patch);

    const jobs = env.getGenerationJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].progress_json).toBe(toProgressJson(patch));
  });
});
