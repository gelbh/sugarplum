import { describe, expect, it } from "vitest";
import {
  STAGE_DURATION_KV_KEY,
  deriveStageDurationsMs,
  mergeStageDurationRollup,
  percentileMs,
  readEtaPriors,
  recordStageDurationsBestEffort,
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
