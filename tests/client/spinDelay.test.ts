/** @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpinDelay, useSpinDelay } from "../../src/progress/spinDelay";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("dispose hides a shown bar so a re-run effect starts hidden", () => {
    const spin = createSpinDelay(OPTS, (v) => seen.push(v));
    spin.set(true);
    vi.advanceTimersByTime(200);
    spin.dispose();
    expect(seen).toEqual([true, false]);
    spin.set(true);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([true, false, true]);
  });
});

describe("useSpinDelay", () => {
  let root: Root;
  let shown: (string | null)[];
  let renders: number;

  function Probe({ value }: { value: string | null }) {
    renders += 1;
    shown.push(useSpinDelay(value, OPTS));
    return null;
  }

  const render = (value: string | null) =>
    act(() => root.render(createElement(Probe, { value })));
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  beforeEach(() => {
    vi.useFakeTimers();
    root = createRoot(document.createElement("div"));
    shown = [];
    renders = 0;
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("follows the value in one render per change and holds the last one through the tail", () => {
    render("a");
    advance(200);
    expect(shown.at(-1)).toBe("a");

    renders = 0;
    render("b");
    expect(renders).toBe(1);
    expect(shown.at(-1)).toBe("b");

    const tailStart = shown.length;
    render(null);
    advance(299);
    expect(shown.slice(tailStart)).not.toContain(null);
    expect(shown.at(-1)).toBe("b");
    advance(1);
    expect(shown.at(-1)).toBeNull();
  });

  it("never shows a value released before the delay", () => {
    render("a");
    advance(150);
    render(null);
    advance(1000);
    expect(shown.every((v) => v === null)).toBe(true);
  });
});
