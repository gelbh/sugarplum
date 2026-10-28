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
  it("formats Sugarplum hierarchy with subject and deck titles", () => {
    expect(ankiDeckName("Anatomy", "CN V")).toBe("Sugarplum::Anatomy::CN V");
  });

  it("sanitizes colons in subject and deck components", () => {
    expect(ankiDeckName("Med:School", "Unit:1")).toBe(
      "Sugarplum::Med-School::Unit-1",
    );
  });
});
