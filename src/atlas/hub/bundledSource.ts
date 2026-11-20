import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import { toEntryView } from "../../../worker/atlas/merge";
import type { AtlasEntryView, AtlasSource } from "../types";

let cached: Promise<AtlasEntryView[]> | null = null;

// Step 3 swaps this for GET routes; every subject reads the one bundled dataset until then.
export const bundledAtlasSource: AtlasSource = {
  list() {
    cached ??= Promise.resolve().then(() =>
      loadParasiteDataset().entries.map(toEntryView),
    );
    return cached;
  },
};
