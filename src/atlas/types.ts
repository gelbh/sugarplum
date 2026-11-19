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
  placeholderSrc?: string;
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
  /** Learner personal notepad; null when unset. Not curated significance. */
  personalNote: string | null;
  tier: AtlasTier | null;
  reason: string | null;
  /** DB focus override when set; pin UI keys off this, not reason copy. */
  override: AtlasTier | null;
  focusMaterialIds: string[];
};

export type AtlasSource = {
  list(atlasId: string): Promise<AtlasEntryView[]>;
};
