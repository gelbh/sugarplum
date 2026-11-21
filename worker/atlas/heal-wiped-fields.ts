import {
  emptyParasiteFields,
  PARASITE_FIELD_KEYS,
  parasiteFieldsSchema,
  type ParasiteFieldKey,
  type ParasiteFields,
} from "./templates/parasite";
import { loadParasiteDataset } from "./datasets/parasites/index";
import { nowIso } from "./ownership";

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isEmptyDefaultField(
  key: ParasiteFieldKey,
  value: ParasiteFields[ParasiteFieldKey],
): boolean {
  return deepEqual(value, emptyParasiteFields()[key]);
}

/** Restore empty-default overlay keys from dataset; null when nothing changes. */
export function healOverlayFieldsFromDataset(
  overlay: ParasiteFields,
  dataset: ParasiteFields,
): ParasiteFields | null {
  const empty = emptyParasiteFields();
  let changed = false;
  const next: ParasiteFields = { ...overlay };
  for (const key of PARASITE_FIELD_KEYS) {
    if (
      deepEqual(overlay[key], empty[key]) &&
      !deepEqual(dataset[key], empty[key])
    ) {
      (next as Record<ParasiteFieldKey, ParasiteFields[ParasiteFieldKey]>)[
        key
      ] = dataset[key];
      changed = true;
    }
  }
  return changed ? next : null;
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
  field_overrides_json?: string | null;
  edited_at: string | null;
};

export async function runHealWipedFields(
  db: D1Database,
  opts: HealWipedFieldsOpts,
): Promise<HealWipedFieldsResult> {
  const byKey = new Map(
    loadParasiteDataset().entries.map((e) => [e.key, e.fields]),
  );

  let rows: OverlayScanRow[];
  if (opts.atlasId) {
    const result = await db
      .prepare(
        `SELECT id, atlas_id, origin_key, fields_json, field_overrides_json, edited_at
         FROM atlas_entries
         WHERE atlas_id = ? AND deleted_at IS NULL AND origin_key IS NOT NULL`,
      )
      .bind(opts.atlasId)
      .all<OverlayScanRow>();
    rows = result.results ?? [];
  } else if (opts.userId) {
    const result = await db
      .prepare(
        `SELECT e.id, e.atlas_id, e.origin_key, e.fields_json, e.field_overrides_json, e.edited_at
         FROM atlas_entries e
         JOIN atlases a ON a.id = e.atlas_id
         WHERE a.user_id = ?
           AND e.deleted_at IS NULL
           AND e.origin_key IS NOT NULL`,
      )
      .bind(opts.userId)
      .all<OverlayScanRow>();
    rows = result.results ?? [];
  } else {
    const result = await db
      .prepare(
        `SELECT id, atlas_id, origin_key, fields_json, field_overrides_json, edited_at
         FROM atlas_entries
         WHERE deleted_at IS NULL AND origin_key IS NOT NULL`,
      )
      .all<OverlayScanRow>();
    rows = result.results ?? [];
  }

  let healed = 0;
  let skipped = 0;
  const ts = nowIso();

  for (const row of rows) {
    // Defensive: mocks / loose SELECTs may return rows SQL would exclude.
    if (!row.origin_key) {
      skipped += 1;
      continue;
    }
    // Override rows read through to the dataset, so no field can be wiped.
    if (row.field_overrides_json != null) {
      skipped += 1;
      continue;
    }
    const dataset = byKey.get(row.origin_key);
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
