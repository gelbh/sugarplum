import { describe, expect, it } from "vitest";
import {
  etaMs,
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
