import type { Env } from "../env";
import { getDb } from "../db/client";
import type { AtlasEntryView } from "../../src/atlas/types";
import type { StoredClaim } from "../generation/claims";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "../generation/gap-fill";
import type { AtlasJobProvenance } from "./makeCardsSource";
import { buildAtlasPrecraftDrafts } from "./precraftDrafts";
import { datasetByKey } from "./entry-helpers";
import { toEntryView, viewFromOverlay, type OverlayRow } from "./merge";

export class AtlasPrecraftReseedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasPrecraftReseedError";
  }
}

/** Locked stub material when make-cards has no extras (Task 5). */
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

/** Read optional `hasExtras` from job JSON (provenance or progress). */
export function parseAtlasHasExtrasFlag(
  ...raws: Array<string | null | undefined>
): boolean | null {
  for (const raw of raws) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { hasExtras?: unknown }).hasExtras === "boolean"
      ) {
        return (parsed as { hasExtras: boolean }).hasExtras;
      }
    } catch {
      // ignore malformed sidecar JSON
    }
  }
  return null;
}

/**
 * Prefer an explicit prepare flag; else material ≠ locked stub.
 * Unknown material with no flag → assume extras (continue LLM).
 */
export function atlasJobHasExtras(args: {
  hasExtrasFlag?: boolean | null;
  materialText?: string | null;
  canonicalName?: string | null;
}): boolean {
  if (typeof args.hasExtrasFlag === "boolean") return args.hasExtrasFlag;
  const name = args.canonicalName?.trim();
  if (name && args.materialText != null) {
    return !isAtlasLockedStubMaterial(args.materialText, name);
  }
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

export async function reseedAtlasPrecraftForJob(
  env: Env,
  args: {
    jobId: string;
    deckId: string;
    atlasEntryId: string;
    citations: string[];
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

  const claims: StoredClaim[] = built.claims.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
  }));
  const drafts = attachClaimIdsToDrafts(built.drafts, claims);
  const atlasProvenance: AtlasJobProvenance = {
    atlasEntryId: args.atlasEntryId,
    citations: args.citations,
  };

  if (drafts.length > 0) {
    await insertDraftCards(db, {
      deckId: args.deckId,
      jobId: args.jobId,
      drafts,
      claims,
      atlasProvenance,
    });
  }

  return {
    canonicalName: entry.canonicalName,
    draftCount: drafts.length,
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
    atlasProvenanceJson?: string | null;
    progressJson?: string | null;
  },
): Promise<"continue" | "stub_only"> {
  const seeded = await reseedAtlasPrecraftForJob(env, {
    jobId: args.jobId,
    deckId: args.deckId,
    atlasEntryId: args.atlasProvenance.atlasEntryId,
    citations: args.atlasProvenance.citations,
  });

  const hasExtrasFlag = parseAtlasHasExtrasFlag(
    args.atlasProvenanceJson,
    args.progressJson,
  );
  const hasExtras = atlasJobHasExtras({
    hasExtrasFlag,
    materialText: args.materialText,
    canonicalName: seeded.canonicalName,
  });
  return hasExtras ? "continue" : "stub_only";
}
