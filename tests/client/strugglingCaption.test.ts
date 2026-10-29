import { describe, expect, it } from "vitest";
import { formatStrugglingCaption } from "../../src/study/strugglingCaption";

describe("formatStrugglingCaption", () => {
  it("includes Again, Hard, and Lapses", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 1,
        hard_14d: 2,
        lapses: 0,
      }),
    ).toBe("Again (14d): 1 · Hard (14d): 2 · Lapses: 0");
  });

  it("appends R% when retrievability is known", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 1,
        hard_14d: 0,
        lapses: 1,
        retrievability: 0.84,
      }),
    ).toBe("Again (14d): 1 · Hard (14d): 0 · Lapses: 1 · R: 84%");
  });

  it("omits R when retrievability is null or missing", () => {
    expect(
      formatStrugglingCaption({
        again_14d: 0,
        hard_14d: 2,
        lapses: 0,
        retrievability: null,
      }),
    ).toBe("Again (14d): 0 · Hard (14d): 2 · Lapses: 0");
  });
});
