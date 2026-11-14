import { describe, expect, it } from "vitest";
import {
  LOADER_DELAY_MS,
  shouldShowDelayed,
} from "../../src/anatomy/delayedShow";

describe("shouldShowDelayed", () => {
  it("is false before delay", () => {
    expect(shouldShowDelayed(0)).toBe(false);
    expect(shouldShowDelayed(LOADER_DELAY_MS - 1)).toBe(false);
  });

  it("is true at and after delay", () => {
    expect(shouldShowDelayed(LOADER_DELAY_MS)).toBe(true);
    expect(shouldShowDelayed(LOADER_DELAY_MS + 50)).toBe(true);
  });
});
