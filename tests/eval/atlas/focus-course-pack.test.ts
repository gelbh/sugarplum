import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  scanFocus,
  type FocusEntry,
  type FocusMaterial,
} from "../../../src/atlas/focusScan";
import type { SourceRole } from "../../../src/lib/sourceRole";

type Fixture = {
  source: string;
  expectedKey: string[];
  entries: FocusEntry[];
  materials: {
    id: string;
    filename: string | null;
    sourceRole: SourceRole;
    pages: { page: number; text: string }[];
  }[];
};

const fixture = JSON.parse(
  readFileSync(new URL("./focus-course-pack.json", import.meta.url), "utf8"),
) as Fixture;

const materials: FocusMaterial[] = fixture.materials.map((m) => ({
  id: m.id,
  filename: m.filename,
  sourceRole: m.sourceRole,
  pages: m.pages,
}));

describe("atlas Focus course-pack eval", () => {
  it("locks exactly the four Key parasites from course-like materials", () => {
    expect(fixture.expectedKey).toEqual([
      "Fasciola hepatica",
      "Toxoplasma gondii",
      "Ctenocephalides felis",
      "Dipylidium caninum",
    ]);

    const byTier = new Map<string, string[]>();
    for (const entry of fixture.entries) {
      const { tier } = scanFocus(entry, materials);
      const list = byTier.get(tier) ?? [];
      list.push(entry.canonicalName);
      byTier.set(tier, list);
    }

    expect(byTier.get("key")?.sort()).toEqual([...fixture.expectedKey].sort());
    for (const name of fixture.expectedKey) {
      expect(
        fixture.entries.some((e) => e.canonicalName === name),
        `fixture entries must include Key ${name}`,
      ).toBe(true);
    }
  });

  it("does not Key filler parasites named only in lectures or late tutorial pages", () => {
    const fillers = [
      "Calicophoron daubneyi",
      "Anoplocephala perfoliata",
      "Echinococcus granulosus",
      "Neospora caninum",
      "Haematobia irritans",
      "Toxocara canis",
    ];
    for (const name of fillers) {
      const entry = fixture.entries.find((e) => e.canonicalName === name);
      expect(entry, name).toBeDefined();
      expect(scanFocus(entry!, materials).tier, name).not.toBe("key");
    }
  });
});
