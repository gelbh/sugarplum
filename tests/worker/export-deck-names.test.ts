import { describe, it, expect } from "vitest";
import {
  ankiDeckName,
  sanitizeAnkiDeckComponent,
} from "../../worker/export/deckNames";

describe("sanitizeAnkiDeckComponent", () => {
  it("replaces colons with hyphens", () => {
    expect(sanitizeAnkiDeckComponent("Bio:Chem")).toBe("Bio-Chem");
  });

  it("strips ASCII control characters", () => {
    expect(sanitizeAnkiDeckComponent("A\u0007B")).toBe("AB");
  });
});

describe("ankiDeckName", () => {
  it("formats Sugarplum hierarchy with a short deck id suffix", () => {
    expect(ankiDeckName("Anatomy", "CN V", "deck-abc-123")).toBe(
      "Sugarplum::Anatomy::CN V (deck-abc)",
    );
  });

  it("sanitizes colons in subject and deck components", () => {
    expect(ankiDeckName("Med:School", "Unit:1", "uuid-0001")).toBe(
      "Sugarplum::Med-School::Unit-1 (uuid-000)",
    );
  });

  it("keeps same-titled decks distinct via id suffix", () => {
    const a = ankiDeckName("Anatomy", "Bones", "deck-aaaa-1111");
    const b = ankiDeckName("Anatomy", "Bones", "deck-bbbb-2222");
    expect(a).not.toBe(b);
    expect(a).toContain("(deck-aaa)");
    expect(b).toContain("(deck-bbb)");
  });
});
