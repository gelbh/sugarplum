import type { Env } from "../env";
import { getDb } from "../db/client";
import type { MaterialGenerateQueueMessage } from "./enqueue";
import { appendGapFillDrafts } from "./gap-fill";
import { getExtractSidecar } from "./extractSidecar";
import { buildCoverageLedger } from "./coverage";
import { buildClaimSpanCoverage } from "./claim-span-coverage";
import { parseAtlasJobProvenance } from "../atlas/makeCardsSource";
import { afterRunningJobTerminal } from "./jobTerminal";
import { mergeTopicHints, parseTopicHintsJson } from "./topic-hints";
import {
  loadDeckFronts,
  markJobFailed,
  runTextDraftPipeline,
  type ProcessGenerateOptions,
  type ProcessGenerateResult,
  type SecretRow,
} from "./pass1";
import type { CardDraft } from "./schema";
import type { WindowResume } from "./study-windows";

type DeckOwnerRow = {
  id: string;
  user_id: string;
};

type FinalizeAfterPersistArgs = {
  jobId: string;
  deckId: string;
  userId: string;
  secret: SecretRow | null;
  topicHints: string[];
  avoidPatterns: string[];
  deckFronts: string[];
  coverageMaterial: string;
  windowResume: WindowResume | null;
  drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;
  autoFollowup: boolean;
  atlasProvenance: ReturnType<typeof parseAtlasJobProvenance>;
  opts?: ProcessGenerateOptions;
};

async function finalizeAfterPersist(
  env: Env,
  db: D1Database,
  args: FinalizeAfterPersistArgs,
): Promise<void> {
  let drafts = args.drafts;
  drafts = await appendGapFillDrafts({
    env,
    db,
    deckId: args.deckId,
    jobId: args.jobId,
    userId: args.userId,
    secret: args.secret ? "byo" : null,
    topicHints: args.topicHints,
    deckFronts: args.deckFronts,
    coverageMaterial: args.coverageMaterial,
    drafts,
    autoFollowup: args.autoFollowup,
    atlasProvenance: args.atlasProvenance,
    runPipeline: async ({
      topicHints: hints,
      avoidFronts,
      onUsage,
      heartbeat,
    }) => {
      const result = await runTextDraftPipeline({
        text: args.coverageMaterial,
        env,
        userId: args.userId,
        jobId: args.jobId,
        secret: args.secret,
        opts: args.opts,
        topicHints: hints,
        avoidPatterns: args.avoidPatterns,
        avoidFronts,
        onUsage,
        heartbeat,
      });
      // Gap-fill cards stay claim_id null (no claim persist on follow-up).
      return result.drafts;
    },
  });

  let coverageJson: string | null = null;
  try {
    const ledger = buildCoverageLedger(args.coverageMaterial, drafts);
    let claim_span:
      | {
          covered_units: string[];
          gaps: string[];
          claim_count: number;
          gap_extract_passes: number | null;
        }
      | undefined;
    try {
      const { results: claimRows } = await db
        .prepare(
          "SELECT source_span FROM study_claims WHERE job_id = ?",
        )
        .bind(args.jobId)
        .all<{ source_span: string }>();
      const spanLedger = buildClaimSpanCoverage(
        args.coverageMaterial,
        claimRows ?? [],
      );
      claim_span = {
        ...spanLedger,
        gap_extract_passes: null,
      };
    } catch (err) {
      console.error("claim span coverage failed", args.jobId, err);
    }
    const body = claim_span ? { ...ledger, claim_span } : ledger;
    coverageJson = JSON.stringify(
      args.windowResume
        ? { ...body, window_resume: args.windowResume }
        : body,
    );
  } catch (err) {
    console.error("coverage ledger failed; soft-finalizing", args.jobId, err);
  }

  const finishedAt = new Date().toISOString();
  await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = ?, finished_at = ? WHERE id = ?",
    )
    .bind("needs_review", coverageJson, finishedAt, args.jobId)
    .run();
  await afterRunningJobTerminal(env, args.jobId);
}

/** Resume gap-fill + finalize after a durable pass-1 step (Workflow). */
export async function runAfterPersistPhase(
  env: Env,
  message: MaterialGenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<ProcessGenerateResult> {
  const db = getDb(env);
  const { jobId, deckId } = message;

  const statusRow = await db
    .prepare(
      "SELECT status, progress_json, created_at FROM generation_jobs WHERE id = ?",
    )
    .bind(jobId)
    .first<{
      status: string;
      progress_json: string | null;
      created_at: string;
    }>();
  if (!statusRow || statusRow.status !== "running") {
    return "done";
  }

  try {
    const deck = await db
      .prepare("SELECT id, user_id FROM decks WHERE id = ?")
      .bind(deckId)
      .first<DeckOwnerRow>();
    if (!deck) throw new Error("Deck not found");

    const secret = await db
      .prepare(
        "SELECT provider, ciphertext, model FROM user_secrets WHERE user_id = ?",
      )
      .bind(deck.user_id)
      .first<SecretRow>();

    const progressRow = await db
      .prepare(
        "SELECT progress_json, topic_hints_json, avoid_patterns_json, run_topic_hints_json, atlas_provenance_json FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        progress_json: string | null;
        topic_hints_json: string | null;
        avoid_patterns_json: string | null;
        run_topic_hints_json: string | null;
        atlas_provenance_json: string | null;
      }>();

    const topicHints = mergeTopicHints(
      parseTopicHintsJson(progressRow?.run_topic_hints_json),
      parseTopicHintsJson(progressRow?.topic_hints_json),
    );
    const avoidPatterns = parseTopicHintsJson(
      progressRow?.avoid_patterns_json,
    );
    const atlasProvenance = parseAtlasJobProvenance(
      progressRow?.atlas_provenance_json,
    );
    const deckFronts = await loadDeckFronts(db, deckId);
    const sidecar = await getExtractSidecar(env, jobId);
    const coverageMaterial = sidecar?.text ?? "";
    const windowResume = sidecar?.windowResume ?? null;
    const drafts = sidecar?.drafts ?? [];

    if (drafts.length === 0) {
      const countRow = await db
        .prepare("SELECT COUNT(*) AS n FROM cards WHERE job_id = ?")
        .bind(jobId)
        .first<{ n: number }>();
      if (!countRow || countRow.n < 1) {
        console.warn("afterPersist missing drafts", jobId);
        return "done";
      }
      console.warn("afterPersist missing sidecar; soft-finalizing", jobId);
    }

    await finalizeAfterPersist(env, db, {
      jobId,
      deckId,
      userId: deck.user_id,
      secret,
      topicHints,
      avoidPatterns,
      deckFronts,
      coverageMaterial,
      windowResume,
      drafts,
      autoFollowup: message.autoFollowup === true,
      atlasProvenance,
      opts,
    });
    return "done";
  } catch (err) {
    const messageText =
      err instanceof Error ? err.message : "Generation failed";
    console.error("generation afterPersist failed", jobId, err);
    // Soft-complete sweeper heals running jobs that still have drafts.
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE job_id = ?")
      .bind(jobId)
      .first<{ n: number }>();
    if (!countRow || countRow.n < 1) {
      await markJobFailed(env, jobId, messageText);
    }
    return "done";
  }
}
