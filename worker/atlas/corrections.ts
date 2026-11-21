import { HTTPException } from "hono/http-exception";
import type { DatasetEntry } from "./datasets/schema";
import type { EntryRow } from "./entryOverlays";
import { BUILT_IN_NAME_MESSAGE } from "./entry-helpers";
import {
  mergeOverlayFields,
  parseLearnerAliases,
  sameFieldValue,
  tryParseObject,
} from "./merge";
import { cleanAliasList } from "../../src/atlas/hub/nameMatch";
import { normalizeParasiteName } from "./names";
import {
  PARASITE_FIELD_KEYS,
  type ParasiteFields,
} from "./templates/parasite";
import type {
  AtlasEntryView,
  CorrectionDiff,
  CorrectionStatus,
} from "../../src/atlas/types";

// Single-line SQL so the fake D1 in tests/worker matches these exact strings.

export const SELECT_OPEN_SUGGESTION_SQL =
  "SELECT diff_json FROM atlas_correction_suggestions WHERE user_id = ? AND origin_key = ? AND status = 'open'";

// Repeat submissions keep the old note/link when the new one is empty.
export const UPSERT_OPEN_SUGGESTION_SQL =
  "INSERT INTO atlas_correction_suggestions (id, user_id, atlas_id, origin_key, dataset_version, diff_json, note, source_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?) ON CONFLICT (user_id, origin_key) WHERE status = 'open' DO UPDATE SET atlas_id = excluded.atlas_id, dataset_version = excluded.dataset_version, diff_json = excluded.diff_json, note = COALESCE(excluded.note, atlas_correction_suggestions.note), source_url = COALESCE(excluded.source_url, atlas_correction_suggestions.source_url)";

// Per user, not per atlas: the open row's atlas_id moves on each upsert.
export const SUGGESTION_STATUS_BY_USER_SQL =
  "SELECT origin_key, status FROM atlas_correction_suggestions WHERE user_id = ? ORDER BY created_at ASC, rowid ASC";

export const ADMIN_LIST_CORRECTIONS_SQL =
  "SELECT s.id, s.origin_key, s.dataset_version, s.diff_json, s.note, s.source_url, s.status, s.created_at, s.resolved_at, u.email AS student_email FROM atlas_correction_suggestions s JOIN users u ON u.id = s.user_id WHERE s.status = ? ORDER BY s.created_at DESC, s.rowid DESC LIMIT ?";

export const SELECT_CORRECTION_STATUS_SQL =
  "SELECT status FROM atlas_correction_suggestions WHERE id = ?";

export const RESOLVE_CORRECTION_SQL =
  "UPDATE atlas_correction_suggestions SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'open'";

export const SUGGESTION_NOTE_MAX = 1000;

/** Keys this save touched; values always come from storage. */
export type SuggestionInput = {
  keys: string[];
  /** Raw submitted scientific name; the route refuses one that differs. */
  canonicalName: string | null;
  note: string | null;
  sourceUrl: string | null;
};

/** What the student has stored for the entry, read after the overlay PATCH. */
export type CurrentEntryState = {
  commonName: string | null;
  fields: ParasiteFields;
  learnerAliases: string[];
};

