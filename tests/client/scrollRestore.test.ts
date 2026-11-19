/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hydrateOffsets,
  persistOffsets,
  restoreWhenReady,
  saveOffset,
  savedOffset,
} from "../../src/shared/nav/scrollRestore";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
    read: () => JSON.parse(value ?? "[]") as [string, number][],
  };
}

describe("scroll offset store", () => {
  it("saves and reads per entry", () => {
    saveOffset("a1", 120);
    saveOffset("a2", 0);
    expect(savedOffset("a1")).toBe(120);
    expect(savedOffset("a2")).toBe(0);
    expect(savedOffset("missing")).toBeUndefined();
  });

  it("persists only the newest 50, most recently saved last", () => {
    for (let i = 0; i < 60; i++) saveOffset(`p${i}`, i);
    saveOffset("p10", 999);
    const storage = memoryStorage();
    persistOffsets(storage);
    const pairs = storage.read();
    expect(pairs).toHaveLength(50);
    expect(pairs.at(-1)).toEqual(["p10", 999]);
    expect(pairs[0]).toEqual(["p11", 11]);
  });

  it("caps the in-memory map at 50 entries", () => {
    for (let i = 0; i < 51; i++) saveOffset(`cap${i}`, i);
    expect(savedOffset("cap0")).toBeUndefined();
    expect(savedOffset("cap1")).toBe(1);
    expect(savedOffset("cap50")).toBe(50);
  });

  it("hydrates valid pairs and skips bad ones", () => {
    hydrateOffsets(memoryStorage(JSON.stringify([["h1", 40], "x", ["h2", "y"]])));
    expect(savedOffset("h1")).toBe(40);
    expect(savedOffset("h2")).toBeUndefined();
  });

  it("ignores corrupt JSON and throwing storage", () => {
    expect(() => hydrateOffsets(memoryStorage("{"))).not.toThrow();
    expect(() =>
      persistOffsets({
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).not.toThrow();
  });
});

describe("restoreWhenReady", () => {
  afterEach(() => vi.useRealTimers());

  function scroller(initialScrollHeight: number) {
    let scrollHeight = initialScrollHeight;
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { get: () => scrollHeight });
    Object.defineProperty(el, "clientHeight", { get: () => 500 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo;
    return {
      el,
      scrollTo,
      grow: (height: number) => {
        scrollHeight = height;
      },
    };
  }

  it("restores immediately when already tall enough", () => {
    const { el, scrollTo } = scroller(2000);
    const onDone = vi.fn();
    restoreWhenReady(el, 800, onDone);
    expect(scrollTo).toHaveBeenCalledWith(0, 800);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("waits for a DOM mutation that makes it tall enough", async () => {
    const { el, scrollTo, grow } = scroller(500);
    const onDone = vi.fn();
    restoreWhenReady(el, 800, onDone);
    expect(scrollTo).not.toHaveBeenCalled();
    grow(2000);
    el.append(document.createElement("p"));
    await Promise.resolve();
    expect(scrollTo).toHaveBeenCalledWith(0, 800);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("cancels on wheel before content arrives", async () => {
    const { el, scrollTo, grow } = scroller(500);
    const onDone = vi.fn();
    restoreWhenReady(el, 800, onDone);
    el.dispatchEvent(new Event("wheel"));
    grow(2000);
    el.append(document.createElement("p"));
    await Promise.resolve();
    expect(scrollTo).not.toHaveBeenCalledWith(0, 800);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("cancels on keydown on window", () => {
    const { el, scrollTo } = scroller(500);
    const onDone = vi.fn();
    restoreWhenReady(el, 800, onDone);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("gives up after 3000ms", () => {
    vi.useFakeTimers();
    const { el, scrollTo } = scroller(500);
    const onDone = vi.fn();
    restoreWhenReady(el, 800, onDone);
    vi.advanceTimersByTime(2999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledOnce();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("calls onDone once when stopped twice", () => {
    const { el } = scroller(500);
    const onDone = vi.fn();
    const stop = restoreWhenReady(el, 800, onDone);
    stop();
    stop();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
