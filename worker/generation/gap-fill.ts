import type { Env } from "../env";
import { buildCoverageLedger } from "./coverage";
import { filterDraftsByQuality } from "./quality";
import {
  accumulateTokenUsage,
  readFreeGenSlots,
  touchJobHeartbeat,
  withAddedTokenUsage,
  withFreeGenSlots,
  type TokenUsageAcc,
  type TokenUsageDelta,
} from "./progress";
import { consumeFreeGenSlot, isFreeGenCapError } from "./quota";
import type { AtlasJobProvenance } from "../atlas/makeCardsSource";
import { assertValidMcqOptions, type CardDraft } from "./schema";
import { filterNovelDrafts } from "./study-windows";
import { mergeTopicHints, MAX_TOPIC_HINT_CHARS } from "./topic-hints";

function newId(): string {
  return crypto.randomUUID();
}

export function withAtlasProvenance(
  drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>,
  atlas: AtlasJobProvenance | null,
): Array<CardDraft & { mediaR2Keys?: string[] | null }> {
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
    drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;
    atlasProvenance?: AtlasJobProvenance | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const drafts = withAtlasProvenance(args.drafts, args.atlasProvenance ?? null);
  for (const draft of drafts) {
    const mediaJson =
      draft.mediaR2Keys && draft.mediaR2Keys.length > 0
        ? JSON.stringify(draft.mediaR2Keys)
        : null;
    const id = newId();
    const backJson =
      draft.type === "mcq"
        ? (() => {
            const mcq = assertValidMcqOptions(draft.back, draft.options);
            return JSON.stringify({
              answer: mcq.back,
              options: mcq.options,
            });
          })()
        : JSON.stringify(draft.back);
    await db
      .prepare(
        `INSERT INTO cards (
          id, deck_id, job_id, type, front_json, back_json,
          media_r2_keys_json, provenance_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      )
      .run();
  }
}

type GapFillPipeline = (args: {
  topicHints: string[];
  avoidFronts: string[];
  onUsage: (usage: TokenUsageDelta) => void;
  heartbeat: () => Promise<void>;
}) => Promise<CardDraft[]>;

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
}): Promise<CardDraft[]> {
  if (
    !args.autoFollowup ||
    !args.coverageMaterial.trim() ||
    args.drafts.length === 0
  ) {
    return args.drafts;
  }
  const gaps = buildCoverageLedger(args.coverageMaterial, args.drafts).gaps;
  if (gaps.length === 0) return args.drafts;

  if (!args.secret && !(await reserveFollowupSlot(args))) return args.drafts;

  const usage: TokenUsageAcc = {};
  let novel: CardDraft[] = [];
  try {
    const second = await args.runPipeline({
      topicHints: gapFillTopicHints(args.topicHints, gaps),
      avoidFronts: [...args.deckFronts, ...stringFronts(args.drafts)],
      onUsage: (delta) => accumulateTokenUsage(usage, delta),
      heartbeat: () => touchJobHeartbeat(args.db, args.jobId),
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
    return args.drafts;
  }

  if (usage.tokens_used !== undefined) {
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
