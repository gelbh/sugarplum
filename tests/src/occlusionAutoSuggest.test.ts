import { describe, expect, it } from "vitest";
import { shouldAutoSuggestRegions } from "../../src/lib/occlusionAutoSuggest";

describe("shouldAutoSuggestRegions", () => {
  it("runs once for an empty editor with an image key", () => {
    expect(
      shouldAutoSuggestRegions({
        disabled: false,
        imageKey: " materials/a.png ",
        regionCount: 0,
        attemptedKey: null,
      }),
    ).toBe(true);
  });

  it("skips when disabled, no key, regions exist, or already attempted", () => {
    expect(
      shouldAutoSuggestRegions({
        disabled: true,
        imageKey: "k",
        regionCount: 0,
        attemptedKey: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoSuggestRegions({
        disabled: false,
        imageKey: "  ",
        regionCount: 0,
        attemptedKey: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoSuggestRegions({
        disabled: false,
        imageKey: "k",
        regionCount: 1,
        attemptedKey: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoSuggestRegions({
        disabled: false,
        imageKey: "k",
        regionCount: 0,
        attemptedKey: "k",
      }),
    ).toBe(false);
  });
});
