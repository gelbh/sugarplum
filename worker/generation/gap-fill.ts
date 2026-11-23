import type { Env } from "../env";
import { buildCoverageLedger } from "./coverage";
import { filterDraftsByQuality } from "./quality";
import {
  accumulateTokenUsage,
  readFreeGenSlots,
  touchJobHeartbeat,
  withAddedTokenUsage,
  withFreeGenSlots,
  type JobProgressEmit,
  type TokenUsageAcc,
  type TokenUsageDelta,
} from "./progress";
import { consumeFreeGenSlot, isFreeGenCapError } from "./quota";
import type { AtlasJobProvenance } from "../atlas/makeCardsSource";
import {
  matchClaimIdForDraft,
  type StoredClaim,
} from "./claims";
import { cardContentFingerprint } from "../cards/contentFingerprint";
import { assertValidMcqOptions, type CardDraft } from "./schema";
import { filterNovelDrafts } from "./study-windows";
import { mergeTopicHints, MAX_TOPIC_HINT_CHARS } from "./topic-hints";

function newId(): string {
  return crypto.randomUUID();
}

export type DraftInsert = CardDraft & {
  mediaR2Keys?: string[] | null;
  claimId?: string | null;
};

/** Persist extracted claims for a job (orphans included). */
export async function insertStudyClaims(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    claims: StoredClaim[];
  },
): Promise<void> {
  if (args.claims.length === 0) return;
  const now = new Date().toISOString();
  for (const claim of args.claims) {
    await db
      .prepare(
        `INSERT INTO study_claims (
          id, job_id, deck_id, subject, predicate, source_span,
          object, qualifiers_json, pages_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        claim.id,
        args.jobId,
        args.deckId,
        claim.subject,
        claim.predicate,
        claim.source_span,
        claim.object ?? null,
        claim.qualifiers ? JSON.stringify(claim.qualifiers) : null,
        claim.pages ? JSON.stringify(claim.pages) : null,
        now,
      )
      .run();
  }
}

/** Attach claimId on drafts by provenance.excerpt ↔ source_span. */
export function attachClaimIdsToDrafts(
  drafts: CardDraft[],
  claims: StoredClaim[],
): DraftInsert[] {
  if (claims.length === 0) {
    return drafts.map((d) => ({ ...d, claimId: null }));
  }
  return drafts.map((draft) => ({
    ...draft,
    claimId: matchClaimIdForDraft(claims, draft.provenance.excerpt),
  }));
}

export function withAtlasProvenance<T extends CardDraft & { mediaR2Keys?: string[] | null }>(
  drafts: T[],
  atlas: AtlasJobProvenance | null,
): T[] {
  if (!atlas) return drafts;
  return drafts.map((draft) => ({
    ...draft,
    provenance: {
      pages: draft.provenance.pages,
      excerpt: draft.provenance.excerpt,
      atlasEntryId: atlas.atlasEntryId,
      citations: atlas.citations,
    },
  }));
}

/** Insert draft rows. Shared by the first pass and the gap-fill pass. */
export async function insertDraftCards(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    drafts: DraftInsert[];
    atlasProvenance?: AtlasJobProvenance | null;
    claims?: StoredClaim[];
  },
): Promise<string[]> {
  if (args.claims && args.claims.length > 0) {
    await insertStudyClaims(db, {
      deckId: args.deckId,
      jobId: args.jobId,
      claims: args.claims,
    });
  }
  const now = new Date().toISOString();
  const drafts = withAtlasProvenance(args.drafts, args.atlasProvenance ?? null);
  const ids: string[] = [];
  for (const draft of drafts) {
    const mediaJson =
      draft.mediaR2Keys && draft.mediaR2Keys.length > 0
        ? JSON.stringify(draft.mediaR2Keys)
        : null;
    const id = newId();
    const claimId =
      "claimId" in draft && draft.claimId != null && draft.claimId !== ""
        ? draft.claimId
        : null;
    const mcq =
      draft.type === "mcq"
        ? assertValidMcqOptions(draft.back, draft.options)
        : null;
    const backJson = mcq
      ? JSON.stringify({ answer: mcq.back, options: mcq.options })
      : JSON.stringify(draft.back);
    const contentFp = await cardContentFingerprint({
      type: draft.type,
      front: draft.front,
      mediaR2Keys: draft.mediaR2Keys ?? null,
      back: mcq ? mcq.back : draft.back,
      options: mcq ? mcq.options : null,
    });
    try {
      await db
        .prepare(
          `INSERT INTO cards (
            id, deck_id, job_id, type, front_json, back_json,
            media_r2_keys_json, provenance_json, status, created_at, updated_at,
            claim_id, content_fp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          args.deckId,
          args.jobId,
          draft.type,
          JSON.stringify(draft.front),
          backJson,
          mediaJson,
          JSON.stringify(draft.provenance),
          "draft",
          now,
          now,
          claimId,
          contentFp,
        )
        .run();
      ids.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/UNIQUE|unique|constraint/i.test(message)) continue;
      throw err;
    }
  }
  return ids;
}

