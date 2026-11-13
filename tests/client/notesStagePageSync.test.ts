import { describe, expect, it } from "vitest";
import {
  shouldReportStagePage,
  stageJumpKey,
} from "../../src/study/notesStagePageSync";

describe("stageJumpKey", () => {
  it("joins pageCount and 0-based target", () => {
    expect(stageJumpKey(12, 3)).toBe("12:3");
  });
});

describe("shouldReportStagePage", () => {
  const target = stageJumpKey(10, 4); // claimed page 5

  it("suppresses before any provenance jump", () => {
    expect(
      shouldReportStagePage({
        claimedOneBased: 5,
        stageOneBased: 1,
        jumpAppliedKey: "",
        targetJumpKey: target,
        skipUntilMs: 0,
        nowMs: 1000,
      }),
    ).toBe(false);
  });

  it("suppresses while jump skip window is open", () => {
    expect(
      shouldReportStagePage({
        claimedOneBased: 5,
        stageOneBased: 1,
        jumpAppliedKey: target,
        targetJumpKey: target,
        skipUntilMs: 1400,
        nowMs: 1000,
      }),
    ).toBe(false);
  });

  it("suppresses when stage already matches claimed", () => {
    expect(
      shouldReportStagePage({
        claimedOneBased: 5,
        stageOneBased: 5,
        jumpAppliedKey: target,
        targetJumpKey: target,
        skipUntilMs: 0,
        nowMs: 2000,
      }),
    ).toBe(false);
  });

  it("reports after jump settle when user scrolled away", () => {
    expect(
      shouldReportStagePage({
        claimedOneBased: 5,
        stageOneBased: 6,
        jumpAppliedKey: target,
        targetJumpKey: target,
        skipUntilMs: 0,
        nowMs: 2000,
      }),
    ).toBe(true);
  });

  it("suppresses while jump key lags a new claimed page", () => {
    expect(
      shouldReportStagePage({
        claimedOneBased: 7,
        stageOneBased: 1,
        jumpAppliedKey: target,
        targetJumpKey: stageJumpKey(10, 6),
        skipUntilMs: 0,
        nowMs: 2000,
      }),
    ).toBe(false);
  });
});
