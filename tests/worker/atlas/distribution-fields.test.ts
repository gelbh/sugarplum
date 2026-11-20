import { describe, expect, it } from "vitest";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import {
  distributionTags,
  tagsToMeta,
} from "../../../src/atlas/hub/distributionTags";

describe("parasite distribution fields", () => {
  it("keeps structured fields aligned with prose parsing", () => {
    const { entries } = loadParasiteDataset();
    const mismatches: string[] = [];
    for (const e of entries) {
      const prose = e.fields.distribution;
      if (!prose) continue;
      const expected = tagsToMeta(distributionTags(prose));
      const got = {
        worldwide: e.fields.distributionWorldwide,
        regions: e.fields.distributionRegions,
        bands: e.fields.climateBands,
      };
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        mismatches.push(
          `${e.key}: got ${JSON.stringify(got)} expected ${JSON.stringify(expected)} (${prose})`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("does not treat negated continents as endemic", () => {
    const fish = loadParasiteDataset().entries.find(
      (e) => e.key === "diphyllobothrium-latum",
    )!;
    expect(fish.fields.distributionRegions).toEqual(
      expect.arrayContaining(["north-america", "europe", "asia"]),
    );
    expect(fish.fields.distributionRegions).not.toContain("south-america");
    expect(fish.fields.climateBands).toContain("arctic");
  });
});
