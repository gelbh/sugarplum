import { describe, expect, it } from "vitest";
import { formatEtkTooltip } from "../../src/library/formatEtkTooltip";

describe("formatEtkTooltip", () => {
  it("formats integer card-equivalents", () => {
    expect(formatEtkTooltip(3)).toBe("~3 card-equivalents");
  });

  it("rounds to one decimal when needed", () => {
    expect(formatEtkTooltip(2.36)).toBe("~2.4 card-equivalents");
  });
});
