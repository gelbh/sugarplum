import { describe, expect, it } from "vitest";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites";
import { healOverlayFieldsFromDataset } from "../../../worker/atlas/heal-wiped-fields";
import {
  emptyParasiteFields,
  type ParasiteFields,
} from "../../../worker/atlas/templates/parasite";

describe("healOverlayFieldsFromDataset", () => {
  it("restores empty-default keys from dataset and keeps hosts", () => {
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!.fields;
    const wiped: ParasiteFields = {
      ...emptyParasiteFields(),
      definitiveHosts: ["sheep"],
    };
    const healed = healOverlayFieldsFromDataset(wiped, dataset);
    expect(healed).not.toBeNull();
    expect(healed!.definitiveHosts).toEqual(["sheep"]);
    expect(healed!.lifecycleStages).toEqual(dataset.lifecycleStages);
    expect(healed!.majorOrgan).toBe(dataset.majorOrgan);
  });

  it("returns null when nothing to restore", () => {
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!.fields;
    expect(healOverlayFieldsFromDataset(dataset, dataset)).toBeNull();
  });
});
