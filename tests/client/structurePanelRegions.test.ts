import { describe, expect, it } from "vitest";
import {
  addRegionIds,
  removeRegionIds,
  toggleRegionId,
} from "../../src/anatomy/structure/structurePanelRegions";

describe("structurePanelRegions", () => {
  it("toggleRegionId adds and removes", () => {
    expect(toggleRegionId(new Set(["a"]), "b").sort()).toEqual(["a", "b"]);
    expect(toggleRegionId(new Set(["a", "b"]), "a")).toEqual(["b"]);
  });

  it("addRegionIds unions without duplicates", () => {
    expect(addRegionIds(new Set(["a"]), ["a", "b"]).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("removeRegionIds drops listed ids", () => {
    expect(removeRegionIds(new Set(["a", "b", "c"]), ["b"])).toEqual([
      "a",
      "c",
    ]);
  });
});
