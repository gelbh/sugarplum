import type { Env } from "../env";
import type { AtlasEntryView, AtlasTier } from "../../src/atlas/types";
import { scanFocus } from "../../src/atlas/hub/focusScan";
import { atlasGenera } from "../../src/atlas/hub/packMatch";
import { loadParasiteDataset } from "./datasets/parasites/index";
import { overlayAtlas, type OverlayRow } from "./merge";
import {
  focusPackFingerprint,
  loadAtlasFocusMaterials,
  loadAtlasMaterialRows,
} from "./atlas-materials";

export type FocusRow = {
  entry_key: string;
  tier: AtlasTier;
  reason: string;
  material_ids_json: string;
  override: AtlasTier | null;
  updated_at: string;
  /** 1 when any pack material mentions the entry (lenient match). */
  in_pack: number;
};

export type FocusMap = Map<
  string,
  {
    tier: AtlasTier;
    reason: string;
    override: AtlasTier | null;
    materialIds: string[];
    inPack: boolean;
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

type EntryOverlayRow = {
  id: string;
  origin_key: string | null;
  origin_version: number | null;
  canonical_name: string;
  common_name: string | null;
  fields_json: string;
  edited_at: string | null;
  deleted_at: string | null;
  field_overrides_json: string | null;
  aliases_json: string | null;
};

export function focusEntryKey(entry: {
  id: string;
  originKey: string | null;
}): string {
  return entry.originKey ?? entry.id;
}

export function overrideFocusView(override: AtlasTier): {
  tier: AtlasTier;
  reason: string;
} {
  return {
    tier: override,
    reason: override === "key" ? "Manual pin" : "Manual demote",
  };
}

/**
 * `packFresh: false` (rows from an older scan version) reports every entry as
 * unscanned for pack hiding, so stale `in_pack` never hides anything.
 * Callers pass `isFocusPackFresh` read after any inline refresh.
 */
export function enrichEntriesWithFocus(
  entries: AtlasEntryView[],
  focus: FocusMap | null,
  packFresh: boolean,
): AtlasEntryView[] {
  if (!focus) {
    return entries.map((e) => ({
      ...e,
      tier: null,
      reason: null,
      override: null,
      focusMaterialIds: [],
      inPack: null,
    }));
  }
  return entries.map((e) => {
    const row = focus.get(focusEntryKey(e));
    if (!row) {
      return {
        ...e,
        tier: null,
        reason: null,
        override: null,
        focusMaterialIds: [],
        inPack: null,
      };
    }
    const inPack = packFresh ? row.inPack : null;
    if (row.override) {
      const pinned = overrideFocusView(row.override);
      return {
        ...e,
        tier: pinned.tier,
        reason: pinned.reason,
        override: row.override,
        focusMaterialIds: [],
        inPack,
      };
    }
    return {
      ...e,
      tier: row.tier,
      reason: row.reason,
      override: null,
      focusMaterialIds: row.materialIds,
      inPack,
    };
  });
}

export async function loadFocusMap(
  db: D1Database,
  atlasId: string,
): Promise<FocusMap> {
  const { results } = await db
    .prepare(
      `SELECT entry_key, tier, reason, material_ids_json, override, updated_at,
              in_pack
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
      inPack: row.in_pack === 1,
    });
  }
  return map;
}

async function loadMergedEntries(
  db: D1Database,
  atlasId: string,
): Promise<AtlasEntryView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, origin_key, origin_version, canonical_name, common_name,
              fields_json, edited_at, deleted_at, field_overrides_json, aliases_json
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
    field_overrides_json: e.field_overrides_json,
    aliases_json: e.aliases_json,
  }));
  return overlayAtlas(loadParasiteDataset().entries, overlays);
}

async function loadStoredFocusPackFingerprint(
  db: D1Database,
  atlasId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT focus_pack_fingerprint FROM atlases WHERE id = ?")
    .bind(atlasId)
    .first<{ focus_pack_fingerprint: string | null }>();
  return row?.focus_pack_fingerprint ?? null;
}

/**
 * True when the stored scan matches the current pack. A `refreshing:` lease
 * never equals a versioned fingerprint, so a lease reads as stale.
 */
export async function isFocusPackFresh(
  db: D1Database,
  atlasId: string,
): Promise<boolean> {
  const current = focusPackFingerprint(await loadAtlasMaterialRows(db, atlasId));
  return (await loadStoredFocusPackFingerprint(db, atlasId)) === current;
}

async function saveFocusPackFingerprint(
  db: D1Database,
  atlasId: string,
  fingerprint: string,
): Promise<void> {
  await db
    .prepare("UPDATE atlases SET focus_pack_fingerprint = ? WHERE id = ?")
    .bind(fingerprint, atlasId)
    .run();
}

export async function refreshAtlasFocus(
  db: D1Database,
  env: Env,
  opts: { atlasId: string },
): Promise<void> {
  const atlasId = opts.atlasId;

  const atlas = await db
    .prepare("SELECT id, user_id FROM atlases WHERE id = ?")
    .bind(atlasId)
    .first<{ id: string; user_id: string }>();
  if (!atlas) return;

  const existing = await loadFocusMap(db, atlasId);
  const materialRows = await loadAtlasMaterialRows(db, atlasId);
  const focusMaterials = await loadAtlasFocusMaterials(db, env, atlasId);
  const now = new Date().toISOString();
  const fingerprint = focusPackFingerprint(materialRows);

  if (focusMaterials.length === 0) {
    // Keep manual pins when nothing is scannable so Focus PATCH sticks.
    for (const [entryKey, row] of existing) {
      if (row.override != null) {
        await db
          .prepare(
            `INSERT OR REPLACE INTO atlas_entry_focus (
               atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at, in_pack
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            atlasId,
            entryKey,
            "standard",
            "Standard",
            "[]",
            row.override,
            now,
            // Never hides: an empty pack never activates pack hiding.
            0,
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
    await saveFocusPackFingerprint(db, atlasId, fingerprint);
    return;
  }

  const entries = await loadMergedEntries(db, atlasId);
  // Dataset genera only: a learner name like "Lungworm" would stop real matches.
  const genera = atlasGenera(entries.filter((e) => e.originKey !== null));
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
      genera,
    );
    await db
      .prepare(
        `INSERT OR REPLACE INTO atlas_entry_focus (
           atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at, in_pack
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        atlasId,
        entryKey,
        result.tier,
        result.reason,
        JSON.stringify(result.materialIds),
        override,
        now,
        result.inPack ? 1 : 0,
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

  await saveFocusPackFingerprint(db, atlasId, fingerprint);
}

export async function refreshFocusBestEffort(
  db: D1Database,
  env: Env,
  opts: { atlasId: string },
): Promise<void> {
  try {
    await refreshAtlasFocus(db, env, opts);
  } catch (err) {
    console.warn("atlas focus refresh failed", err);
  }
}

export type ListEntriesWithFocusResult = {
  entries: AtlasEntryView[];
  /** True when Focus refresh was scheduled off the request path (PDF extract). */
  focusRefreshPending: boolean;
};

const FOCUS_REFRESH_LEASE = "refreshing:";
/** Dead waitUntil left `refreshing:` forever; expire so GET can retry. */
const FOCUS_REFRESH_LEASE_TTL_MS = 120_000;

/** Exported for tests: `refreshing:<epochMs>:<fingerprint>` (legacy untimed = expired). */
export function focusRefreshLeaseActive(
  stored: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!stored?.startsWith(FOCUS_REFRESH_LEASE)) return false;
  const rest = stored.slice(FOCUS_REFRESH_LEASE.length);
  const match = /^(\d+):(.*)$/.exec(rest);
  if (!match) return false;
  const started = Number(match[1]);
  if (!Number.isFinite(started)) return false;
  return nowMs - started < FOCUS_REFRESH_LEASE_TTL_MS;
}

function encodeFocusRefreshLease(
  fingerprint: string,
  nowMs: number = Date.now(),
): string {
  return `${FOCUS_REFRESH_LEASE}${nowMs}:${fingerprint}`;
}

export async function listEntriesWithFocus(
  db: D1Database,
  env: Env,
  opts: {
    atlasId: string;
    userId: string;
    entries: AtlasEntryView[];
    /**
     * When set (Workers `waitUntil`), expensive pack rescans run in the
     * background so GET /entries stays under the Worker wall-clock limit.
     * Omit in tests / make-cards to await a consistent map.
     */
    schedule?: (promise: Promise<unknown>) => void;
    /** Read-only view-as: enrich only; never lease or refresh Focus. */
    skipMutatingRefresh?: boolean;
  },
): Promise<ListEntriesWithFocusResult> {
  let focus = await loadFocusMap(db, opts.atlasId);
  const materialRows = await loadAtlasMaterialRows(db, opts.atlasId);
  const currentFingerprint = focusPackFingerprint(materialRows);
  const storedFingerprint = await loadStoredFocusPackFingerprint(
    db,
    opts.atlasId,
  );
  if (opts.skipMutatingRefresh) {
    // View-as never rescans, so rows from an older scan must not hide entries.
    return {
      entries: enrichEntriesWithFocus(
        opts.entries,
        focus,
        storedFingerprint === currentFingerprint,
      ),
      focusRefreshPending: false,
    };
  }
  const missing = opts.entries.some((e) => !focus.has(focusEntryKey(e)));
  const readyCount = materialRows.length;
  const refreshInFlight = focusRefreshLeaseActive(storedFingerprint);
  const fingerprintStale =
    !refreshInFlight && storedFingerprint !== currentFingerprint;
  const emptyPackStale = focus.size > 0 && readyCount === 0;
  const needsPackScan = (missing && readyCount > 0) || fingerprintStale;

  // Empty-pack clear is cheap (D1 only). Pack scans extract PDFs and must not
  // block GET when a schedule hook is available.
  if (emptyPackStale) {
    await refreshFocusBestEffort(db, env, { atlasId: opts.atlasId });
    focus = await loadFocusMap(db, opts.atlasId);
    return {
      entries: enrichEntriesWithFocus(
        opts.entries,
        focus,
        await isFocusPackFresh(db, opts.atlasId),
      ),
      focusRefreshPending: false,
    };
  }

  if (refreshInFlight) {
    return {
      entries: enrichEntriesWithFocus(opts.entries, focus, false),
      focusRefreshPending: true,
    };
  }

  if (needsPackScan) {
    if (opts.schedule) {
      await saveFocusPackFingerprint(
        db,
        opts.atlasId,
        encodeFocusRefreshLease(currentFingerprint),
      );
      opts.schedule(
        (async () => {
          try {
            await refreshAtlasFocus(db, env, { atlasId: opts.atlasId });
          } catch (err) {
            console.warn("atlas focus refresh failed", err);
            try {
              // Clear lease so a later GET can retry.
              await db
                .prepare(
                  "UPDATE atlases SET focus_pack_fingerprint = NULL WHERE id = ?",
                )
                .bind(opts.atlasId)
                .run();
            } catch {
              /* lease clear best-effort */
            }
          }
        })(),
      );
      return {
        entries: enrichEntriesWithFocus(opts.entries, focus, false),
        focusRefreshPending: true,
      };
    }
    await refreshFocusBestEffort(db, env, { atlasId: opts.atlasId });
    focus = await loadFocusMap(db, opts.atlasId);
    // A failed best-effort refresh leaves the old fingerprint and old rows.
    return {
      entries: enrichEntriesWithFocus(
        opts.entries,
        focus,
        await isFocusPackFresh(db, opts.atlasId),
      ),
      focusRefreshPending: false,
    };
  }

  return {
    entries: enrichEntriesWithFocus(
      opts.entries,
      focus,
      storedFingerprint === currentFingerprint,
    ),
    focusRefreshPending: false,
  };
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
      `SELECT entry_key, tier, reason, material_ids_json, override, in_pack
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
  // INSERT OR REPLACE rewrites the row; carry in_pack or it resets to 0.
  const inPack = existing?.in_pack ?? 0;

  await db
    .prepare(
      `INSERT OR REPLACE INTO atlas_entry_focus (
         atlas_id, entry_key, tier, reason, material_ids_json, override, updated_at, in_pack
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(atlasId, entryKey, tier, reason, materialIds, override, now, inPack)
    .run();
}
