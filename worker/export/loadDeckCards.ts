import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { cardToAnkiNotes, type AnkiNoteSpec } from "./notes";
import { mapScheduleToAnki, type AnkiFsrsFields } from "./fsrsMap";
import { ankiDeckName } from "./deckNames";

type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_id: string | null;
};

type CardRow = {
  id: string;
  type: string;
  front_json: string;
  back_json: string;
  media_r2_keys_json: string | null;
  due: string | null;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number | null;
  scheduled_days: number | null;
  reps: number | null;
  lapses: number | null;
  state: number | null;
  last_review: string | null;
};

export type LoadedDeck = {
  deckName: string;
  entries: Array<{
    note: AnkiNoteSpec;
    schedule: AnkiFsrsFields | null;
    media: Array<{ name: string; data: Uint8Array }>;
  }>;
  warnings: { missingMedia: number; skippedCards: number };
};

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function mediaName(key: string): string {
  return encodeURIComponent(key);
}

function occlusionImageKey(front: unknown): string | null {
  if (typeof front !== "object" || front == null) return null;
  const key = (front as { image_key?: unknown }).image_key;
  return typeof key === "string" && key.trim() ? key : null;
}

function hasSchedule(row: CardRow): row is CardRow & {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
} {
  return (
    row.due != null &&
    row.stability != null &&
    row.difficulty != null &&
    row.elapsed_days != null &&
    row.scheduled_days != null &&
    row.reps != null &&
    row.lapses != null &&
    row.state != null
  );
}

export async function loadDeckCards(
  env: Env,
  userId: string,
  deckId: string,
): Promise<LoadedDeck> {
  const deck = await env.DB.prepare(
    `SELECT id, user_id, title, subject_id
     FROM decks WHERE id = ? AND user_id = ?`,
  )
    .bind(deckId, userId)
    .first<DeckRow>();
  if (!deck) throw new HTTPException(404, { message: "Deck not found" });

  const subject = deck.subject_id
    ? await env.DB.prepare(
        "SELECT title FROM subjects WHERE id = ? AND user_id = ?",
      )
        .bind(deck.subject_id, userId)
        .first<{ title: string }>()
    : null;

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.type, c.front_json, c.back_json, c.media_r2_keys_json,
            s.due, s.stability, s.difficulty, s.elapsed_days,
            s.scheduled_days, s.reps, s.lapses, s.state, s.last_review
     FROM cards c
     LEFT JOIN card_schedules s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.status = ?
     ORDER BY c.created_at ASC`,
  )
    .bind(deckId, "accepted")
    .all<CardRow>();

  const entries: LoadedDeck["entries"] = [];
  const warnings = { missingMedia: 0, skippedCards: 0 };
  for (const row of results ?? []) {
    const front = parseJson(row.front_json);
    const back = parseJson(row.back_json);
    const notes = cardToAnkiNotes({
      type: row.type,
      front,
      back:
        row.type === "mcq" && typeof back === "object" && back !== null
          ? (back as { answer?: unknown }).answer
          : back,
      options:
        row.type === "mcq" && typeof back === "object" && back !== null
          ? ((back as { options?: unknown }).options as string[] | undefined)
          : undefined,
    });
    if ("skip" in notes) {
      warnings.skippedCards += 1;
      continue;
    }

    const mediaKeys = new Set<string>();
    const rawMedia = row.media_r2_keys_json
      ? parseJson(row.media_r2_keys_json)
      : [];
    if (Array.isArray(rawMedia)) {
      for (const key of rawMedia) {
        if (typeof key === "string") mediaKeys.add(key);
      }
    }
    if (row.type === "occlusion") {
      const imageKey = occlusionImageKey(front);
      if (imageKey) mediaKeys.add(imageKey);
    }

    const media: Array<{ name: string; data: Uint8Array }> = [];
    const deckMediaPrefix = `materials/${deckId}/`;
    for (const key of mediaKeys) {
      if (!key.startsWith(deckMediaPrefix)) {
        warnings.missingMedia += 1;
        continue;
      }
      const object = await env.MATERIALS.get(key);
      if (!object) {
        warnings.missingMedia += 1;
        continue;
      }
      media.push({
        name: mediaName(key),
        data: new Uint8Array(await object.arrayBuffer()),
      });
    }

    if (row.type === "occlusion") {
      const imageKey = occlusionImageKey(front);
      const imageLoaded =
        imageKey != null &&
        media.some((item) => item.name === mediaName(imageKey));
      if (!imageLoaded) {
        warnings.skippedCards += 1;
        continue;
      }
    }

    const schedule = hasSchedule(row)
      ? mapScheduleToAnki({
          due: row.due,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsed_days: row.elapsed_days,
          scheduled_days: row.scheduled_days,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          last_review: row.last_review,
        })
      : null;

    for (const note of notes) {
      entries.push({
        note,
        schedule,
        media,
      });
    }
  }

  return {
    deckName: ankiDeckName(
      subject?.title ?? "Uncategorized",
      deck.title,
      deck.id,
    ),
    entries,
    warnings,
  };
}

export type LoadedExportCards = {
  entries: Array<LoadedDeck["entries"][number] & { deckName: string }>;
  warnings: LoadedDeck["warnings"];
};

/** Load accepted cards for many owned deck ids; concatenate entries; sum warnings. */
export async function loadExportCards(
  env: Env,
  userId: string,
  deckIds: string[],
): Promise<LoadedExportCards> {
  const warnings = { missingMedia: 0, skippedCards: 0 };
  const entries: LoadedExportCards["entries"] = [];
  for (const deckId of deckIds) {
    const loaded = await loadDeckCards(env, userId, deckId);
    warnings.missingMedia += loaded.warnings.missingMedia;
    warnings.skippedCards += loaded.warnings.skippedCards;
    for (const entry of loaded.entries) {
      entries.push({ ...entry, deckName: loaded.deckName });
    }
  }
  return { entries, warnings };
}
