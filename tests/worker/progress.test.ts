import { describe, expect, it } from "vitest";
import {
  GENERATE_QUEUE_MAX_RETRIES,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  IMAGE_STAGES,
  PDF_STAGES,
  PIPELINE_BAND,
  RULES_ONLY_STAGES,
  RUNNING_JOB_STALE_MS,
  STAGE_WEIGHTS,
  TEXT_LLM_STAGES,
  accumulateTokenUsage,
  computePercent,
  computePipelineBandPercent,
  effectiveWeights,
  isFreeGenCharged,
  isRunningJobStale,
  pushProgressEvent,
  toProgressJson,
  truncateProgressText,
  withFreeGenCharged,
  withUpdatedAt,
  writeJobProgress,
  readStartedAt,
  withoutStartedAt,
} from "../../worker/generation/progress";
import { createTestEnv } from "./test-env";

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

describe("truncateProgressText", () => {
  it("strips C0 control chars except newline and space, then slices", () => {
    const withControls = "hello\u0000\u0007world\nok\tthere";
    expect(truncateProgressText(withControls)).toBe("helloworld\nokthere");
    expect(truncateProgressText("a".repeat(200))).toBe("a".repeat(160));
    expect(truncateProgressText("short", 160)).toBe("short");
  });
});

describe("pushProgressEvent", () => {
  const sample = (i: number) => ({
    at: "2026-10-27T00:00:00.000Z",
    kind: "stage" as const,
    stage: "generate",
    text: `event ${i}`,
  });

  it("starts from empty when events undefined", () => {
    expect(pushProgressEvent(undefined, sample(1))).toEqual([sample(1)]);
  });

  it("drops oldest when exceeding max (default 12)", () => {
    let events: ReturnType<typeof sample>[] = [];
    for (let i = 0; i < 13; i++) {
      events = pushProgressEvent(events, sample(i));
    }
    expect(events).toHaveLength(12);
    expect(events[0].text).toBe("event 1");
    expect(events[11].text).toBe("event 12");
  });
});

