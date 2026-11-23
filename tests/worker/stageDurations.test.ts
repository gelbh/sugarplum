import { describe, expect, it } from "vitest";
import {
  STAGE_DURATION_KV_KEY,
  STAGE_WEIGHT_OVERLAY_MIN_N,
  computeDurationShareWeights,
  deriveStageDurationsMs,
  mergeStageDurationRollup,
  percentileMs,
  readEtaPriors,
  readStageWeightOverlay,
  recordStageDurationsBestEffort,
  resetStageWeightOverlayCacheForTests,
} from "../../worker/generation/stageDurations";
import type { Env } from "../../worker/env";

describe("deriveStageDurationsMs", () => {
  it("splits consecutive stage first-sightings", () => {
    const out = deriveStageDurationsMs({
      startedAt: "2026-11-23T12:00:00.000Z",
      finishedAt: "2026-11-23T12:10:00.000Z",
      events: [
        { at: "2026-11-23T12:00:00.000Z", stage: "extract" },
        { at: "2026-11-23T12:02:00.000Z", stage: "rules" },
        { at: "2026-11-23T12:03:00.000Z", stage: "claims" },
        { at: "2026-11-23T12:09:00.000Z", stage: "persist" },
      ],
    });
    expect(out.extract).toBe(120_000);
    expect(out.rules).toBe(60_000);
    expect(out.claims).toBe(360_000);
    expect(out.persist).toBe(60_000);
  });

  it("returns empty when no usable timeline", () => {
    expect(deriveStageDurationsMs({ events: [] })).toEqual({});
  });

  it("drops sub-200ms and over-2h samples", () => {
    const out = deriveStageDurationsMs({
      startedAt: "2026-11-23T12:00:00.000Z",
      finishedAt: "2026-11-23T15:00:00.000Z",
      events: [
        { at: "2026-11-23T12:00:00.000Z", stage: "extract" },
        { at: "2026-11-23T12:00:00.100Z", stage: "rules" },
        { at: "2026-11-23T15:00:00.000Z", stage: "persist" },
      ],
    });
    expect(out.extract).toBeUndefined();
    expect(out.rules).toBeUndefined();
  });
});

describe("percentileMs", () => {
  it("nearest-rank p50", () => {
    expect(percentileMs([60_000, 90_000, 120_000], 0.5)).toBe(90_000);
  });
});

