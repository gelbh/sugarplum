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
});
