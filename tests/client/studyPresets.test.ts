import { describe, expect, it } from "vitest";
import {
  STUDY_LOAD_PRESETS,
  applyStudyPreset,
  matchStudyPreset,
} from "../../src/settings/studyPresets";
import { DEFAULT_STUDY_PREFS } from "../../src/study/policyQueue";

describe("studyPresets", () => {
  it("maps Light Steady Catch up budgets", () => {
    expect(STUDY_LOAD_PRESETS.light).toMatchObject({
      introBudget: 10,
      reviewBudget: 100,
    });
    expect(STUDY_LOAD_PRESETS.steady).toMatchObject({
      introBudget: 20,
      reviewBudget: 200,
    });
    expect(STUDY_LOAD_PRESETS.catchUp).toMatchObject({
      introBudget: 80,
      reviewBudget: 500,
    });
  });

  it("matchStudyPreset returns custom for Kyley-like 40/200", () => {
    expect(matchStudyPreset(40, 200)).toBe("custom");
  });

  it("applyStudyPreset only changes intro and review", () => {
    const base = {
      ...DEFAULT_STUDY_PREFS,
      desiredRetention: 0.85,
      enableLoadBalance: false,
    };
    const next = applyStudyPreset(base, "catchUp");
    expect(next.introBudget).toBe(80);
    expect(next.reviewBudget).toBe(500);
    expect(next.desiredRetention).toBe(0.85);
    expect(next.enableLoadBalance).toBe(false);
  });
});
