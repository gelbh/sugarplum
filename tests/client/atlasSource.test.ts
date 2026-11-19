import { describe, expect, it } from "vitest";
import { loadParasiteDataset } from "../../worker/atlas/datasets/parasites/index";
import { bundledAtlasSource } from "../../src/atlas/bundledSource";

describe("bundledAtlasSource", () => {
  it("maps every dataset entry to an AtlasEntryView", async () => {
    const dataset = loadParasiteDataset();
    const entries = await bundledAtlasSource.list("subj_1");
    expect(entries).toHaveLength(dataset.entries.length);
    for (const e of entries) {
      expect(e.id).toBe(e.originKey);
      expect(e.tier).toBeNull();
      expect(e.editedAt).toBeNull();
    }
  });

  it("folds misspellings into aliases for search", async () => {
    const entries = await bundledAtlasSource.list("subj_1");
    const dicro = entries.find((e) => e.id === "dicrocoelium-dendriticum");
    expect(dicro?.aliases).toContain("Dicrocoelium dentriticum");
  });

  it("caches the mapped list across calls", async () => {
    expect(await bundledAtlasSource.list("a")).toBe(
      await bundledAtlasSource.list("b"),
    );
  });
});
