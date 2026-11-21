// Type-only imports: this file is reachable from the main chunk, the dataset is not.
import type {
  DatasetEntry,
  IMAGE_ROLES,
} from "../../worker/atlas/datasets/schema";

export type AtlasTier = "key" | "frequent" | "standard";

export type DatasetFields = DatasetEntry["fields"];
export type FieldKey = keyof DatasetFields;
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
  /** Learner-added aliases only (already merged into `aliases`); empty on unedited dataset views. */
  learnerAliases: string[];
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
  /** Named in the course pack (lenient match); null when unscanned. */
  inPack: boolean | null;
  /** Fields this learner overrides on a dataset entry; empty for learner-added and unedited entries. */
  editedFields: FieldKey[];
  /** True when a dataset entry's common name is the learner's own (stored non-null and different). */
  commonNameEdited: boolean;
};

/** Sparse PATCH /entries/:entryId body: only keys the learner changed. */
export type EntryPatch = {
  commonName?: string;
  /** Learner-added entries only; the server rejects it for dataset origins. */
  canonicalName?: string;
  /** Full learner alias list; it replaces aliases_json. Dataset aliases are never sent. */
  aliases?: string[];
  fields?: Partial<DatasetFields>;
};

/** Wire body: an edit, a per-field reset, or both. Resets never reach afterSave. */
export type EntryPatchBody = EntryPatch & { resetFields?: FieldKey[] };

export type AtlasSource = {
  list(atlasId: string): Promise<AtlasEntryView[]>;
};
