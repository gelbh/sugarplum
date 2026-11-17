import { HTTPException } from "hono/http-exception";
import type { AtlasEntryView } from "../../src/atlas/types";
import { normalizeTopicHints } from "../generation/topic-hints";
import { MAX_PASTE_BYTES } from "../materials/limits";
import { buildAtlasMakeCardsSource } from "./makeCardsSource";

export const MAX_MAKE_CARDS_ENTRIES = 8;

export type MakeCardsBody = {
  deckId: string;
  entryKeys: string[];
};

export type PreparedMakeCardsItem = {
  entryKey: string;
  text: string;
  citations: string[];
  topicHints: string[];
};

export function parseMakeCardsBody(body: {
  deckId?: unknown;
  entryKeys?: unknown;
}): MakeCardsBody {
  const deckId = typeof body.deckId === "string" ? body.deckId.trim() : "";
  if (!deckId) throw new HTTPException(400, { message: "deckId required" });

  const rawKeys = Array.isArray(body.entryKeys) ? body.entryKeys : [];
  const entryKeys = [
    ...new Set(
      rawKeys
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
  if (entryKeys.length === 0) {
    throw new HTTPException(400, { message: "entryKeys required" });
  }
  if (entryKeys.length > MAX_MAKE_CARDS_ENTRIES) {
    throw new HTTPException(400, {
      message: `At most ${MAX_MAKE_CARDS_ENTRIES} entries per request`,
    });
  }

  return { deckId, entryKeys };
}

/** Resolve + validate every entry before any R2/D1/queue write (no partial queue). */
export function prepareMakeCardsItems(
  entries: AtlasEntryView[],
  entryKeys: string[],
): PreparedMakeCardsItem[] {
  const prepared: PreparedMakeCardsItem[] = [];
  for (const key of entryKeys) {
    const hit =
      entries.find((e) => e.id === key) ??
      entries.find((e) => e.originKey === key) ??
      null;
    if (!hit) {
      throw new HTTPException(404, { message: `Entry not found: ${key}` });
    }
    const entryKey = hit.originKey ?? hit.id;
    const source = buildAtlasMakeCardsSource({
      entryKey,
      canonicalName: hit.canonicalName,
      commonName: hit.commonName,
      aliases: hit.aliases,
      fields: hit.fields,
      refs: hit.refs,
    });
    const textBytes = new TextEncoder().encode(source.text).byteLength;
    if (textBytes > MAX_PASTE_BYTES) {
      throw new HTTPException(400, {
        message: `Atlas source for ${hit.canonicalName} exceeds paste size`,
      });
    }
    let topicHints: string[];
    try {
      topicHints = normalizeTopicHints(source.topicHints) ?? [];
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid topicHints",
      });
    }
    prepared.push({
      entryKey,
      text: source.text,
      citations: source.citations,
      topicHints,
    });
  }
  return prepared;
}
