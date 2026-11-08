import {
  datasetGroupFileSchema,
  parasiteDatasetSchema,
  type DatasetGroupFile,
  type ParasiteDataset,
} from "../schema";
import trematodes from "./trematodes.json";

export const PARASITE_DATASET_VERSION = 1;

const GROUP_FILES: Record<string, unknown> = { trematodes };

export function loadGroupFiles(): (DatasetGroupFile & { file: string })[] {
  return Object.entries(GROUP_FILES).map(([file, raw]) => ({
    file,
    ...datasetGroupFileSchema.parse(raw),
  }));
}

export function loadParasiteDataset(): ParasiteDataset {
  return parasiteDatasetSchema.parse({
    version: PARASITE_DATASET_VERSION,
    groups: Object.values(GROUP_FILES),
  });
}
