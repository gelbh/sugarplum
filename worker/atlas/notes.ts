import { HTTPException } from "hono/http-exception";
import type { AtlasEntryView } from "../../src/atlas/types";
import { focusEntryKey } from "./focus";

export const NOTE_MAX_CHARS = 8000;

export type NotesMap = Map<string, string>;

export async function loadNotesMap(
  db: D1Database,
  atlasId: string,
): Promise<NotesMap> {
  const { results } = await db
    .prepare(
      `SELECT entry_key, body FROM atlas_entry_notes WHERE atlas_id = ?`,
    )
    .bind(atlasId)
    .all<{ entry_key: string; body: string }>();
  const map: NotesMap = new Map();
  for (const row of results ?? []) {
    map.set(row.entry_key, row.body);
  }
  return map;
}

export function enrichEntriesWithNotes(
  entries: AtlasEntryView[],
  notes: NotesMap,
): AtlasEntryView[] {
  return entries.map((e) => ({
    ...e,
    personalNote: notes.get(focusEntryKey(e)) ?? null,
  }));
}

export async function enrichAtlasEntriesWithNotes(
  db: D1Database,
  atlasId: string,
  entries: AtlasEntryView[],
): Promise<AtlasEntryView[]> {
  const notes = await loadNotesMap(db, atlasId);
  return enrichEntriesWithNotes(entries, notes);
}

/** Trim + validate. Whitespace-only means clear. */
export function normalizeNoteBody(
  raw: unknown,
): "clear" | { body: string } {
  if (typeof raw !== "string") {
    throw new HTTPException(400, { message: "body required" });
  }
  const body = raw.trim();
  if (!body) return "clear";
  if (body.length > NOTE_MAX_CHARS) {
    throw new HTTPException(400, { message: "body too long" });
  }
  return { body };
}

export async function upsertEntryNote(
  db: D1Database,
  atlasId: string,
  entryKey: string,
  body: string,
  updatedAt: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO atlas_entry_notes (atlas_id, entry_key, body, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(atlas_id, entry_key) DO UPDATE SET
         body = excluded.body,
         updated_at = excluded.updated_at`,
    )
    .bind(atlasId, entryKey, body, updatedAt)
    .run();
}

export async function deleteEntryNote(
  db: D1Database,
  atlasId: string,
  entryKey: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM atlas_entry_notes WHERE atlas_id = ? AND entry_key = ?`,
    )
    .bind(atlasId, entryKey)
    .run();
}

export function noteEntryKey(
  resolved:
    | { kind: "dataset"; entry: { key: string } }
    | { kind: "row"; row: { origin_key: string | null; id: string } },
): string {
  return resolved.kind === "dataset"
    ? resolved.entry.key
    : (resolved.row.origin_key ?? resolved.row.id);
}
