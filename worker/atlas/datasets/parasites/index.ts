import {
  datasetGroupFileSchema,
  parasiteDatasetSchema,
  type DatasetGroupFile,
  type ParasiteDataset,
} from "../schema";
import trematodes from "./trematodes.json";

export const PARASITE_DATASET_VERSION = 1;

export const RAW_FILES_FOR_TESTS: Record<string, unknown> = { trematodes };

export function loadGroupFiles(): (DatasetGroupFile & { file: string })[] {
  return Object.entries(RAW_FILES_FOR_TESTS).map(([file, raw]) => ({
    file,
    ...datasetGroupFileSchema.parse(raw),
  }));
}

export function loadParasiteDataset(): ParasiteDataset {
  return parasiteDatasetSchema.parse({
    version: PARASITE_DATASET_VERSION,
    entries: loadGroupFiles().flatMap((f) => f.entries),
  });
}
