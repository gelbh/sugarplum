import { describe, expect, it } from "vitest";
import {
  coverPlaceholderNames,
  coverPlaceholderSrc,
} from "../../src/library/board/coverPlaceholder";

describe("coverPlaceholderSrc", () => {
  it("is stable for a fixed id", () => {
    expect(coverPlaceholderSrc("subj-anatomy")).toBe(
      coverPlaceholderSrc("subj-anatomy"),
    );
  });

  it("points at an atlas site plate", () => {
    const src = coverPlaceholderSrc("deck-upper-limb");
    expect(src.startsWith("/atlas/sites/")).toBe(true);
    expect(src.endsWith(".webp")).toBe(true);
    const name = src.slice("/atlas/sites/".length, -".webp".length);
    expect(coverPlaceholderNames()).toContain(name);
  });

  it("varies across ids", () => {
    const set = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
        coverPlaceholderSrc(id),
      ),
    );
    expect(set.size).toBeGreaterThan(1);
  });
});
