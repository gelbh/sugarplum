/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutoFocusText } from "../../src/lib/autoFocusText";

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("shouldAutoFocusText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when pointer is coarse", () => {
    stubMatchMedia(true);
    expect(shouldAutoFocusText()).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("returns true when pointer is not coarse", () => {
    stubMatchMedia(false);
    expect(shouldAutoFocusText()).toBe(true);
  });

  it("returns true when matchMedia is missing", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(shouldAutoFocusText()).toBe(true);
  });
});