describe("isRunningJobStale", () => {
  const createdAt = "2026-10-27T17:00:00.000Z";
  const createdMs = Date.parse(createdAt);

  it("is stale when only created_at is older than the threshold", () => {
    expect(
      isRunningJobStale(null, createdAt, createdMs + RUNNING_JOB_STALE_MS),
    ).toBe(true);
  });

  it("is fresh when updated_at is within the threshold", () => {
    const updatedAt = "2026-10-27T17:10:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS - 1;
    expect(
      isRunningJobStale(
        JSON.stringify({ updated_at: updatedAt }),
        createdAt,
        now,
      ),
    ).toBe(false);
  });

  it("uses the newest event at when updated_at is absent", () => {
    const eventAt = "2026-10-27T17:15:00.000Z";
    const now = Date.parse(eventAt) + RUNNING_JOB_STALE_MS - 1;
    expect(
      isRunningJobStale(
        JSON.stringify({
          events: [{ at: eventAt, kind: "excerpt", stage: "extract", text: "x" }],
        }),
        createdAt,
        now,
      ),
    ).toBe(false);
  });

  it("does not let a fresh created_at mask a stale updated_at", () => {
    const updatedAt = "2026-10-27T17:00:00.000Z";
    const freshCreated = "2026-10-27T18:00:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS;
    expect(
      isRunningJobStale(
        JSON.stringify({ updated_at: updatedAt }),
        freshCreated,
        now,
      ),
    ).toBe(true);
  });

  it("ignores newer events when updated_at is present", () => {
    const updatedAt = "2026-10-27T17:00:00.000Z";
    const eventAt = "2026-10-27T18:00:00.000Z";
    const now = Date.parse(updatedAt) + RUNNING_JOB_STALE_MS;
    expect(
      isRunningJobStale(
        JSON.stringify({
          updated_at: updatedAt,
          events: [{ at: eventAt, kind: "excerpt", stage: "extract", text: "x" }],
        }),
        createdAt,
        now,
      ),
    ).toBe(true);
  });

  it("withUpdatedAt sets heartbeat and preserves stage fields", () => {
    const next = JSON.parse(
      withUpdatedAt(
        JSON.stringify({
          stage: "figures",
          current: 2,
          total: 2,
          percent: 20,
          label: "Processing figures",
        }),
        "2026-10-27T19:00:00.000Z",
      ),
    );
    expect(next).toMatchObject({
      stage: "figures",
      current: 2,
      total: 2,
      percent: 20,
      label: "Processing figures",
      updated_at: "2026-10-27T19:00:00.000Z",
    });
  });

  it("withFreeGenCharged sets marker and isFreeGenCharged reads it", () => {
    expect(isFreeGenCharged(null)).toBe(false);
    expect(isFreeGenCharged('{"stage":"extract"}')).toBe(false);
    const next = JSON.parse(
      withFreeGenCharged(
        JSON.stringify({
          stage: "extract",
          current: 0,
          total: 0,
          percent: 5,
          label: "Extracting material",
        }),
      ),
    );
    expect(next.free_gen_charged).toBe(true);
    expect(next.stage).toBe("extract");
    expect(isFreeGenCharged(JSON.stringify(next))).toBe(true);
  });

  it("queue retry constants span the stale window", () => {
    expect(
      GENERATE_QUEUE_MAX_RETRIES * GENERATE_QUEUE_RETRY_DELAY_SEC * 1000,
    ).toBeGreaterThanOrEqual(RUNNING_JOB_STALE_MS);
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

  it("includes optional fields when set and omits when absent", () => {
    const full = toProgressJson({
      stage: "generate",
      current: 1,
      total: 3,
      percent: 10,
      label: "Gen",
      tokens_used: 100,
      tokens_prompt: 60,
      tokens_completion: 40,
      drafts_so_far: 2,
      path: "free",
      started_at: "2026-10-29T10:00:00.000Z",
      events: [
        {
          at: "2026-10-27T00:00:00.000Z",
          kind: "draft",
          stage: "generate",
          text: "card draft",
        },
      ],
    });
    expect(JSON.parse(full)).toEqual({
      stage: "generate",
      current: 1,
      total: 3,
      percent: 10,
      label: "Gen",
      tokens_used: 100,
      tokens_prompt: 60,
      tokens_completion: 40,
      drafts_so_far: 2,
      path: "free",
      started_at: "2026-10-29T10:00:00.000Z",
      events: [
        {
          at: "2026-10-27T00:00:00.000Z",
          kind: "draft",
          stage: "generate",
          text: "card draft",
        },
      ],
    });

    const minimal = toProgressJson({
      stage: "queued",
      current: 0,
      total: 0,
      percent: 0,
      label: "Queued",
    });
    const parsed = JSON.parse(minimal) as Record<string, unknown>;
    expect(parsed).toEqual({
      stage: "queued",
      current: 0,
      total: 0,
      percent: 0,
      label: "Queued",
    });
    expect(parsed).not.toHaveProperty("tokens_used");
    expect(parsed).not.toHaveProperty("events");
    expect(parsed).not.toHaveProperty("path");
    expect(parsed).not.toHaveProperty("started_at");
  });

  it("withUpdatedAt claim heartbeat does not invent started_at", () => {
    const next = JSON.parse(withUpdatedAt(null, "2026-10-29T10:00:00.000Z"));
    expect(next).not.toHaveProperty("started_at");
    expect(next.stage).toBe("queued");
  });

  it("readStartedAt returns ISO when present", () => {
    expect(readStartedAt(null)).toBeUndefined();
    expect(
      readStartedAt(
        toProgressJson({
          stage: "generate",
          current: 1,
          total: 2,
          percent: 40,
          label: "Gen",
          started_at: "2026-10-29T10:00:00.000Z",
        }),
      ),
    ).toBe("2026-10-29T10:00:00.000Z");
  });

  it("withoutStartedAt strips started_at for reclaim restart", () => {
    const seeded = toProgressJson({
      stage: "generate",
      current: 1,
      total: 2,
      percent: 40,
      label: "Gen",
      started_at: "2026-10-29T10:00:00.000Z",
    });
    const cleared = withoutStartedAt(seeded);
    expect(cleared).not.toBeNull();
    expect(readStartedAt(cleared)).toBeUndefined();
    expect(JSON.parse(cleared!).stage).toBe("generate");
    expect(withoutStartedAt(null)).toBeNull();
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
      path: "free" as const,
      drafts_so_far: 3,
      events: [
        {
          at: "2026-10-26T12:00:00.000Z",
          kind: "draft" as const,
          stage: "generate",
          text: "Sample draft preview",
        },
      ],
    };
    await writeJobProgress(env.DB, "j1", patch);

    const jobs = env.getGenerationJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].progress_json).toBe(toProgressJson(patch));
    const roundTrip = JSON.parse(jobs[0].progress_json!) as Record<
      string,
      unknown
    >;
    expect(roundTrip.path).toBe("free");
    expect(roundTrip.drafts_so_far).toBe(3);
    expect(roundTrip.events).toHaveLength(1);
  });
});

describe("accumulateTokenUsage", () => {
  it("sums prompt/completion/total across two LLM calls", () => {
    const acc: {
      tokens_used?: number;
      tokens_prompt?: number;
      tokens_completion?: number;
    } = {};
    accumulateTokenUsage(acc, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    accumulateTokenUsage(acc, {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
    });
    expect(acc.tokens_prompt).toBe(30);
    expect(acc.tokens_completion).toBe(13);
    expect(acc.tokens_used).toBe(43);
  });

  it("derives total from prompt+completion when total_tokens absent", () => {
    const acc: {
      tokens_used?: number;
      tokens_prompt?: number;
      tokens_completion?: number;
    } = {};
    accumulateTokenUsage(acc, { prompt_tokens: 4, completion_tokens: 6 });
    expect(acc.tokens_used).toBe(10);
    accumulateTokenUsage(acc, { prompt_tokens: 1, completion_tokens: 2 });
    expect(acc.tokens_prompt).toBe(5);
    expect(acc.tokens_completion).toBe(8);
    expect(acc.tokens_used).toBe(13);
  });
});
