import type { Env } from "../env";
import { readOcrSidecar } from "../materials/ocr-sidecar";
import {
  isSourceRole,
  type SourceRole,
} from "../../src/lib/sourceRole";
import {
  scanFocus,
  type FocusMaterial,
} from "../../src/atlas/focusScan";
import type { AtlasEntryView, AtlasTier } from "../../src/atlas/types";
import { loadParasiteDataset } from "./datasets/parasites";
import { overlayAtlas, type OverlayRow } from "./merge";

export type FocusRow = {
  entry_key: string;
  tier: AtlasTier;
  reason: string;
  material_ids_json: string;
  override: AtlasTier | null;
  updated_at: string;
};

export type FocusMap = Map<
  string,
  {
    tier: AtlasTier;
    reason: string;
    override: AtlasTier | null;
    materialIds: string[];
  }
>;

function parseMaterialIds(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

type MaterialScanRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  source_role: string | null;
  status: string;
};

const READY_STATUS = "ready";

type EntryOverlayRow = {
  id: string;
  origin_key: string | null;
  origin_version: number | null;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  edited_at: string | null;
  deleted_at: string | null;
};

const SCAN_KINDS = new Set(["pdf", "paste", "pptx"]);

export function focusEntryKey(entry: {
  id: string;
  originKey: string | null;
}): string {
  return entry.originKey ?? entry.id;
}

/** Same wording as scanFocus manual override. */
export function overrideFocusView(override: AtlasTier): {
  tier: AtlasTier;
  reason: string;
} {
  return {
    tier: override,
    reason: override === "key" ? "Manual pin" : "Manual demote",
  };
}

export function enrichEntriesWithFocus(
  entries: AtlasEntryView[],
  focus: FocusMap | null,
): AtlasEntryView[] {
  if (!focus) {
    return entries.map((e) => ({
      ...e,
      tier: null,
      reason: null,
      focusMaterialIds: [],
    }));
  }
  return entries.map((e) => {
    const row = focus.get(focusEntryKey(e));
    if (!row) {
      return { ...e, tier: null, reason: null, focusMaterialIds: [] };
    }
    if (row.override) {
      const pinned = overrideFocusView(row.override);
      return {
        ...e,
        tier: pinned.tier,
        reason: pinned.reason,
        focusMaterialIds: [],
      };
    }
    return {
      ...e,
      tier: row.tier,
      reason: row.reason,
      focusMaterialIds: row.materialIds,
    };
  });
}

export async function loadFocusMap(
  db: D1Database,
  atlasId: string,
): Promise<FocusMap> {
  const { results } = await db
    .prepare(
      `SELECT entry_key, tier, reason, material_ids_json, override, updated_at
       FROM atlas_entry_focus WHERE atlas_id = ?`,
    )
    .bind(atlasId)
    .all<FocusRow>();
  const map: FocusMap = new Map();
  for (const row of results ?? []) {
    map.set(row.entry_key, {
      tier: row.tier,
      reason: row.reason,
      override: row.override,
      materialIds: parseMaterialIds(row.material_ids_json),
    });
  }
  return map;
}

