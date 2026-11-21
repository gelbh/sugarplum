import { healOverlayFieldsFromDataset } from "./heal-fields";
import { parasiteFieldsSchema, type ParasiteFields } from "./templates/parasite";
import { datasetByKey } from "./entry-helpers";
import { nowIso } from "./ownership";

export { healOverlayFieldsFromDataset, isEmptyDefaultField } from "./heal-fields";

export type OriginRowScope = { userId?: string; atlasId?: string };

/**
 * Dataset-origin rows (`origin_key IS NOT NULL`) in one atlas, one user's
 * atlases, or everywhere. `columns` and `extraWhere` use the `e.` alias.
 */
export async function scopedOriginRows<T>(
  db: D1Database,
  scope: OriginRowScope,
  columns: readonly string[],
  extraWhere: string,
): Promise<T[]> {
  const select = `SELECT ${columns.map((c) => `e.${c}`).join(", ")} FROM atlas_entries e`;
  const where = `e.origin_key IS NOT NULL AND ${extraWhere}`;
  let stmt: D1PreparedStatement;
  if (scope.atlasId) {
    stmt = db
      .prepare(`${select} WHERE e.atlas_id = ? AND ${where}`)
      .bind(scope.atlasId);
  } else if (scope.userId) {
    stmt = db
      .prepare(
        `${select} JOIN atlases a ON a.id = e.atlas_id WHERE a.user_id = ? AND ${where}`,
      )
      .bind(scope.userId);
  } else {
    stmt = db.prepare(`${select} WHERE ${where}`);
  }
  const { results } = await stmt.all<T>();
  return results ?? [];
}

export type HealWipedFieldsOpts = {
  dry_run: boolean;
  userId?: string;
  atlasId?: string;
};

export type HealWipedFieldsResult = {
  scanned: number;
  healed: number;
  skipped: number;
  dry_run: boolean;
};

type OverlayScanRow = {
  id: string;
  atlas_id: string;
  origin_key: string;
  fields_json: string;
  field_overrides_json: string | null;
  edited_at: string | null;
};

export async function runHealWipedFields(
  db: D1Database,
  opts: HealWipedFieldsOpts,
): Promise<HealWipedFieldsResult> {
  const byKey = datasetByKey();
  const rows = await scopedOriginRows<OverlayScanRow>(
    db,
    opts,
    ["id", "atlas_id", "origin_key", "fields_json", "field_overrides_json", "edited_at"],
    "e.deleted_at IS NULL",
  );

  let healed = 0;
  let skipped = 0;
  const ts = nowIso();

  for (const row of rows) {
    // Override rows read through to the dataset, so no field can be wiped.
    if (row.field_overrides_json !== null) {
      skipped += 1;
      continue;
    }
    const dataset = byKey.get(row.origin_key)?.fields;
    if (!dataset) {
      skipped += 1;
      continue;
    }
    let overlay: ParasiteFields;
    try {
      overlay = parasiteFieldsSchema.parse(JSON.parse(row.fields_json));
    } catch {
      skipped += 1;
      continue;
    }
    const next = healOverlayFieldsFromDataset(overlay, dataset);
    if (!next) {
      skipped += 1;
      continue;
    }
    healed += 1;
    if (!opts.dry_run) {
      await db
        .prepare(
          `UPDATE atlas_entries
           SET fields_json = ?, updated_at = ?
           WHERE id = ? AND atlas_id = ?`,
        )
        .bind(JSON.stringify(next), ts, row.id, row.atlas_id)
        .run();
    }
  }

  return {
    scanned: rows.length,
    healed,
    skipped,
    dry_run: opts.dry_run,
  };
}
