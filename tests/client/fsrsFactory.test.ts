import { describe, expect, it } from "vitest";
import { fsrsForPrefs } from "../../src/study/fsrsFactory";

describe("fsrsForPrefs", () => {
  it("sets request_retention and enable_fuzz from prefs", () => {
    const f = fsrsForPrefs({ desiredRetention: 0.85, enableFuzz: false });
    expect(f.parameters.request_retention).toBe(0.85);
    expect(f.parameters.enable_fuzz).toBe(false);
  });

  it("defaults match StudyPrefs defaults when omitted via DEFAULT", () => {
    const f = fsrsForPrefs();
    expect(f.parameters.request_retention).toBe(0.9);
    expect(f.parameters.enable_fuzz).toBe(true);
  });

  it("passes custom w into scheduler parameters", async () => {
    const { default_w } = await import("ts-fsrs");
    const w = default_w.map((x, i) => (i === 8 ? x * 3 : x));
    const withCustom = fsrsForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w,
    });
    const withDefault = fsrsForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
    });
    expect(withCustom.parameters.w).toHaveLength(21);
    expect(withCustom.parameters.w[8]).not.toBe(withDefault.parameters.w[8]);
  });

  it("omits invalid w and keeps library default length 21", () => {
    const f = fsrsForPrefs({
      desiredRetention: 0.9,
      enableFuzz: false,
      w: [1, 2, 3],
    });
    expect(f.parameters.w).toHaveLength(21);
  });
});
