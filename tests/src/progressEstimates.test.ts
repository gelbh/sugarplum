import { describe, expect, it } from "vitest";
import {
  etaMs,
  calmDisplayEtaMs,
  combineEtaMs,
  updateEwmaRate,
  remainingPriorMs,
  resolveJobStartedAtMs,
  projectTokensFromPercent,
  projectCardsFromPercent,
  projectTokens,
  projectCardsThisJob,
  remainingCardsToday,
  ETA_SEED_TOTAL_MS,
  CLIENT_STAGE_WEIGHTS,
  effectiveClientWeights,
} from "../../src/progress/estimates";
import { formatEtaCompact, formatEtaSubline } from "../../src/progress/copy";
import {
  STAGE_WEIGHTS,
  effectiveWeights,
  TEXT_LLM_STAGES,
} from "../../worker/generation/progress";

describe("etaMs", () => {
  it("returns null when percent < 5", () => {
    expect(etaMs(10_000, 4.9)).toBeNull();
  });
  it("extrapolates remaining time", () => {
    expect(etaMs(10_000, 20)).toBe(40_000);
  });
});

describe("calmDisplayEtaMs", () => {
  it("returns null when percent < 5", () => {
    expect(
      calmDisplayEtaMs({
        percent: 4.9,
        previous: null,
        nowMs: 1_000,
        rawEtaMs: 40_000,
      }),
    ).toEqual({ etaMs: null, sample: null });
  });

  it("first sample uses rawEtaMs", () => {
    const result = calmDisplayEtaMs({
      percent: 20,
      previous: null,
      nowMs: 10_000,
      rawEtaMs: 40_000,
    });
    expect(result.etaMs).toBe(40_000);
    expect(result.sample).toEqual({
      percent: 20,
      displayEtaMs: 40_000,
      atMs: 10_000,
    });
  });

  it("flat percent countdowns instead of growing with elapsed", () => {
    const first = calmDisplayEtaMs({
      percent: 25,
      previous: null,
      nowMs: 10_000,
      rawEtaMs: 30_000,
    });
    expect(first.etaMs).toBe(30_000);
    const held = calmDisplayEtaMs({
      percent: 25,
      previous: first.sample,
      nowMs: 15_000,
      rawEtaMs: 45_000,
    });
    expect(held.etaMs).toBe(25_000);
    expect(held.sample).toEqual(first.sample);
  });

  it("returns null when flat countdown hits zero but keeps anchor", () => {
    const first = calmDisplayEtaMs({
      percent: 50,
      previous: null,
      nowMs: 10_000,
      rawEtaMs: 10_000,
    });
    expect(first.etaMs).toBe(10_000);
    const stalled = calmDisplayEtaMs({
      percent: 50,
      previous: first.sample,
      nowMs: 25_000,
      rawEtaMs: 10_000,
    });
    expect(stalled.etaMs).toBeNull();
    expect(stalled.sample).toEqual(first.sample);
  });

  it("recomputes raw when percent increases (may grow)", () => {
    const first = calmDisplayEtaMs({
      percent: 20,
      previous: null,
      nowMs: 10_000,
      rawEtaMs: 20_000,
    });
    const next = calmDisplayEtaMs({
      percent: 30,
      previous: first.sample,
      nowMs: 12_000,
      rawEtaMs: 50_000,
    });
    expect(next.etaMs).toBe(50_000);
    expect(next.sample?.percent).toBe(30);
  });

  it("recomputes raw when percent decreases", () => {
    const first = calmDisplayEtaMs({
      percent: 40,
      previous: null,
      nowMs: 10_000,
      rawEtaMs: 15_000,
    });
    const next = calmDisplayEtaMs({
      percent: 20,
      previous: first.sample,
      nowMs: 12_000,
      rawEtaMs: 40_000,
    });
    expect(next.etaMs).toBe(40_000);
    expect(next.sample?.percent).toBe(20);
  });
});

describe("updateEwmaRate / combineEtaMs", () => {
  it("needs two positive bumps before rate samples >= 2", () => {
    let state = updateEwmaRate(null, 10, 1_000);
    state = updateEwmaRate(state, 20, 2_000);
    expect(state?.samples).toBe(1);
    state = updateEwmaRate(state, 30, 3_000);
    expect(state?.samples).toBe(2);
    expect(state!.smoothedPerMs).toBeGreaterThan(0);
  });

  it("combine uses seed for current stage when ewma cold", () => {
    const eta = combineEtaMs({
      percent: 10,
      stage: "claims",
      presentStages: ["extract", "rules", "claims", "generate", "persist"],
      ewma: null,
      priors: null,
      current: 0,
      total: 0,
    });
    expect(eta).toBeGreaterThan(0);
    expect(eta).toBe(
      0.15 * ETA_SEED_TOTAL_MS +
        remainingPriorMs({
          stage: "claims",
          presentStages: ["extract", "rules", "claims", "generate", "persist"],
          priors: null,
        }),
    );
  });

  it("remainingPriorMs prefers p50 when n>=3", () => {
    const seeded = remainingPriorMs({
      stage: "claims",
      presentStages: ["claims", "generate", "persist"],
      priors: null,
    });
    const withPrior = remainingPriorMs({
      stage: "claims",
      presentStages: ["claims", "generate", "persist"],
      priors: {
        stages: {
          generate: { p50_ms: 1_000, n: 3 },
          persist: { p50_ms: 500, n: 5 },
        },
      },
    });
    expect(withPrior).toBe(1_500);
    expect(withPrior).toBeLessThan(seeded);
  });
});

