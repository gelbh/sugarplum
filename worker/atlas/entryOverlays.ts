import type { AtlasEntryView, AtlasImageView } from "../../src/atlas/types";
import type { OverlayRow } from "./merge";

export type EntryRow = {
  id: string;
  atlas_id: string;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  status: string;
  created_at: string;
  updated_at: string;
  origin_key: string | null;
  origin_version: number | null;
  edited_at: string | null;
  deleted_at: string | null;
};

type RefRow = {
  id: string;
  entry_id: string;
  field_key: string | null;
  citation: string;
  url: string | null;
  material_id: string | null;
  page: number | null;
  note: string | null;
  user_added: number;
  created_at: string;
};

type ImageRow = {
  id: string;
  entry_id: string;
  src: string;
  role: string | null;
  caption: string | null;
  credit: string | null;
  license: string | null;
  source_url: string | null;
  is_hero: number;
  user_added: number;
  deleted_at: string | null;
  created_at: string;
};

export async function loadEntryRows(
  db: D1Database,
  atlasId: string,
): Promise<EntryRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, atlas_id, canonical_name, common_name, fields_json, status,
              created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       FROM atlas_entries WHERE atlas_id = ?`,
    )
    .bind(atlasId)
    .all<EntryRow>();
  return results ?? [];
}

async function loadRefsForAtlas(
  db: D1Database,
  atlasId: string,
): Promise<Map<string, RefRow[]>> {
  const byEntry = new Map<string, RefRow[]>();
  const { results } = await db
    .prepare(
      `SELECT r.id, r.entry_id, r.field_key, r.citation, r.url, r.material_id,
              r.page, r.note, r.user_added, r.created_at
       FROM atlas_entry_refs r
       JOIN atlas_entries e ON e.id = r.entry_id
       WHERE e.atlas_id = ?`,
    )
    .bind(atlasId)
    .all<RefRow>();
  for (const row of results ?? []) {
    const list = byEntry.get(row.entry_id) ?? [];
    list.push(row);
    byEntry.set(row.entry_id, list);
  }
  return byEntry;
}

async function loadImagesForAtlas(
  db: D1Database,
  atlasId: string,
): Promise<Map<string, ImageRow[]>> {
  const byEntry = new Map<string, ImageRow[]>();
  const { results } = await db
    .prepare(
      `SELECT i.id, i.entry_id, i.src, i.role, i.caption, i.credit, i.license,
              i.source_url, i.is_hero, i.user_added, i.deleted_at, i.created_at
       FROM atlas_entry_images i
       JOIN atlas_entries e ON e.id = i.entry_id
       WHERE e.atlas_id = ? AND i.deleted_at IS NULL`,
    )
    .bind(atlasId)
    .all<ImageRow>();
  for (const row of results ?? []) {
    const list = byEntry.get(row.entry_id) ?? [];
    list.push(row);
    byEntry.set(row.entry_id, list);
  }
  return byEntry;
}

function refViews(rows: RefRow[]): AtlasEntryView["refs"] {
  return rows.map((r) => ({
    field: r.field_key,
    citation: r.citation,
    url: r.url,
    note: r.note,
  }));
}

function imageViews(rows: ImageRow[]): AtlasImageView[] {
  return rows.map((r) => ({
    id: r.id,
    src: r.src,
    role: (r.role ?? "other") as AtlasImageView["role"],
    caption: r.caption,
    credit: r.credit ?? "",
    license: r.license ?? "",
    sourceUrl: r.source_url ?? "",
    isHero: r.is_hero === 1,
  }));
}

export async function toOverlayRows(
  db: D1Database,
  atlasId: string,
  entries: EntryRow[],
): Promise<OverlayRow[]> {
  const refs = await loadRefsForAtlas(db, atlasId);
  const images = await loadImagesForAtlas(db, atlasId);
  return entries.map((e) => {
    const entryRefs = refs.get(e.id);
    const entryImages = images.get(e.id);
    const row: OverlayRow = {
      id: e.id,
      origin_key: e.origin_key,
      origin_version: e.origin_version,
      canonical_name: e.canonical_name,
      common_name: e.common_name,
      fields_json: e.fields_json,
      edited_at: e.edited_at,
      deleted_at: e.deleted_at,
    };
    if (entryRefs && entryRefs.length > 0) row.refs = refViews(entryRefs);
    if (entryImages && entryImages.length > 0) {
      row.images = imageViews(entryImages);
    }
    return row;
  });
}

export async function hasLearnerRefsOrImages(
  db: D1Database,
  atlasId: string,
  entryId: string,
): Promise<boolean> {
  const refs = await loadRefsForAtlas(db, atlasId);
  const images = await loadImagesForAtlas(db, atlasId);
  const entryRefs = refs.get(entryId) ?? [];
  const entryImages = images.get(entryId) ?? [];
  return (
    entryRefs.some((r) => r.user_added === 1) ||
    entryImages.some((i) => i.user_added === 1)
  );
}
