import type { Env } from "../env";
import { getDb } from "../db/client";
import type { AtlasEntryView } from "../../src/atlas/types";
import type { StudyClaim } from "../generation/claims";
import type { CardDraft } from "../generation/schema";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "../generation/gap-fill";
import { parseTopicHintsJson } from "../generation/topic-hints";
import {
  buildAtlasMakeCardsExtrasSource,
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
 * Prefer typed `hasExtras` on provenance. Without the flag: locked stub → no
 * LLM; full dump and extras-shaped leftover paste → continue (LLM leftovers).
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
  return true;
}

type OverlayLookupRow = OverlayRow;

function avoidPatternStem(pattern: string): string {
  return pattern
    .replace(/\s*\(reason:\s*[^)]+\)\s*$/i, "")
    .trim()
    .toLowerCase();
}

export function precraftFrontMatchesAvoid(
  front: string,
  avoidPatterns: readonly string[],
): boolean {
  const frontKey = front.trim().toLowerCase();
  if (!frontKey || avoidPatterns.length === 0) return false;
  for (const pattern of avoidPatterns) {
    const stem = avoidPatternStem(pattern);
    if (!stem) continue;
    if (
      frontKey === stem ||
      frontKey.startsWith(stem) ||
      stem.startsWith(frontKey)
    ) {
      return true;
    }
  }
  return false;
}

function filterPrecraftByAvoidPatterns(
  claims: StudyClaim[],
  drafts: CardDraft[],
  avoidPatterns: readonly string[],
): { claims: StudyClaim[]; drafts: CardDraft[] } {
  if (avoidPatterns.length === 0) return { claims, drafts };
  const nextClaims: StudyClaim[] = [];
  const nextDrafts: CardDraft[] = [];
  const n = Math.min(claims.length, drafts.length);
  for (let i = 0; i < n; i++) {
    const draft = drafts[i]!;
    const front = typeof draft.front === "string" ? draft.front : "";
    if (precraftFrontMatchesAvoid(front, avoidPatterns)) continue;
    nextClaims.push(claims[i]!);
    nextDrafts.push(draft);
  }
  for (let i = n; i < drafts.length; i++) {
    const draft = drafts[i]!;
    const front = typeof draft.front === "string" ? draft.front : "";
    if (precraftFrontMatchesAvoid(front, avoidPatterns)) continue;
    nextDrafts.push(draft);
  }
  return { claims: nextClaims, drafts: nextDrafts };
}

