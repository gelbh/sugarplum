import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeParasiteName } from "../../../worker/atlas/names";
import { parasiteFieldsSchema } from "../../../worker/atlas/templates/parasite";

type FixtureEntry = {
  rawName: string;
  canonicalName: string;
  lecture: string;
  page: number;
  slideErrors: string[];
  corrections?: { field: string; was: string; citation: string; url: string }[];
  expected: Record<string, unknown>;
};

const fixture = JSON.parse(
  readFileSync(
    new URL("../../eval/atlas/parasites.json", import.meta.url),
    "utf8",
  ),
) as { source: string; entries: FixtureEntry[] };

describe("atlas-parasites eval fixture", () => {
  it("holds 14 entries with unique canonical names", () => {
    const names = fixture.entries.map((e) => e.canonicalName);
    expect(names).toHaveLength(14);
    expect(new Set(names).size).toBe(14);
  });

  it.each(fixture.entries.map((e) => [e.rawName, e] as const))(
    "%s normalises to its canonical name and its expected fields parse",
    (_raw, entry) => {
      expect(normalizeParasiteName(entry.rawName)?.canonical).toBe(
        entry.canonicalName,
      );
      expect(() => parasiteFieldsSchema.parse(entry.expected)).not.toThrow();
      expect(entry.page).toBeGreaterThan(0);
      expect(entry.lecture).toMatch(/^PA\d{2}$/);
    },
  );
});
