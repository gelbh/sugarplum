import { describe, expect, it } from "vitest";
import {
  etaMs,
  calmDisplayEtaMs,
  resolveJobStartedAtMs,
  projectTokensFromPercent,
  projectCardsFromPercent,
  projectTokens,
  projectCardsThisJob,
  remainingCardsToday,
} from "../../src/progress/estimates";

describe("etaMs", () => {
  it("returns null when percent < 5", () => {
    expect(etaMs(10_000, 4.9)).toBeNull();
  });
  it("extrapolates remaining time", () => {
    // 20% in 10s → 40s remaining
    expect(etaMs(10_000, 20)).toBe(40_000);
  });
});

describe("calmDisplayEtaMs", () => {
  it("returns null when percent < 5", () => {
    expect(
      calmDisplayEtaMs({
        elapsedMs: 10_000,
        percent: 4.9,
        previous: null,
        nowMs: 1_000,
      }),
    ).toEqual({ etaMs: null, sample: null });
  });

  it("first sample uses raw etaMs", () => {
    const result = calmDisplayEtaMs({
      elapsedMs: 10_000,
      percent: 20,
      previous: null,
      nowMs: 10_000,
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
      elapsedMs: 10_000,
      percent: 25,
      previous: null,
      nowMs: 10_000,
    });
    expect(first.etaMs).toBe(30_000);
    const grownRaw = etaMs(15_000, 25);
    expect(grownRaw).toBe(45_000);
    const held = calmDisplayEtaMs({
      elapsedMs: 15_000,
      percent: 25,
      previous: first.sample,
      nowMs: 15_000,
    });
    expect(held.etaMs).toBe(25_000);
    expect(held.etaMs!).toBeLessThan(grownRaw!);
  });

  it("recomputes raw when percent increases", () => {
    const first = calmDisplayEtaMs({
      elapsedMs: 10_000,
      percent: 20,
      previous: null,
      nowMs: 10_000,
    });
    const next = calmDisplayEtaMs({
      elapsedMs: 12_000,
      percent: 30,
      previous: first.sample,
      nowMs: 12_000,
    });
    expect(next.etaMs).toBe(etaMs(12_000, 30));
    expect(next.sample?.percent).toBe(30);
  });
});

describe("resolveJobStartedAtMs", () => {
  it("prefers started_at over events and created_at", () => {
    expect(
      resolveJobStartedAtMs({
        startedAt: "2026-10-29T10:00:00.000Z",
        events: [{ at: "2026-10-29T10:05:00.000Z" }],
        createdAt: "2026-10-29T09:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-10-29T10:00:00.000Z"));
  });

  it("falls back to earliest event then created_at", () => {
    expect(
      resolveJobStartedAtMs({
        events: [
          { at: "2026-10-29T10:05:00.000Z" },
          { at: "2026-10-29T10:01:00.000Z" },
        ],
        createdAt: "2026-10-29T09:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-10-29T10:01:00.000Z"));
    expect(
      resolveJobStartedAtMs({
        createdAt: "2026-10-29T09:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-10-29T09:00:00.000Z"));
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
    // projected 10, so far 5 → 5 left; R=3 → 5 + 3*10 = 35
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
