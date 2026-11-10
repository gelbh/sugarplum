import { describe, expect, it, beforeEach } from "vitest";
import {
  clearSchedulerCache,
  schedulerForPrefs,
} from "../../src/study/fsrsFactory";

describe("schedulerForPrefs", () => {
  beforeEach(() => {
    clearSchedulerCache();
  });

  it("sets desiredRetention and enableFuzz from prefs", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.85,
      enableFuzz: false,
    });
    expect(f.config.desiredRetention[3]).toBe(0.85);
    expect(f.config.enableFuzz).toBe(false);
    expect(f.schedulerDefinition?.model?.name ?? f.model).toBeTruthy();
  });

  it("defaults match StudyPrefs defaults when omitted via DEFAULT", async () => {
    const f = await schedulerForPrefs();
    expect(f.config.desiredRetention[3]).toBe(0.9);
    expect(f.config.enableFuzz).toBe(true);
  });

  it("passes custom w into scheduler config", async () => {
    const { FSRS7_DEFAULT_WEIGHTS } = await import("ts-fsrs/models/fsrs-7");
    const w = FSRS7_DEFAULT_WEIGHTS.map((x, i) => (i < 10 ? x * 2 : x));
    const withCustom = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w,
    });
    const withDefault = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(withCustom.config.weights).toHaveLength(34);
    expect(withCustom.config.weights[2]).not.toBe(withDefault.config.weights[2]);
  });

  it("omits invalid w and keeps library default length 34", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w: [1, 2, 3],
    });
    expect(f.config.weights).toHaveLength(34);
  });

  it("uses FSRS-7 by default", async () => {
    const f = await schedulerForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(f.schedulerDefinition.model.name).toBe("fsrs-7");
  });
});
