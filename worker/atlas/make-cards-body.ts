import { HTTPException } from "hono/http-exception";
import type { AtlasEntryView } from "../../src/atlas/types";
import type { StudyClaim } from "../generation/claims";
import type { CardDraft } from "../generation/schema";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "../generation/gap-fill";
import { normalizeTopicHints } from "../generation/topic-hints";
import { MAX_PASTE_BYTES } from "../materials/limits";
import { buildAtlasMakeCardsExtrasSource } from "./makeCardsSource";
import { buildAtlasPrecraftDrafts } from "./precraftDrafts";
import { atlasLockedStubMaterial } from "./reseedPrecraft";

export const MAX_MAKE_CARDS_ENTRIES = 8;

export type PreparedMakeCardsItem = {
  entryKey: string;
  text: string;
  citations: string[];
  topicHints: string[];
  hasExtras: boolean;
  canonicalName: string;
  claims: StudyClaim[];
  drafts: CardDraft[];
};

/** Parse deckId only so ownership can run before entryKeys validation. */
export function parseMakeCardsDeckId(body: { deckId?: unknown }): string {
  const deckId = typeof body.deckId === "string" ? body.deckId.trim() : "";
  if (!deckId) throw new HTTPException(400, { message: "deckId required" });
  return deckId;
}

export function parseMakeCardsEntryKeys(body: {
  entryKeys?: unknown;
}): string[] {
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
  return entryKeys;
}

/** Resolve + validate every entry before any R2/D1/queue write (no partial enqueue). */
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
    const precraft = buildAtlasPrecraftDrafts({
      entryKey,
      canonicalName: hit.canonicalName,
      commonName: hit.commonName,
      aliases: hit.aliases,
      fields: hit.fields,
    });
    const extras = buildAtlasMakeCardsExtrasSource({
      entryKey,
      canonicalName: hit.canonicalName,
      commonName: hit.commonName,
      aliases: hit.aliases,
      fields: hit.fields,
      refs: hit.refs,
      coveredFieldKeys: precraft.coveredFieldKeys,
    });
    const hasExtras = extras.text.trim().length > 0;
    const text = hasExtras
      ? extras.text
      : atlasLockedStubMaterial(hit.canonicalName);
    const textBytes = new TextEncoder().encode(text).byteLength;
    if (textBytes > MAX_PASTE_BYTES) {
      throw new HTTPException(400, {
        message: `Atlas source for ${hit.canonicalName} exceeds paste size`,
      });
    }
    let topicHints: string[];
    try {
      topicHints = normalizeTopicHints(extras.topicHints) ?? [];
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid topicHints",
      });
    }
    prepared.push({
      entryKey,
      text,
      citations: extras.citations,
      topicHints,
      hasExtras,
      canonicalName: hit.canonicalName,
      claims: precraft.claims,
      drafts: precraft.drafts,
    });
  }
  return prepared;
}

/** Insert precraft claims + drafts for a make-cards job. */
export async function seedMakeCardsPrecraft(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    item: PreparedMakeCardsItem;
  },
): Promise<void> {
  if (args.item.drafts.length === 0 && args.item.claims.length === 0) return;
  const claims = args.item.claims.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
  }));
  const drafts = attachClaimIdsToDrafts(args.item.drafts, claims);
  await insertDraftCards(db, {
    deckId: args.deckId,
    jobId: args.jobId,
    drafts,
    claims,
    atlasProvenance: {
      atlasEntryId: args.item.entryKey,
      citations: args.item.citations,
    },
  });
}
