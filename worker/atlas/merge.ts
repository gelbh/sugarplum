import type {
  AtlasEntryView,
  AtlasImageView,
  DatasetFields,
} from "../../src/atlas/types";
import type { DatasetEntry } from "./datasets/schema";

/** D1 atlas_entries row shape used by overlay (refs/images optional joins). */
export type OverlayRow = {
  id: string;
  origin_key: string | null;
  origin_version: number | null;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  edited_at: string | null;
  deleted_at: string | null;
  refs?: AtlasEntryView["refs"];
  images?: AtlasImageView[];
};

export function toEntryView(entry: DatasetEntry): AtlasEntryView {
  return {
    id: entry.key,
    originKey: entry.key,
    canonicalName: entry.canonicalName,
    commonName: entry.commonName,
    aliases: [...entry.aliases, ...entry.misspellings],
    fields: entry.fields,
    refs: entry.refs,
    images: entry.images.map(({ file, ...image }) => {
      const src = `/atlas/parasites/${file}`;
      return {
        ...image,
        src,
        placeholderSrc: file.endsWith(".webp")
          ? `/atlas/parasites/${file.slice(0, -5)}-blur.webp`
          : undefined,
      };
    }),
    editedAt: null,
    tier: null,
    reason: null,
    focusMaterialIds: [],
  };
}

function parseFields(fieldsJson: string): DatasetFields {
  return JSON.parse(fieldsJson) as DatasetFields;
}

/** Dataset refs/images first, then learner overlay refs/images. */
export function concatOverlayMedia(
  base: DatasetEntry | null,
  row: Pick<OverlayRow, "refs" | "images">,
): Pick<AtlasEntryView, "refs" | "images"> {
  const fromDataset = base ? toEntryView(base) : null;
  return {
    refs: [...(fromDataset?.refs ?? []), ...(row.refs ?? [])],
    images: [...(fromDataset?.images ?? []), ...(row.images ?? [])],
  };
}

export function viewFromOverlay(
  row: OverlayRow,
  base: DatasetEntry | null,
): AtlasEntryView {
  const fromDataset = base ? toEntryView(base) : null;
  const media = concatOverlayMedia(base, row);
  return {
    id: row.id,
    originKey: row.origin_key,
    canonicalName: base?.canonicalName ?? row.canonical_name,
    commonName: row.common_name,
    aliases: fromDataset?.aliases ?? [],
    fields: parseFields(row.fields_json),
    refs: media.refs,
    images: media.images,
    editedAt: row.edited_at,
    tier: null,
    reason: null,
    focusMaterialIds: [],
  };
}

/**
 * Merge bundled dataset entries with D1 overlay rows (edits-over-dataset).
 * Soft-deleted origin keys are omitted (Recently deleted is a separate query).
 * Unedited entries keep dataset `key` as `id`; edited/added use the D1 row `id`.
 */
export function overlayAtlas(
  datasetEntries: DatasetEntry[],
  rows: OverlayRow[],
): AtlasEntryView[] {
  const byOrigin = new Map<string, OverlayRow>();
  const deletedOrigins = new Set<string>();
  const added: OverlayRow[] = [];

  for (const row of rows) {
    if (row.origin_key === null) {
      if (!row.deleted_at) added.push(row);
      continue;
    }
    if (row.deleted_at) {
      deletedOrigins.add(row.origin_key);
      continue;
    }
    byOrigin.set(row.origin_key, row);
  }

  const seenOrigins = new Set<string>();
  const out: AtlasEntryView[] = [];

  for (const entry of datasetEntries) {
    seenOrigins.add(entry.key);
    if (deletedOrigins.has(entry.key)) continue;
    const row = byOrigin.get(entry.key);
    if (!row) {
      out.push(toEntryView(entry));
      continue;
    }
    out.push(viewFromOverlay(row, entry));
  }

  for (const [originKey, row] of byOrigin) {
    if (seenOrigins.has(originKey)) continue;
    out.push(viewFromOverlay(row, null));
  }

  for (const row of added) {
    out.push(viewFromOverlay(row, null));
  }

  return out;
}
