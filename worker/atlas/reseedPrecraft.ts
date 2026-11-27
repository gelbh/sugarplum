import type { Env } from "../env";
import { getDb } from "../db/client";
import type { AtlasEntryView } from "../../src/atlas/types";
import type { StudyClaim } from "../generation/claims";
import type { CardDraft } from "../generation/schema";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "../generation/gap-fill";
import {
  parseAtlasJobProvenance,
  type AtlasJobProvenance,
} from "./makeCardsSource";
import { buildAtlasPrecraftDrafts } from "./precraftDrafts";
import { datasetByKey } from "./entry-helpers";
import { toEntryView, viewFromOverlay, type OverlayRow } from "./merge";

export class AtlasPrecraftReseedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasPrecraftReseedError";
  }
}

/** Locked stub material when make-cards has no extras. */
export function atlasLockedStubMaterial(canonicalName: string): string {
  return `Parasite: ${canonicalName}\n`;
}

export function isAtlasLockedStubMaterial(
  text: string,
  canonicalName: string,
): boolean {
  const locked = atlasLockedStubMaterial(canonicalName);
  return text === locked || text === `Parasite: ${canonicalName}`;
}

/** Pre-migration paste from `buildAtlasMakeCardsSource` (full field dump). */
export function isAtlasFullDumpMaterial(text: string): boolean {
  return (
    /Major organ:/i.test(text) ||
    text.includes(
      "Generate study cards covering hosts/family (MCQ), lifecycle order (cloze)",
    )
  );
}

/**
 * Prefer typed `hasExtras` on provenance. Without the flag: locked stub or
 * full dump → no LLM; extras-shaped leftover paste → continue.
 */
export function atlasJobHasExtras(args: {
  hasExtrasFlag?: boolean | null;
  materialText?: string | null;
  canonicalName?: string | null;
}): boolean {
  if (typeof args.hasExtrasFlag === "boolean") return args.hasExtrasFlag;
  const name = args.canonicalName?.trim();
  if (!name || args.materialText == null) return false;
  if (isAtlasLockedStubMaterial(args.materialText, name)) return false;
  if (isAtlasFullDumpMaterial(args.materialText)) return false;
  return true;
}

type OverlayLookupRow = OverlayRow;

/** Resolve merged entry for reseed: deck owner's overlay, else bundled dataset. */
export async function resolveMergedAtlasEntryForReseed(
  db: D1Database,
  args: { deckId: string; atlasEntryId: string },
): Promise<AtlasEntryView | null> {
  const entryId = args.atlasEntryId.trim();
  if (!entryId) return null;

  const row = await db
    .prepare(
      `SELECT e.id, e.origin_key, e.origin_version, e.canonical_name, e.common_name,
              e.fields_json, e.edited_at, e.deleted_at, e.field_overrides_json, e.aliases_json
       FROM atlas_entries e
       INNER JOIN atlases a ON a.id = e.atlas_id
       INNER JOIN decks d ON d.user_id = a.user_id
       WHERE d.id = ?
         AND e.deleted_at IS NULL
         AND (e.origin_key = ? OR e.id = ?)
       LIMIT 1`,
    )
    .bind(args.deckId, entryId, entryId)
    .first<OverlayLookupRow>();

  if (row) {
    const baseKey = row.origin_key ?? entryId;
    const base = datasetByKey().get(baseKey) ?? null;
    if (row.origin_key === null && !base) {
      return viewFromOverlay(row, null);
    }
    return viewFromOverlay(row, base);
  }

  const dataset = datasetByKey().get(entryId);
  if (dataset) return toEntryView(dataset);
  return null;
}

