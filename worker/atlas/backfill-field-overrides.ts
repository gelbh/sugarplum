import { loadParasiteDataset } from "./datasets/parasites/index";
import { convertLegacyOverlay } from "./heal-fields";
import { nowIso } from "./ownership";

export type BackfillFieldOverridesOpts = {
  dry_run: boolean;
  userId?: string;
  atlasId?: string;
};

export type BackfillFieldOverridesResult = {
  scanned: number;
  converted: number;
  skipped: number;
  /** Rows whose fields_json is malformed; never written. */
  skipped_corrupt: number;
  dry_run: boolean;
};

type LegacyRow = {
  id: string;
  atlas_id: string;
  origin_key: string | null;
  common_name: string | null;
  fields_json: string;
  field_overrides_json: string | null;
};

const BATCH = 50;

/** Persist the read-path legacy diff into field_overrides_json; fields_json keeps the merged snapshot. */
export async function runBackfillFieldOverrides(
  db: D1Database,
  opts: BackfillFieldOverridesOpts,
): Promise<BackfillFieldOverridesResult> {
  const byKey = new Map(loadParasiteDataset().entries.map((e) => [e.key, e]));

  let rows: LegacyRow[];
  if (opts.atlasId) {
    const result = await db
      .prepare(
        `SELECT id, atlas_id, origin_key, common_name, fields_json, field_overrides_json
         FROM atlas_entries
         WHERE atlas_id = ? AND origin_key IS NOT NULL AND field_overrides_json IS NULL`,
      )
      .bind(opts.atlasId)
      .all<LegacyRow>();
    rows = result.results ?? [];
  } else if (opts.userId) {
    const result = await db
      .prepare(
        `SELECT e.id, e.atlas_id, e.origin_key, e.common_name, e.fields_json, e.field_overrides_json
         FROM atlas_entries e
         JOIN atlases a ON a.id = e.atlas_id
         WHERE a.user_id = ? AND e.origin_key IS NOT NULL AND e.field_overrides_json IS NULL`,
      )
      .bind(opts.userId)
      .all<LegacyRow>();
    rows = result.results ?? [];
  } else {
    const result = await db
      .prepare(
        `SELECT id, atlas_id, origin_key, common_name, fields_json, field_overrides_json
         FROM atlas_entries
         WHERE origin_key IS NOT NULL AND field_overrides_json IS NULL`,
      )
      .all<LegacyRow>();
    rows = result.results ?? [];
  }

  const ts = nowIso();
  const statements: D1PreparedStatement[] = [];
  let skipped = 0;
  let skippedCorrupt = 0;
  for (const row of rows) {
    // Defensive: mocks and loose SELECTs may return rows SQL would exclude.
    if (!row.origin_key || row.field_overrides_json != null) {
      skipped += 1;
      continue;
    }
    const dataset = byKey.get(row.origin_key);
    if (!dataset) {
      // The read path keeps using fields_json for retired dataset entries.
      skipped += 1;
      continue;
    }
    const converted = convertLegacyOverlay(row, dataset);
    if (converted === null) {
      skippedCorrupt += 1;
      continue;
    }
    statements.push(
      db
        .prepare(
          `UPDATE atlas_entries SET field_overrides_json = ?, fields_json = ?, common_name = ?, updated_at = ?
           WHERE id = ? AND atlas_id = ? AND field_overrides_json IS NULL`,
        )
        .bind(
          JSON.stringify(converted.overrides),
          JSON.stringify(converted.fields),
          converted.commonName,
          ts,
          row.id,
          row.atlas_id,
        ),
    );
  }

  if (!opts.dry_run) {
    for (let i = 0; i < statements.length; i += BATCH) {
      await db.batch(statements.slice(i, i + BATCH));
    }
  }

  return {
    scanned: rows.length,
    converted: statements.length,
    skipped,
    skipped_corrupt: skippedCorrupt,
    dry_run: opts.dry_run,
  };
}
