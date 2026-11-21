import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  scanFocus,
  type FocusEntry,
  type FocusMaterial,
} from "../../../src/atlas/hub/focusScan";
import type { SourceRole } from "../../../src/materials/sourceRole";

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
  it("locks Key parasites from course-like materials including late KEY_ROLE pages", () => {
    expect([...fixture.expectedKey].sort()).toEqual([
      "Anoplocephala perfoliata",
      "Ctenocephalides felis",
      "Dipylidium caninum",
      "Fasciola hepatica",
      "Haematobia irritans",
      "Neospora caninum",
      "Toxoplasma gondii",
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

  it("does not Key fillers named only in lectures or notes", () => {
    const fillers = [
      "Calicophoron daubneyi",
      "Echinococcus granulosus",
      "Toxocara canis",
    ];
    for (const name of fillers) {
      const entry = fixture.entries.find((e) => e.canonicalName === name);
      expect(entry, name).toBeDefined();
      expect(scanFocus(entry!, materials).tier, name).not.toBe("key");
    }
  });

  it("keeps every tier unchanged under lenient pack matching", () => {
    const tiers = Object.fromEntries(
      fixture.entries.map((e) => [e.canonicalName, scanFocus(e, materials).tier]),
    );
    expect(tiers).toEqual({
      "Fasciola hepatica": "key",
      "Toxoplasma gondii": "key",
      "Ctenocephalides felis": "key",
      "Dipylidium caninum": "key",
      "Calicophoron daubneyi": "standard",
      "Anoplocephala perfoliata": "key",
      "Echinococcus granulosus": "standard",
      "Neospora caninum": "key",
      "Haematobia irritans": "key",
      "Toxocara canis": "frequent",
    });
  });

  it("marks lecture-only mentions in pack with their material ids", () => {
    const find = (name: string) =>
      scanFocus(fixture.entries.find((e) => e.canonicalName === name)!, materials);
    expect(find("Calicophoron daubneyi")).toMatchObject({
      tier: "standard",
      inPack: true,
      materialIds: ["lec-pa12"],
    });
    expect(find("Echinococcus granulosus")).toMatchObject({
      tier: "standard",
      inPack: true,
      materialIds: ["lec-pa11", "notes-ascarids"],
    });
  });

  it("never leaves a Key or Frequent entry out of the pack", () => {
    for (const entry of fixture.entries) {
      const result = scanFocus(entry, materials);
      if (result.tier !== "standard") {
        expect(result.inPack, entry.canonicalName).toBe(true);
      }
    }
  });
});
