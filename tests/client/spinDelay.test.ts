import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpinDelay } from "../../src/progress/spinDelay";

const OPTS = { delay: 200, minDuration: 300 };

describe("createSpinDelay", () => {
  let seen: boolean[];
  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
  });
  afterEach(() => vi.useRealTimers());

  it("never shows an op shorter than the delay", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    vi.advanceTimersByTime(150);
    spin.set(false);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });

  it("shows at the delay and holds for the minimum duration", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    vi.advanceTimersByTime(199);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(50);
    spin.set(false);
    vi.advanceTimersByTime(249);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([true, false]);
  });

  it("hides immediately when released after the minimum duration", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    vi.advanceTimersByTime(1000);
    spin.set(false);
    expect(seen).toEqual([true, false]);
  });

  it("stays shown when re-activated during the minimum tail", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    vi.advanceTimersByTime(250);
    spin.set(false);
    vi.advanceTimersByTime(100);
    spin.set(true);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([true]);
  });

  it("dispose cancels timers and a later set starts fresh (StrictMode remount)", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    spin.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
    spin.set(true);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([true]);
  });
});
