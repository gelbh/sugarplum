import { loadParasiteDataset } from "../../worker/atlas/datasets/parasites";
import type { DatasetEntry } from "../../worker/atlas/datasets/schema";
import type { AtlasEntryView, AtlasSource } from "./types";

export function toEntryView(entry: DatasetEntry): AtlasEntryView {
  return {
    id: entry.key,
    originKey: entry.key,
    canonicalName: entry.canonicalName,
    commonName: entry.commonName,
    aliases: [...entry.aliases, ...entry.misspellings],
    fields: entry.fields,
    refs: entry.refs,
    images: entry.images.map(({ file, ...image }) => ({
      ...image,
      src: `/atlas/parasites/${file}`,
    })),
    editedAt: null,
    tier: null,
  };
}

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