/** Shared precraft write: UUID claims → attach → insertDraftCards. */
export async function insertPrecraftDrafts(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    claims: StudyClaim[];
    drafts: CardDraft[];
    atlasProvenance: AtlasJobProvenance;
  },
): Promise<number> {
  if (args.drafts.length === 0 && args.claims.length === 0) return 0;
  const claims = args.claims.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
  }));
  const drafts = attachClaimIdsToDrafts(args.drafts, claims);
  await insertDraftCards(db, {
    deckId: args.deckId,
    jobId: args.jobId,
    drafts,
    claims,
    atlasProvenance: args.atlasProvenance,
  });
  return drafts.length;
}

export async function reseedAtlasPrecraftForJob(
  env: Env,
  args: {
    jobId: string;
    deckId: string;
    atlasEntryId: string;
    citations: string[];
    hasExtras?: boolean;
  },
): Promise<{ canonicalName: string; draftCount: number }> {
  const db = getDb(env);
  const entry = await resolveMergedAtlasEntryForReseed(db, {
    deckId: args.deckId,
    atlasEntryId: args.atlasEntryId,
  });
  if (!entry) {
    throw new AtlasPrecraftReseedError(
      `Atlas entry not found for reseed: ${args.atlasEntryId}`,
    );
  }

  const entryKey = entry.originKey ?? entry.id;
  const built = buildAtlasPrecraftDrafts({
    entryKey,
    canonicalName: entry.canonicalName,
    commonName: entry.commonName,
    aliases: entry.aliases,
    fields: entry.fields,
  });

  const atlasProvenance: AtlasJobProvenance = {
    atlasEntryId: args.atlasEntryId,
    citations: args.citations,
    ...(typeof args.hasExtras === "boolean"
      ? { hasExtras: args.hasExtras }
      : {}),
  };

  const draftCount = await insertPrecraftDrafts(db, {
    deckId: args.deckId,
    jobId: args.jobId,
    claims: built.claims,
    drafts: built.drafts,
    atlasProvenance,
  });

  return {
    canonicalName: entry.canonicalName,
    draftCount,
  };
}

/**
 * After study_claims/cards wipe on an atlas job: re-seed precraft, then say
 * whether LLM extract should continue (`continue`) or the job is stub-only.
 */
export async function reseedAtlasAfterWipe(
  env: Env,
  args: {
    jobId: string;
    deckId: string;
    atlasProvenance: AtlasJobProvenance;
    materialText?: string | null;
  },
): Promise<"continue" | "stub_only"> {
  const seeded = await reseedAtlasPrecraftForJob(env, {
    jobId: args.jobId,
    deckId: args.deckId,
    atlasEntryId: args.atlasProvenance.atlasEntryId,
    citations: args.atlasProvenance.citations,
    hasExtras: args.atlasProvenance.hasExtras,
  });

  const hasExtras = atlasJobHasExtras({
    hasExtrasFlag:
      typeof args.atlasProvenance.hasExtras === "boolean"
        ? args.atlasProvenance.hasExtras
        : null,
    materialText: args.materialText,
    canonicalName: seeded.canonicalName,
  });
  return hasExtras ? "continue" : "stub_only";
}

/**
 * Own wipe→reseed for reclaim/regen: fetch paste text, reseed, decide LLM.
 * Returns null when the job is not atlas-provenanced.
 */
export async function ensureAtlasPrecraftAfterWipe(
  env: Env,
  args: {
    jobId: string;
    deckId: string;
    atlasProvenanceJson: string | null | undefined;
    materialKind?: string | null;
    materialR2Key?: string | null;
  },
): Promise<"continue" | "stub_only" | null> {
  const atlasProvenance = parseAtlasJobProvenance(args.atlasProvenanceJson);
  if (!atlasProvenance) return null;

  let materialText: string | null = null;
  if (args.materialKind === "paste" && args.materialR2Key) {
    const obj = await env.MATERIALS.get(args.materialR2Key);
    materialText = obj ? await obj.text() : null;
  }

  return reseedAtlasAfterWipe(env, {
    jobId: args.jobId,
    deckId: args.deckId,
    atlasProvenance,
    materialText,
  });
}