const ENRICH_LABEL = "Filling coverage gaps";

type GapFillPipeline = (args: {
  topicHints: string[];
  avoidFronts: string[];
  onUsage: (usage: TokenUsageDelta) => void;
  heartbeat: () => Promise<void>;
  emit?: JobProgressEmit;
}) => Promise<CardDraft[]>;

/** Keep banner/`stage === enrich` while the follow-up pipeline reports band stages. */
function scopeEmitToEnrich(inner: JobProgressEmit): JobProgressEmit {
  return {
    emit: async () => {
      await inner.emit("enrich", 0, 1, ENRICH_LABEL);
    },
    addEvent: (kind, _stage, text) => inner.addEvent(kind, "enrich", text),
    addUsage: (usage) => inner.addUsage(usage),
    addDrafts: (n) => inner.addDrafts(n),
    setPath: (p) => inner.setPath(p),
    setPresentStages: (stages) => inner.setPresentStages(stages),
    noteFreeGenCharged: () => inner.noteFreeGenCharged(),
    noteFreeGenSlots: (slots) => inner.noteFreeGenSlots(slots),
  };
}

export function stringFronts(drafts: CardDraft[]): string[] {
  const out: string[] = [];
  for (const draft of drafts) {
    if (typeof draft.front === "string" && draft.front.trim()) {
      out.push(draft.front.trim());
    }
  }
  return out;
}

/** Existing job hints, then every ledger gap. No 5-hint cap. */
export function gapFillTopicHints(
  existing: string[],
  gaps: string[],
): string[] {
  const extra = gaps
    .map((gap) => gap.trim().slice(0, MAX_TOPIC_HINT_CHARS))
    .filter(Boolean);
  return mergeTopicHints(existing, extra, Number.POSITIVE_INFINITY);
}

/**
 * One follow-up generate on leftover coverage lines. Never a third pass.
 * A failed follow-up keeps the drafts already saved.
 */
