// Type-only imports: this file is reachable from the main chunk, the dataset is not.
import type {
  DatasetEntry,
  IMAGE_ROLES,
} from "../../worker/atlas/datasets/schema";

export type AtlasTier = "key" | "frequent" | "standard";

export type DatasetFields = DatasetEntry["fields"];
export type ParasiteGroup = DatasetFields["group"];
export type ImageRole = (typeof IMAGE_ROLES)[number];

export type AtlasImageView = {
  id: string;
  src: string;
  role: ImageRole;
  caption: string | null;
  credit: string;
  license: string;
  sourceUrl: string;
  isHero: boolean;
};

export type AtlasEntryView = {
  id: string;
  originKey: string | null;
  canonicalName: string;
  commonName: string | null;
  aliases: string[];
  fields: DatasetFields;
  refs: {
    field: string | null;
    citation: string;
    url: string | null;
    note: string | null;
  }[];
  images: AtlasImageView[];
  editedAt: string | null;
  tier: AtlasTier | null;
  reason: string | null;
  /** Material ids that drove the Focus scan; empty when unscanned or override. */
  focusMaterialIds: string[];
};

export type AtlasSource = {
  list(subjectId: string): Promise<AtlasEntryView[]>;
};
