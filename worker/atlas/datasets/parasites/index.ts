import {
  datasetGroupFileSchema,
  parasiteDatasetSchema,
  type DatasetGroupFile,
  type ParasiteDataset,
} from "../schema";
import arthropods from "./arthropods.json";
import cestodes from "./cestodes.json";
import nematodesCompanionPoultry from "./nematodes-companion-poultry.json";
import nematodesEquinePig from "./nematodes-equine-pig.json";
import nematodesRuminant from "./nematodes-ruminant.json";
import protozoa from "./protozoa.json";
import trematodes from "./trematodes.json";

export const PARASITE_DATASET_VERSION = 2;

const GROUP_FILES: Record<string, unknown> = {
  trematodes,
  cestodes,
  "nematodes-ruminant": nematodesRuminant,
  protozoa,
  "nematodes-equine-pig": nematodesEquinePig,
  "nematodes-companion-poultry": nematodesCompanionPoultry,
  arthropods,
};

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
