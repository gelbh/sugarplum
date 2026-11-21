// Single-line SQL so the fake D1 in tests/worker matches these exact strings.

export const SELECT_OPEN_SUGGESTION_SQL =
  "SELECT diff_json FROM atlas_correction_suggestions WHERE user_id = ? AND origin_key = ? AND status = 'open'";

// Repeat submissions keep the old note/link when the new one is empty.
export const UPSERT_OPEN_SUGGESTION_SQL =
  "INSERT INTO atlas_correction_suggestions (id, user_id, atlas_id, origin_key, dataset_version, diff_json, note, source_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?) ON CONFLICT (user_id, origin_key) WHERE status = 'open' DO UPDATE SET atlas_id = excluded.atlas_id, dataset_version = excluded.dataset_version, diff_json = excluded.diff_json, note = COALESCE(excluded.note, atlas_correction_suggestions.note), source_url = COALESCE(excluded.source_url, atlas_correction_suggestions.source_url)";

export const SUGGESTION_STATUS_BY_ATLAS_SQL =
  "SELECT origin_key, status FROM atlas_correction_suggestions WHERE atlas_id = ? ORDER BY created_at ASC";

export const ADMIN_LIST_CORRECTIONS_SQL =
  "SELECT s.id, s.origin_key, s.dataset_version, s.diff_json, s.note, s.source_url, s.status, s.created_at, s.resolved_at, u.email AS student_email FROM atlas_correction_suggestions s JOIN users u ON u.id = s.user_id WHERE s.status = ? ORDER BY s.created_at DESC LIMIT ?";

export const SELECT_CORRECTION_STATUS_SQL =
  "SELECT status FROM atlas_correction_suggestions WHERE id = ?";

export const RESOLVE_CORRECTION_SQL =
  "UPDATE atlas_correction_suggestions SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ? AND status = 'open'";
