import {
  ADMIN_LIST_CORRECTIONS_SQL,
  RESOLVE_CORRECTION_SQL,
  SELECT_CORRECTION_STATUS_SQL,
  SELECT_OPEN_SUGGESTION_SQL,
  SUGGESTION_STATUS_BY_ATLAS_SQL,
  UPSERT_OPEN_SUGGESTION_SQL,
} from "../../worker/atlas/corrections";

export type CorrectionSuggestionRow = {
  id: string;
  user_id: string;
  atlas_id: string;
  origin_key: string;
  dataset_version: number;
  diff_json: string;
  note: string | null;
  source_url: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

export type CorrectionSuggestionsState = {
  rows: Map<string, CorrectionSuggestionRow>;
};

export function initCorrectionSuggestionsState(): CorrectionSuggestionsState {
  return { rows: new Map() };
}

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();
const SELECT_OPEN = norm(SELECT_OPEN_SUGGESTION_SQL);
const UPSERT = norm(UPSERT_OPEN_SUGGESTION_SQL);
const STATUS_BY_ATLAS = norm(SUGGESTION_STATUS_BY_ATLAS_SQL);
const ADMIN_LIST = norm(ADMIN_LIST_CORRECTIONS_SQL);
const SELECT_STATUS = norm(SELECT_CORRECTION_STATUS_SQL);
const RESOLVE = norm(RESOLVE_CORRECTION_SQL);

function openRow(
  state: CorrectionSuggestionsState,
  userId: string,
  originKey: string,
): CorrectionSuggestionRow | undefined {
  return [...state.rows.values()].find(
    (r) => r.user_id === userId && r.origin_key === originKey && r.status === "open",
  );
}

/** `undefined` = not ours; `null` = ours, no row. */
export function correctionSuggestionsFirst<T>(
  state: CorrectionSuggestionsState,
  normalized: string,
  bound: unknown[],
): T | null | undefined {
  if (normalized === SELECT_OPEN) {
    const row = openRow(state, bound[0] as string, bound[1] as string);
    return (row ? { diff_json: row.diff_json } : null) as T | null;
  }
  if (normalized === SELECT_STATUS) {
    const row = state.rows.get(bound[0] as string);
    return (row ? { status: row.status } : null) as T | null;
  }
  return undefined;
}

export function correctionSuggestionsAll<T>(
  state: CorrectionSuggestionsState,
  users: ReadonlyMap<string, { email: string }>,
  normalized: string,
  bound: unknown[],
): { results: T[] } | null {
  if (normalized === STATUS_BY_ATLAS) {
    const rows = [...state.rows.values()]
      .filter((r) => r.atlas_id === bound[0])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({ origin_key: r.origin_key, status: r.status }));
    return { results: rows as T[] };
  }
  if (normalized === ADMIN_LIST) {
    const [status, limit] = bound as [string, number];
    const rows = [...state.rows.values()]
      .filter((r) => r.status === status && users.has(r.user_id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        origin_key: r.origin_key,
        dataset_version: r.dataset_version,
        diff_json: r.diff_json,
        note: r.note,
        source_url: r.source_url,
        status: r.status,
        created_at: r.created_at,
        resolved_at: r.resolved_at,
        student_email: users.get(r.user_id)!.email,
      }));
    return { results: rows as T[] };
  }
  return null;
}

export function correctionSuggestionsRun(
  state: CorrectionSuggestionsState,
  normalized: string,
  bound: unknown[],
): D1Result | null {
  if (normalized === UPSERT) {
    const [id, user_id, atlas_id, origin_key, dataset_version, diff_json, note, source_url, created_at] =
      bound as [string, string, string, string, number, string, string | null, string | null, string];
    const existing = openRow(state, user_id, origin_key);
    if (existing) {
      state.rows.set(existing.id, {
        ...existing,
        atlas_id,
        dataset_version,
        diff_json,
        note: note ?? existing.note,
        source_url: source_url ?? existing.source_url,
      });
    } else {
      state.rows.set(id, {
        id,
        user_id,
        atlas_id,
        origin_key,
        dataset_version,
        diff_json,
        note,
        source_url,
        status: "open",
        created_at,
        resolved_at: null,
        resolved_by: null,
      });
    }
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  if (normalized === RESOLVE) {
    const [status, resolved_at, resolved_by, id] = bound as [string, string, string, string];
    const row = state.rows.get(id);
    if (!row || row.status !== "open") {
      return { success: true, meta: { changes: 0 } } as D1Result;
    }
    state.rows.set(id, { ...row, status, resolved_at, resolved_by });
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
  return null;
}
