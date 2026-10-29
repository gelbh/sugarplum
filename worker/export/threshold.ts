import type { Env } from "../env";

export const EXPORT_SYNC_MAX_CARDS = 200;
export const EXPORT_SYNC_MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const EXPORT_SYNC_MAX_DECKS = 10;
export const EXPORT_UNKNOWN_MEDIA_BYTES = 1024 * 1024;

export type ExportWorkload = {
  deckCount: number;
  cardCount: number;
  mediaBytes: number;
};

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Cheap pre-build estimate: accepted card count + R2 head sizes. No get/buildApkg. */
export async function estimateExportWorkload(
  env: Env,
  userId: string,
  deckIds: string[],
): Promise<ExportWorkload> {
  const ownedIds: string[] = [];
  for (const deckId of deckIds) {
    const owned = await env.DB.prepare(
      "SELECT id FROM decks WHERE id = ? AND user_id = ?",
    )
      .bind(deckId, userId)
      .first<{ id: string }>();
    if (owned) ownedIds.push(owned.id);
  }

  let cardCount = 0;
  let mediaBytes = 0;
  const seenKeys = new Set<string>();

  for (const deckId of ownedIds) {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM cards WHERE deck_id = ? AND status = ?",
    )
      .bind(deckId, "accepted")
      .first<{ count: number }>();
    cardCount += Number(countRow?.count ?? 0);

    const { results } = await env.DB.prepare(
      `SELECT media_r2_keys_json FROM cards
       WHERE deck_id = ? AND status = ?`,
    )
      .bind(deckId, "accepted")
      .all<{ media_r2_keys_json: string | null }>();

    const deckMediaPrefix = `materials/${deckId}/`;
    for (const row of results ?? []) {
      if (!row.media_r2_keys_json) continue;
      const raw = parseJson(row.media_r2_keys_json);
      if (!Array.isArray(raw)) continue;
      for (const key of raw) {
        if (typeof key !== "string") continue;
        if (!key.startsWith(deckMediaPrefix)) continue;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const head = await env.MATERIALS.head(key);
        mediaBytes +=
          head?.size != null && head.size > 0
            ? head.size
            : EXPORT_UNKNOWN_MEDIA_BYTES;
      }
    }
  }

  return {
    deckCount: ownedIds.length,
    cardCount,
    mediaBytes,
  };
}

export function shouldEnqueueExport(w: ExportWorkload): boolean {
  return (
    w.deckCount > EXPORT_SYNC_MAX_DECKS ||
    w.cardCount > EXPORT_SYNC_MAX_CARDS ||
    w.mediaBytes > EXPORT_SYNC_MAX_MEDIA_BYTES
  );
}
