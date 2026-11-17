import { describe, expect, it } from "vitest";
import {
  coverPlaceholderColor,
  coverPlaceholderColors,
} from "../../src/library/board/coverPlaceholder";

describe("coverPlaceholderColor", () => {
  it("is stable for a fixed id", () => {
    expect(coverPlaceholderColor("subj-anatomy")).toBe(
      coverPlaceholderColor("subj-anatomy"),
    );
  });

  it("returns a theme palette color", () => {
    const color = coverPlaceholderColor("deck-upper-limb");
    expect(color.startsWith("#")).toBe(true);
    expect(coverPlaceholderColors()).toContain(color);
  });

  it("never points at atlas site plates", () => {
    for (const id of ["a", "b", "subj-1", "deck-2"]) {
      expect(coverPlaceholderColor(id)).not.toMatch(/atlas|\.webp/i);
    }
  });

  it("varies across ids", () => {
    const set = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) =>
        coverPlaceholderColor(id),
      ),
    );
    expect(set.size).toBeGreaterThan(1);
  });
});