async function resolveAtlasId(
  db: D1Database,
  opts: { atlasId: string } | { subjectId: string },
): Promise<string | null> {
  if ("atlasId" in opts) return opts.atlasId;
  const row = await db
    .prepare("SELECT id FROM atlases WHERE subject_id = ?")
    .bind(opts.subjectId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function loadSubjectMaterials(
  db: D1Database,
  subjectId: string,
): Promise<MaterialScanRow[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.source_role, m.status
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.subject_id = ?`,
    )
    .bind(subjectId)
    .all<MaterialScanRow>();
  return (results ?? []).filter(
    (m) => SCAN_KINDS.has(m.kind) && m.status === READY_STATUS,
  );
}

async function toFocusMaterial(
  env: Env,
  row: MaterialScanRow,
): Promise<FocusMaterial> {
  const sourceRole: SourceRole = isSourceRole(row.source_role)
    ? row.source_role
    : "lecture";
  const pages: FocusMaterial["pages"] = [];

  if (row.kind === "paste" && row.r2_key) {
    try {
      const obj = await env.MATERIALS.get(row.r2_key);
      const text = obj ? (await obj.text()).trim() : "";
      if (text) pages.push({ page: 1, text });
    } catch {
      /* filename-only fallback */
    }
  } else if (row.kind === "pdf") {
    const sidecar = await readOcrSidecar(env, row.deck_id, row.id);
    if (sidecar?.pages.length) {
      for (const p of sidecar.pages) {
        pages.push({ page: p.page, text: p.text });
      }
    }
  }

  return {
    id: row.id,
    filename: row.filename,
    sourceRole,
    pages,
  };
}

async function loadMergedEntries(
  db: D1Database,
  atlasId: string,
): Promise<AtlasEntryView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, origin_key, origin_version, canonical_name, common_name,
              fields_json, edited_at, deleted_at
       FROM atlas_entries WHERE atlas_id = ?`,
    )
    .bind(atlasId)
    .all<EntryOverlayRow>();
  const overlays: OverlayRow[] = (results ?? []).map((e) => ({
    id: e.id,
    origin_key: e.origin_key,
    origin_version: e.origin_version,
    canonical_name: e.canonical_name,
    common_name: e.common_name,
    fields_json: e.fields_json,
    edited_at: e.edited_at,
    deleted_at: e.deleted_at,
  }));
  return overlayAtlas(loadParasiteDataset().entries, overlays);
}

/**
 * Recompute Focus tiers for an Atlas from subject-linked materials.
 * Prefer calling on material/entry writes; GET reads the cached table.
 */
export async function refreshAtlasFocus(
  db: D1Database,
  env: Env,
  opts: { atlasId: string } | { subjectId: string },
): Promise<void> {
  const atlasId = await resolveAtlasId(db, opts);
  if (!atlasId) return;

  const atlas = await db
    .prepare("SELECT id, subject_id FROM atlases WHERE id = ?")
    .bind(atlasId)
    .first<{ id: string; subject_id: string }>();
  if (!atlas) return;

  const existing = await loadFocusMap(db, atlasId);
  const materials = await loadSubjectMaterials(db, atlas.subject_id);
  const now = new Date().toISOString();

  if (materials.length === 0) {
    // Keep manual pins when nothing is scannable so Focus PATCH sticks.
    for (const [entryKey, row] of existing) {
      if (row.override != null) {
        await db
          .prepare(
            `INSERT OR REPLACE INTO atlas_entry_focus (
               atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            atlasId,
            entryKey,
            "standard",
            "Standard",
            "[]",
            row.override,
            now,
          )
          .run();
        continue;
      }
      await db
        .prepare(
          `DELETE FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
        )
        .bind(atlasId, entryKey)
        .run();
    }
    return;
  }

  const focusMaterials = await Promise.all(
    materials.map((m) => toFocusMaterial(env, m)),
  );
  const entries = await loadMergedEntries(db, atlasId);
  const keep = new Set<string>();

  for (const entry of entries) {
    const entryKey = focusEntryKey(entry);
    keep.add(entryKey);
    const override = existing.get(entryKey)?.override ?? null;
    // Persist pure scan; enrich applies override on read so GET stays correct
    // even when refresh is skipped after setFocusOverride.
    const result = scanFocus(
      {
        canonicalName: entry.canonicalName,
        commonName: entry.commonName,
        aliases: entry.aliases,
      },
      focusMaterials,
      null,
    );
    await db
      .prepare(
        `INSERT OR REPLACE INTO atlas_entry_focus (
           atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        atlasId,
        entryKey,
        result.tier,
        result.reason,
        JSON.stringify(result.materialIds),
        override,
        now,
      )
      .run();
  }

  // Preserve overrides for soft-deleted (or otherwise omitted) keys so restore
  // still sees the pin without a re-pin.
  for (const [entryKey, row] of existing) {
    if (keep.has(entryKey)) continue;
    if (row.override != null) continue;
    await db
      .prepare(
        `DELETE FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
      )
      .bind(atlasId, entryKey)
      .run();
  }
}

/** Best-effort rescan when a deck's subject may have an Atlas. */
export async function refreshAtlasFocusForDeck(
  db: D1Database,
  env: Env,
  deckId: string,
): Promise<void> {
  const deck = await db
    .prepare("SELECT subject_id FROM decks WHERE id = ?")
    .bind(deckId)
    .first<{ subject_id: string | null }>();
  if (!deck?.subject_id) return;
  await refreshFocusBestEffort(db, env, { subjectId: deck.subject_id });
}

/** Swallow refresh failures so material/entry writes still succeed. */
export async function refreshFocusBestEffort(
  db: D1Database,
  env: Env,
  opts: { atlasId: string } | { subjectId: string },
): Promise<void> {
  try {
    await refreshAtlasFocus(db, env, opts);
  } catch (err) {
    console.warn("atlas focus refresh failed", err);
  }
}

/**
 * Enrich entries with cached Focus; if the cache is empty but the subject has
 * ready scannable materials, refresh once then reload.
 */
export async function listEntriesWithFocus(
  db: D1Database,
  env: Env,
  opts: {
    atlasId: string;
    subjectId: string;
    entries: AtlasEntryView[];
  },
): Promise<AtlasEntryView[]> {
  let focus = await loadFocusMap(db, opts.atlasId);
  if (focus.size === 0) {
    const materials = await loadSubjectMaterials(db, opts.subjectId);
    if (materials.length > 0) {
      await refreshFocusBestEffort(db, env, { atlasId: opts.atlasId });
      focus = await loadFocusMap(db, opts.atlasId);
    }
  }
  return enrichEntriesWithFocus(opts.entries, focus);
}

export async function setFocusOverride(
  db: D1Database,
  atlasId: string,
  entryKey: string,
  override: AtlasTier | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .prepare(
      `SELECT entry_key, tier, reason, material_ids_json, override
       FROM atlas_entry_focus WHERE atlas_id = ? AND entry_key = ?`,
    )
    .bind(atlasId, entryKey)
    .first<FocusRow>();

  // Keep pure scan tier/reason in the row; enrich applies override on read.
  // When pinning a row that has no scan yet, seed tier/reason to the pin
  // so cache matches GET until the next refresh.
  const pinned = override ? overrideFocusView(override) : null;
  const tier = existing?.tier ?? pinned?.tier ?? "standard";
  const reason = existing?.reason ?? pinned?.reason ?? "Standard";
  const materialIds = existing?.material_ids_json ?? "[]";

  await db
    .prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(atlasId, entryKey, tier, reason, materialIds, override, now)
    .run();
}