function bad(message: string): never {
  throw new HTTPException(400, { message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") bad("note must be text");
  const note = raw.trim();
  if (note.length > SUGGESTION_NOTE_MAX) {
    bad(`note must be at most ${SUGGESTION_NOTE_MAX} characters`);
  }
  return note || null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseSourceUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") bad("sourceUrl must be an http or https link");
  const value = raw.trim();
  if (!value) return null;
  if (!isHttpUrl(value)) bad("sourceUrl must be an http or https link");
  return value;
}

const FIELD_KEYS = new Set<string>(PARASITE_FIELD_KEYS);

/** The patch selects keys only; unknown field names are ignored. */
export function parseSuggestionBody(raw: unknown): SuggestionInput {
  if (!isRecord(raw)) bad("Invalid JSON body");
  const patch = raw.patch;
  if (!isRecord(patch)) bad("patch required");
  const keys = new Set<string>();
  if (isRecord(patch.fields)) {
    for (const key of Object.keys(patch.fields)) {
      if (FIELD_KEYS.has(key)) keys.add(key);
    }
  }
  if ("commonName" in patch) keys.add("commonName");
  if ("aliases" in patch) keys.add("aliases");
  return {
    keys: [...keys],
    canonicalName:
      typeof patch.canonicalName === "string" ? patch.canonicalName : null,
    note: parseNote(raw.note),
    sourceUrl: parseSourceUrl(raw.sourceUrl),
  };
}

/**
 * Dataset aliases plus the learner aliases the entry view keeps (same
 * cleanAliasList pass over dataset aliases, misspellings, then learner ones).
 */
function withLearnerAliases(base: DatasetEntry, learner: string[]): string[] {
  const seeds = [...base.aliases, ...base.misspellings];
  const shown = cleanAliasList([...seeds, ...learner]);
  return [...base.aliases, ...shown.slice(cleanAliasList(seeds).length)];
}

/** A stored diff_json, or {} when it is unreadable. */
export function parseStoredDiff(json: string | null): CorrectionDiff {
  return (tryParseObject(json) ?? {}) as CorrectionDiff;
}

function fromTo(
  base: DatasetEntry,
  current: CurrentEntryState,
  key: string,
): [unknown, unknown] | null {
  if (key === "commonName") {
    return [base.commonName, current.commonName ?? base.commonName];
  }
  if (key === "aliases") {
    return [base.aliases, withLearnerAliases(base, current.learnerAliases)];
  }
  if (!FIELD_KEYS.has(key)) return null;
  const field = key as keyof ParasiteFields;
  return [(base.fields as ParasiteFields)[field], current.fields[field]];
}

export function computeCorrectionDiff(
  base: DatasetEntry,
  current: CurrentEntryState,
  keys: readonly string[],
): CorrectionDiff {
  const diff: CorrectionDiff = {};
  for (const key of keys) {
    const pair = fromTo(base, current, key);
    if (!pair) continue;
    const from = pair[0] ?? null;
    const to = pair[1] ?? null;
    if (!sameFieldValue(from, to)) diff[key] = { from, to };
  }
  return diff;
}

/**
 * Repeat submission: the open row's keys stay and this save's keys join
 * them. Every key is revalued (dataset now vs stored now); keys back at the
 * dataset value drop out.
 */
export function mergeSuggestionDiff(
  existingJson: string | null,
  base: DatasetEntry,
  current: CurrentEntryState,
  keys: readonly string[],
): CorrectionDiff {
  const allKeys = new Set([...Object.keys(parseStoredDiff(existingJson)), ...keys]);
  return computeCorrectionDiff(base, current, [...allKeys]);
}

/**
 * A built-in parasite keeps its scientific name. Submitting the stored or
 * dataset name is a no-op, matching the overlay PATCH.
 */
export function assertCanonicalUnchanged(
  submitted: string | null,
  base: DatasetEntry,
  row: EntryRow | null,
): void {
  if (submitted === null) return;
  const name = normalizeParasiteName(submitted.trim())?.canonical;
  if (name !== undefined && (name === base.canonicalName || name === row?.canonical_name)) {
    return;
  }
  bad(BUILT_IN_NAME_MESSAGE);
}

/** Stored state after the overlay PATCH; a NULL common_name means the dataset name. */
export function currentEntryState(
  base: DatasetEntry,
  row: EntryRow | null,
): CurrentEntryState {
  return {
    commonName: row?.common_name ?? base.commonName,
    fields: row
      ? (mergeOverlayFields(base.fields, row).fields as ParasiteFields)
      : (base.fields as ParasiteFields),
    learnerAliases: parseLearnerAliases(row?.aliases_json),
  };
}

export async function loadOpenSuggestionDiff(
  db: D1Database,
  userId: string,
  originKey: string,
): Promise<string | null> {
  const row = await db
    .prepare(SELECT_OPEN_SUGGESTION_SQL)
    .bind(userId, originKey)
    .first<{ diff_json: string }>();
  return row?.diff_json ?? null;
}

export async function upsertOpenSuggestion(
  db: D1Database,
  args: {
    id: string;
    userId: string;
    atlasId: string;
    originKey: string;
    datasetVersion: number;
    diff: CorrectionDiff;
    note: string | null;
    sourceUrl: string | null;
    now: string;
  },
): Promise<void> {
  await db
    .prepare(UPSERT_OPEN_SUGGESTION_SQL)
    .bind(
      args.id,
      args.userId,
      args.atlasId,
      args.originKey,
      args.datasetVersion,
      JSON.stringify(args.diff),
      args.note,
      args.sourceUrl,
      args.now,
    )
    .run();
}

export async function enrichAtlasEntriesWithSuggestions(
  db: D1Database,
  userId: string,
  entries: AtlasEntryView[],
): Promise<AtlasEntryView[]> {
  const { results } = await db
    .prepare(SUGGESTION_STATUS_BY_USER_SQL)
    .bind(userId)
    .all<{ origin_key: string; status: CorrectionStatus }>();
  const statuses = new Map<string, CorrectionStatus>();
  // Ascending order: the latest row per parasite wins.
  for (const row of results ?? []) statuses.set(row.origin_key, row.status);
  return entries.map((e) => ({
    ...e,
    suggestionStatus: e.originKey ? (statuses.get(e.originKey) ?? null) : null,
  }));
}
