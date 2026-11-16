import { describe, expect, it } from "vitest";
import { fruitMarkNames, fruitMarkSrc } from "../../src/library/board/fruitMark";

describe("fruitMarkSrc", () => {
  it("is stable for a fixed id", () => {
    expect(fruitMarkSrc("subj-anatomy")).toBe(fruitMarkSrc("subj-anatomy"));
  });

  it("returns a fruit svg under achievements", () => {
    const src = fruitMarkSrc("deck-upper-limb");
    expect(src.startsWith("/achievements/fruits/")).toBe(true);
    expect(src.endsWith(".svg")).toBe(true);
    const name = src.slice("/achievements/fruits/".length, -".svg".length);
    expect(fruitMarkNames()).toContain(name);
  });

  it("spreads different ids across the fruit set", () => {
    const set = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((id) =>
        fruitMarkSrc(id),
      ),
    );
    expect(set.size).toBeGreaterThan(1);
  });
});