export async function appendGapFillDrafts(args: {
  env: Env;
  db: D1Database;
  deckId: string;
  jobId: string;
  userId: string;
  secret: string | null;
  topicHints: string[];
  deckFronts: string[];
  coverageMaterial: string;
  drafts: CardDraft[];
  autoFollowup: boolean;
  runPipeline: GapFillPipeline;
  atlasProvenance?: AtlasJobProvenance | null;
  /** Build emit after slot reserve so free_gen_slots seed matches DB. */
  createEmit?: () => Promise<JobProgressEmit>;
}): Promise<CardDraft[]> {
  if (
    !args.autoFollowup ||
    !args.coverageMaterial.trim() ||
    args.drafts.length === 0
  ) {
    return args.drafts;
  }

  const emitEnrichDone = async (emit: JobProgressEmit | undefined) => {
    if (!emit) return;
    await emit.emit("enrich", 1, 1, ENRICH_LABEL);
  };

  const emitEnrichSkip = async () => {
    if (!args.createEmit) return;
    const emit = await args.createEmit();
    await emit.emit("enrich", 0, 1, ENRICH_LABEL);
    await emit.emit("enrich", 1, 1, ENRICH_LABEL);
  };

  const gaps = buildCoverageLedger(args.coverageMaterial, args.drafts).gaps;
  if (gaps.length === 0) {
    await emitEnrichSkip();
    return args.drafts;
  }

  if (!args.secret && !(await reserveFollowupSlot(args))) {
    await emitEnrichSkip();
    return args.drafts;
  }

  const emit = args.createEmit ? await args.createEmit() : undefined;
  if (emit) {
    const row = await args.db
      .prepare("SELECT progress_json FROM generation_jobs WHERE id = ?")
      .bind(args.jobId)
      .first<{ progress_json: string | null }>();
    emit.noteFreeGenSlots(readFreeGenSlots(row?.progress_json));
    await emit.emit("enrich", 0, 1, ENRICH_LABEL);
  }

  const usage: TokenUsageAcc = {};
  let novel: CardDraft[] = [];
  try {
    const second = await args.runPipeline({
      topicHints: gapFillTopicHints(args.topicHints, gaps),
      avoidFronts: [...args.deckFronts, ...stringFronts(args.drafts)],
      onUsage: (delta) => accumulateTokenUsage(usage, delta),
      heartbeat: () => touchJobHeartbeat(args.db, args.jobId),
      emit: emit ? scopeEmitToEnrich(emit) : undefined,
    });
    const knownFronts = [...args.deckFronts, ...stringFronts(args.drafts)];
    novel = filterNovelDrafts(filterDraftsByQuality(second), knownFronts);
    if (novel.length > 0) {
      await insertDraftCards(args.db, {
        deckId: args.deckId,
        jobId: args.jobId,
        drafts: novel,
        atlasProvenance: args.atlasProvenance ?? null,
      });
    }
  } catch (err) {
    console.error("gap-fill failed", args.jobId, err);
    await emitEnrichDone(emit);
    return args.drafts;
  }

  if (usage.tokens_used !== undefined) {
    if (emit) {
      emit.addUsage({
        prompt_tokens: usage.tokens_prompt,
        completion_tokens: usage.tokens_completion,
        total_tokens: usage.tokens_used,
      });
    } else {
      try {
        const row = await args.db
          .prepare("SELECT progress_json FROM generation_jobs WHERE id = ?")
          .bind(args.jobId)
          .first<{ progress_json: string | null }>();
        await args.db
          .prepare("UPDATE generation_jobs SET progress_json = ? WHERE id = ?")
          .bind(
            withAddedTokenUsage(row?.progress_json, {
              prompt_tokens: usage.tokens_prompt,
              completion_tokens: usage.tokens_completion,
              total_tokens: usage.tokens_used,
            }),
            args.jobId,
          )
          .run();
      } catch (err) {
        console.error("gap-fill usage write failed", args.jobId, err);
      }
    }
  }

  await emitEnrichDone(emit);
  return novel.length > 0 ? [...args.drafts, ...novel] : args.drafts;
}

/** Reserve the second free slot. False means skip the model and keep pass 1. */
async function reserveFollowupSlot(args: {
  env: Env;
  db: D1Database;
  jobId: string;
  userId: string;
}): Promise<boolean> {
  try {
    const row = await args.db
      .prepare("SELECT progress_json FROM generation_jobs WHERE id = ?")
      .bind(args.jobId)
      .first<{ progress_json: string | null }>();
    const slots = readFreeGenSlots(row?.progress_json);
    if (slots >= 2) return true;
    await consumeFreeGenSlot(args.env, args.userId);
    await args.db
      .prepare("UPDATE generation_jobs SET progress_json = ? WHERE id = ?")
      .bind(withFreeGenSlots(row?.progress_json, slots + 1), args.jobId)
      .run();
    return true;
  } catch (err) {
    if (!isFreeGenCapError(err)) {
      console.error("gap-fill charge failed", args.jobId, err);
    }
    return false;
  }
}