function memoryKv() {
  const map = new Map<string, string>();
  return {
    async get(key: string) {
      return map.get(key) ?? null;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
  } as unknown as KVNamespace;
}

describe("mergeStageDurationRollup / readEtaPriors", () => {
  it("merge appends ring and exposes p50 when n>=3", async () => {
    const kv = memoryKv();
    await mergeStageDurationRollup(kv, { extract: 60_000 });
    await mergeStageDurationRollup(kv, { extract: 120_000 });
    await mergeStageDurationRollup(kv, { extract: 90_000 });
    const priors = await readEtaPriors(kv);
    expect(priors?.stages.extract?.n).toBe(3);
    expect(priors?.stages.extract?.p50_ms).toBe(90_000);
  });

  it("readEtaPriors omits stages with n<3", async () => {
    const kv = memoryKv();
    await mergeStageDurationRollup(kv, { rules: 10_000 });
    const priors = await readEtaPriors(kv);
    expect(priors).toBeNull();
  });
});

describe("recordStageDurationsBestEffort", () => {
  it("merges when status is needs_review", async () => {
    const kv = memoryKv();
    const env = {
      CACHE: kv,
      DB: {
        prepare() {
          return {
            bind() {
              return {
                async first() {
                  return {
                    status: "needs_review",
                    finished_at: "2026-11-23T12:10:00.000Z",
                    progress_json: JSON.stringify({
                      started_at: "2026-11-23T12:00:00.000Z",
                      events: [
                        {
                          at: "2026-11-23T12:00:00.000Z",
                          stage: "extract",
                        },
                        {
                          at: "2026-11-23T12:05:00.000Z",
                          stage: "persist",
                        },
                      ],
                    }),
                  };
                },
              };
            },
          };
        },
      },
    } as unknown as Env;

    await recordStageDurationsBestEffort(env, "job-1");
    const raw = await kv.get(STAGE_DURATION_KV_KEY);
    expect(raw).toContain("extract");
    expect(raw).toContain("persist");
  });

  it("no-ops when status is failed", async () => {
    const kv = memoryKv();
    const env = {
      CACHE: kv,
      DB: {
        prepare() {
          return {
            bind() {
              return {
                async first() {
                  return {
                    status: "failed",
                    finished_at: "2026-11-23T12:10:00.000Z",
                    progress_json: JSON.stringify({
                      events: [
                        {
                          at: "2026-11-23T12:00:00.000Z",
                          stage: "extract",
                        },
                        {
                          at: "2026-11-23T12:05:00.000Z",
                          stage: "persist",
                        },
                      ],
                    }),
                  };
                },
              };
            },
          };
        },
      },
    } as unknown as Env;

    await recordStageDurationsBestEffort(env, "job-fail");
    expect(await readEtaPriors(kv)).toBeNull();
  });
});

describe("computeDurationShareWeights", () => {
  it("returns null when any present stage has n below gate", () => {
    const out = computeDurationShareWeights({
      extract: { samples_ms: [1, 2, 3, 4], p50_ms: 10_000 },
      persist: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 30_000,
      },
    });
    expect(out).toBeNull();
  });

  it("shares match p50 proportions when every present stage meets n gate", () => {
    const out = computeDurationShareWeights({
      extract: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 10_000,
      },
      persist: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 30_000,
      },
    });
    expect(out).not.toBeNull();
    expect(out!.extract).toBeCloseTo(0.25, 5);
    expect(out!.persist).toBeCloseTo(0.75, 5);
    const sum = Object.values(out!).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("ignores queued even if present in rollup", () => {
    const out = computeDurationShareWeights({
      queued: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 1_000,
      },
      extract: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 10_000,
      },
      persist: {
        samples_ms: [1, 2, 3, 4, 5],
        p50_ms: 30_000,
      },
    });
    expect(out?.queued).toBeUndefined();
    expect(out!.extract).toBeCloseTo(0.25, 5);
    expect(out!.persist).toBeCloseTo(0.75, 5);
  });
});

describe("weight overlay on merge / read", () => {
  async function seedN(
    kv: KVNamespace,
    sample: Record<string, number>,
    n: number,
  ) {
    for (let i = 0; i < n; i++) {
      await mergeStageDurationRollup(kv, sample);
    }
  }

  it(`writes weights when every present stage reaches n>=${STAGE_WEIGHT_OVERLAY_MIN_N}`, async () => {
    const kv = memoryKv();
    await seedN(kv, { extract: 10_000, persist: 30_000 }, 5);
    const raw = await kv.get(STAGE_DURATION_KV_KEY);
    const parsed = JSON.parse(raw!) as {
      weights?: Record<string, number>;
    };
    expect(parsed.weights?.extract).toBeCloseTo(0.25, 5);
    expect(parsed.weights?.persist).toBeCloseTo(0.75, 5);
  });

  it("omits weights when any present stage is below the gate", async () => {
    const kv = memoryKv();
    await seedN(kv, { extract: 10_000 }, 5);
    await seedN(kv, { persist: 30_000 }, 4);
    const raw = await kv.get(STAGE_DURATION_KV_KEY);
    const parsed = JSON.parse(raw!) as {
      weights?: Record<string, number>;
    };
    expect(parsed.weights).toBeUndefined();
  });

  it("readStageWeightOverlay returns shares and falls back on corrupt", async () => {
    resetStageWeightOverlayCacheForTests();
    const kv = memoryKv();
    await seedN(kv, { extract: 10_000, persist: 30_000 }, 5);
    const overlay = await readStageWeightOverlay(kv);
    expect(overlay?.extract).toBeCloseTo(0.25, 5);
    expect(overlay?.persist).toBeCloseTo(0.75, 5);

    resetStageWeightOverlayCacheForTests();
    await kv.put(
      STAGE_DURATION_KV_KEY,
      JSON.stringify({
        v: 1,
        updated_at: "2026-11-23T12:00:00.000Z",
        stages: {},
        weights: { extract: 0.9, persist: 0.9 },
      }),
    );
    expect(await readStageWeightOverlay(kv)).toBeNull();
  });
});