describe("effectiveClientWeights parity", () => {
  it("matches worker STAGE_WEIGHTS catalog", () => {
    expect(CLIENT_STAGE_WEIGHTS).toEqual({ ...STAGE_WEIGHTS });
  });

  it("matches worker effectiveWeights for text LLM catalog", () => {
    const client = effectiveClientWeights([...TEXT_LLM_STAGES]);
    const worker = effectiveWeights(TEXT_LLM_STAGES);
    expect(client).toEqual(worker);
  });
});

describe("formatEta coarsening", () => {
  it("drops seconds at or above 2 minutes", () => {
    expect(formatEtaSubline(18 * 60 * 1000)).toBe("About 18m left");
    expect(formatEtaCompact(18 * 60 * 1000)).toBe("~18m");
  });

  it("keeps seconds under 2 minutes", () => {
    expect(formatEtaSubline(90_000)).toBe("About 1m 30s left");
  });

  it("rounds to nearest minute at or above 2 minutes", () => {
    expect(formatEtaSubline(179_000)).toBe("About 3m left");
    expect(formatEtaCompact(149_000)).toBe("~2m");
  });
});

describe("resolveJobStartedAtMs", () => {
  it("prefers started_at over events", () => {
    expect(
      resolveJobStartedAtMs({
        startedAt: "2026-10-29T10:00:00.000Z",
        events: [{ at: "2026-10-29T10:05:00.000Z" }],
      }),
    ).toBe(Date.parse("2026-10-29T10:00:00.000Z"));
  });

  it("falls back to earliest event and ignores created_at queue time", () => {
    expect(
      resolveJobStartedAtMs({
        events: [
          { at: "2026-10-29T10:05:00.000Z" },
          { at: "2026-10-29T10:01:00.000Z" },
        ],
      }),
    ).toBe(Date.parse("2026-10-29T10:01:00.000Z"));
  });

  it("returns null when nothing parses", () => {
    expect(resolveJobStartedAtMs({})).toBeNull();
  });
});

describe("projectTokensFromPercent", () => {
  it("returns null when tokens used is absent", () => {
    expect(projectTokensFromPercent(undefined, 20)).toBeNull();
  });
  it("returns null when percent < 5", () => {
    expect(projectTokensFromPercent(100, 4.9)).toBeNull();
  });
  it("scales used by 100/percent", () => {
    expect(projectTokensFromPercent(100, 20)).toBe(500);
  });
});

describe("projectCardsFromPercent", () => {
  it("returns null when drafts_so_far is absent", () => {
    expect(projectCardsFromPercent(undefined, 20)).toBeNull();
  });
  it("returns null when drafts_so_far is 0", () => {
    expect(projectCardsFromPercent(0, 20)).toBeNull();
  });
  it("returns null when percent < 5", () => {
    expect(projectCardsFromPercent(5, 4.9)).toBeNull();
  });
  it("ceil-scales drafts by 100/percent", () => {
    expect(projectCardsFromPercent(5, 20)).toBe(25);
  });
});

describe("projectTokens", () => {
  it("returns null when tokens used is absent", () => {
    expect(projectTokens(undefined, 2, 4)).toBeNull();
  });
  it("returns null when current or total is 0", () => {
    expect(projectTokens(100, 0, 4)).toBeNull();
  });
  it("scales used by total/current", () => {
    expect(projectTokens(100, 2, 4)).toBe(200);
  });
});

describe("projectCardsThisJob", () => {
  it("returns null when drafts_so_far is absent", () => {
    expect(projectCardsThisJob(undefined, 2, 4)).toBeNull();
  });
  it("returns null when drafts_so_far is 0 (unknown mid-job)", () => {
    expect(projectCardsThisJob(0, 2, 4)).toBeNull();
  });
  it("ceil-scales drafts by total/current", () => {
    expect(projectCardsThisJob(5, 2, 4)).toBe(10);
  });
});

describe("remainingCardsToday", () => {
  it("adds cards left this job plus remaining * projected job yield", () => {
    expect(
      remainingCardsToday({
        draftsSoFar: 5,
        current: 2,
        total: 4,
        freeRemaining: 3,
      }),
    ).toBe(35);
  });
  it("returns null when yield unknown", () => {
    expect(
      remainingCardsToday({
        draftsSoFar: 0,
        current: 0,
        total: 0,
        freeRemaining: 3,
      }),
    ).toBeNull();
  });
  it("returns null when drafts_so_far is absent", () => {
    expect(
      remainingCardsToday({
        draftsSoFar: undefined,
        current: 2,
        total: 4,
        freeRemaining: 3,
      }),
    ).toBeNull();
  });
  it("returns null when drafts_so_far is 0 mid-job (avoids 0 cards left)", () => {
    expect(
      remainingCardsToday({
        draftsSoFar: 0,
        current: 2,
        total: 4,
        freeRemaining: 3,
      }),
    ).toBeNull();
  });
});