export async function resolveMergedAtlasEntryForReseed(
  db: D1Database,
  args: { deckId: string; atlasEntryId: string; atlasId?: string | null },
): Promise<AtlasEntryView | null> {
  const entryId = args.atlasEntryId.trim();
  if (!entryId) return null;

  const atlasId = args.atlasId?.trim() || null;
  const row = atlasId
    ? await db
        .prepare(
          `SELECT e.id, e.origin_key, e.origin_version, e.canonical_name, e.common_name,
                  e.fields_json, e.edited_at, e.deleted_at, e.field_overrides_json, e.aliases_json
           FROM atlas_entries e
           WHERE e.atlas_id = ?
             AND (e.origin_key = ? OR e.id = ?)
           LIMIT 1`,
        )
        .bind(atlasId, entryId, entryId)
        .first<OverlayLookupRow>()
    : await db
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
    if (row.deleted_at) {
      throw new AtlasPrecraftReseedError(
        `Atlas entry soft-deleted; cannot reseed: ${entryId}`,
      );
    }
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

export async function insertPrecraftDrafts(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    claims: StudyClaim[];
    drafts: CardDraft[];
    atlasProvenance: AtlasJobProvenance;
    avoidPatterns?: readonly string[];
  },
): Promise<number> {
  const filtered = filterPrecraftByAvoidPatterns(
    args.claims,
    args.drafts,
    args.avoidPatterns ?? [],
  );
  if (filtered.drafts.length === 0 && filtered.claims.length === 0) return 0;
  const claims = filtered.claims.map((c) => ({
    ...c,
    id: crypto.randomUUID(),
  }));
  const drafts = attachClaimIdsToDrafts(filtered.drafts, claims);
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
    atlasId?: string;
    avoidPatterns?: readonly string[];
  },
): Promise<{
  canonicalName: string;
  draftCount: number;
  entry: AtlasEntryView;
  coveredFieldKeys: string[];
}> {
  const db = getDb(env);
  const entry = await resolveMergedAtlasEntryForReseed(db, {
    deckId: args.deckId,
    atlasEntryId: args.atlasEntryId,
    atlasId: args.atlasId,
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
    ...(args.atlasId ? { atlasId: args.atlasId } : {}),
  };

  const draftCount = await insertPrecraftDrafts(db, {
    deckId: args.deckId,
    jobId: args.jobId,
    claims: built.claims,
    drafts: built.drafts,
    atlasProvenance,
    avoidPatterns: args.avoidPatterns,
  });

  return {
    canonicalName: entry.canonicalName,
    draftCount,
    entry,
    coveredFieldKeys: built.coveredFieldKeys,
  };
}

/**
 * After study_claims/cards wipe on an atlas job: re-seed precraft, then say
 * whether LLM extract should continue (`continue`) or the job is stub-only.
 * Pre-migration full dumps continue with extras-only R2 text (not the dump).
 */
export async function reseedAtlasAfterWipe(
  env: Env,
  args: {
    jobId: string;
    deckId: string;
    atlasProvenance: AtlasJobProvenance;
    materialText?: string | null;
    materialR2Key?: string | null;
    avoidPatterns?: readonly string[];
  },
): Promise<"continue" | "stub_only"> {
  const seeded = await reseedAtlasPrecraftForJob(env, {
    jobId: args.jobId,
    deckId: args.deckId,
    atlasEntryId: args.atlasProvenance.atlasEntryId,
    citations: args.atlasProvenance.citations,
    hasExtras: args.atlasProvenance.hasExtras,
    atlasId: args.atlasProvenance.atlasId,
    avoidPatterns: args.avoidPatterns,
  });

  const hasExtrasFlag =
    typeof args.atlasProvenance.hasExtras === "boolean"
      ? args.atlasProvenance.hasExtras
      : null;

  if (hasExtrasFlag === false) return "stub_only";
  if (hasExtrasFlag === true) return "continue";

  const materialText = args.materialText ?? null;
  if (
    materialText != null &&
    isAtlasLockedStubMaterial(materialText, seeded.canonicalName)
  ) {
    return "stub_only";
  }

  if (materialText != null && isAtlasFullDumpMaterial(materialText)) {
    const entryKey = seeded.entry.originKey ?? seeded.entry.id;
    const extras = buildAtlasMakeCardsExtrasSource({
      entryKey,
      canonicalName: seeded.entry.canonicalName,
      commonName: seeded.entry.commonName,
      aliases: seeded.entry.aliases,
      fields: seeded.entry.fields,
      refs: seeded.entry.refs,
      coveredFieldKeys: seeded.coveredFieldKeys,
    });
    if (!extras.text.trim()) return "stub_only";
    if (args.materialR2Key) {
      await env.MATERIALS.put(args.materialR2Key, extras.text, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
    }
    return "continue";
  }

  return atlasJobHasExtras({
    hasExtrasFlag: null,
    materialText,
    canonicalName: seeded.canonicalName,
  })
    ? "continue"
    : "stub_only";
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

  const db = getDb(env);
  const avoidRow = await db
    .prepare("SELECT avoid_patterns_json FROM generation_jobs WHERE id = ?")
    .bind(args.jobId)
    .first<{ avoid_patterns_json: string | null }>();
  const avoidPatterns = parseTopicHintsJson(avoidRow?.avoid_patterns_json);

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
    materialR2Key: args.materialR2Key,
    avoidPatterns,
  });
}
