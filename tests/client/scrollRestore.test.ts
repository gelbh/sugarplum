import { describe, expect, it } from "vitest";
import {
  hydrateOffsets,
  persistOffsets,
  saveOffset,
  savedOffset,
} from "../../src/nav/scrollRestore";

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
