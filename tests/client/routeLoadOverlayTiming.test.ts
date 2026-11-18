/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpinDelay } from "../../src/progress/spinDelay";
import { ROUTE_OVERLAY_SHOW_TIMING } from "../../src/progress/useRouteLoadOverlay";

describe("ROUTE_OVERLAY_SHOW_TIMING", () => {
  it("matches the two-tier design lock", () => {
    expect(ROUTE_OVERLAY_SHOW_TIMING).toEqual({
      delay: 800,
      minDuration: 300,
    });
  });
});

describe("route overlay spin delay", () => {
  let seen: boolean[];

  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
  });
  afterEach(() => vi.useRealTimers());

  it("does not show before 800ms", () => {
    const spin = createSpinDelay(ROUTE_OVERLAY_SHOW_TIMING, (v) =>
      seen.push(v),
    );
    spin.set(true);
    vi.advanceTimersByTime(799);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true]);
  });

  it("holds for minDuration after clear", () => {
    const spin = createSpinDelay(ROUTE_OVERLAY_SHOW_TIMING, (v) =>
      seen.push(v),
    );
    spin.set(true);
    vi.advanceTimersByTime(800);
    spin.set(false);
    vi.advanceTimersByTime(299);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true, false]);
  });
});
