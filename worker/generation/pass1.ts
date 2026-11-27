import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { readOcrSidecar, type OcrSidecar } from "../materials/ocr-sidecar";
import { extractPptxSlides } from "../materials/extract-pptx";
import { bytesToBase64, mimeFromR2Key } from "../materials/figures";
import { MAX_IMAGE_BYTES } from "../materials/limits";
import type { MaterialGenerateQueueMessage } from "./enqueue";
import { collectPdfFigureDrafts } from "./pdf-figures";
import { studyPdfWithOcrSidecar } from "./pdf-ocr-study";
import {
  BYO_PROVIDERS_PHRASE,
  createLlmAdapter,
  parseLlmProvider,
  type LlmAdapter,
} from "./llm";
import { buildExtraUserSuffix } from "./feedback-hints";
import {
  EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES,
  emptyDraftError,
} from "./empty-draft-error";
import {
  critiqueDraftsAgainstSource,
  MAX_PIPELINE_CHUNKS,
  remainderAfterRules,
  runGenerationPipeline,
} from "./pipeline";
import { createWorkersAiEmbedTexts } from "./workers-ai-embed";
import {
  bindOcclusionImageKey,
  mergeAndDedupeDrafts,
} from "./draft-merge";
import {
  filterNovelDrafts,
  focusStudyPages,
  loadMaterialWindowResume,
  prepareStudySource,
  type WindowResume,
} from "./study-windows";
import {
  IMAGE_STAGES,
  PDF_STAGES,
  TEXT_LLM_STAGES,
  computePercent,
  computePipelineBandPercent,
  isFreeGenCharged,
  isRunningJobStale,
  readFreeGenSlots,
  readStartedAt,
  withoutStartedAt,
  withFreeGenCharged,
  withUpdatedAt,
  writeJobProgress,
  accumulateTokenUsage,
  type JobProgressEmit,
  type ProgressPatch,
  type ProgressStage,
  type ProgressEvent,
  truncateProgressText,
  pushProgressEvent,
  recordDraftPreviews,
} from "./progress";
import { buildCoverageLedger } from "./coverage";
import { consumeFreeGenSlot } from "./quota";
import { parseAtlasJobProvenance } from "../atlas/makeCardsSource";
import { ensureAtlasPrecraftAfterWipe } from "../atlas/reseedPrecraft";
import {
  attachClaimIdsToDrafts,
  insertDraftCards,
} from "./gap-fill";
import type { StoredClaim } from "./claims";
import { putExtractSidecar } from "./extractSidecar";
import { afterRunningJobTerminal } from "./jobTerminal";
import { softCompleteGenerationJob } from "./softComplete";
import { filterDraftsByQuality } from "./quality";
import { harvestRuleDrafts } from "./rules";
import { type CardDraft } from "./schema";
import { readStageWeightOverlay } from "./stageDurations";
import { mergeTopicHints, parseTopicHintsJson } from "./topic-hints";
import { resolveTextLlm } from "./resolve-text-llm";
import { stampDraftProvenancePages } from "../../src/study/notes/excerptPages";

export { mergeAndDedupeDrafts };

const IMAGE_BYO_REQUIRED = `Image generation requires an ${BYO_PROVIDERS_PHRASE} API key under Settings.`;

export function makeEmit(
  db: D1Database,
  jobId: string,
  presentStages: readonly ProgressStage[],
  opts?: {
    freeGenCharged?: boolean;
    freeGenSlots?: number;
    startedAt?: string;
    weightOverlay?: Partial<Record<ProgressStage, number>> | null;
  },
): JobProgressEmit {
  // Mutable accumulator merged into every progress write.
  // drafts_so_far stays unset until the first batch (avoids mid-job "0 cards left").
  let stages = presentStages;
  const weightOverlay = opts?.weightOverlay ?? null;
  const acc: {
    path?: "free" | "byo";
    free_gen_charged?: boolean;
    free_gen_slots?: number;
    started_at?: string;
    tokens_used?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
    drafts_so_far?: number;
    events?: ProgressEvent[];
  } = {
    events: [],
    ...(opts?.freeGenSlots && opts.freeGenSlots > 0
      ? { free_gen_slots: opts.freeGenSlots, free_gen_charged: true }
      : {}),
    ...(opts?.freeGenCharged ? { free_gen_charged: true } : {}),
    ...(opts?.startedAt ? { started_at: opts.startedAt } : {}),
  };

  function progressPatch(
    stage: ProgressStage,
    current: number,
    total: number,
    label: string,
    halfStepsDone?: number,
  ): ProgressPatch {
    const percent =
      halfStepsDone !== undefined &&
      (stage === "claims" || stage === "generate" || stage === "critique")
        ? computePipelineBandPercent(
            halfStepsDone,
            total,
            stages,
            weightOverlay,
          )
        : computePercent(stage, current, total, stages, weightOverlay);

    return {
      stage,
      current,
      total,
      percent,
      label,
      updated_at: new Date().toISOString(),
      ...(acc.started_at !== undefined ? { started_at: acc.started_at } : {}),
      ...(acc.tokens_used !== undefined
        ? { tokens_used: acc.tokens_used }
        : {}),
      ...(acc.tokens_prompt !== undefined
        ? { tokens_prompt: acc.tokens_prompt }
        : {}),
      ...(acc.tokens_completion !== undefined
        ? { tokens_completion: acc.tokens_completion }
        : {}),
      ...(acc.drafts_so_far !== undefined
        ? { drafts_so_far: acc.drafts_so_far }
        : {}),
      ...(acc.events && acc.events.length > 0 ? { events: acc.events } : {}),
      ...(acc.path !== undefined ? { path: acc.path } : {}),
      ...(acc.free_gen_charged ? { free_gen_charged: true } : {}),
      ...(acc.free_gen_slots !== undefined
        ? { free_gen_slots: acc.free_gen_slots }
        : {}),
      present_stages: [...stages],
    };
  }

  async function emit(
    stage: ProgressStage,
    current: number,
    total: number,
    label: string,
    halfStepsDone?: number,
  ) {
    if (stage !== "queued" && acc.started_at === undefined) {
      acc.started_at = new Date().toISOString();
    }
    try {
      await writeJobProgress(
        db,
        jobId,
        progressPatch(stage, current, total, label, halfStepsDone),
      );
    } catch (err) {
      console.error("writeJobProgress failed", jobId, stage, err);
    }
  }

  function addEvent(kind: ProgressEvent["kind"], stage: string, text: string) {
    const e: ProgressEvent = {
      at: new Date().toISOString(),
      kind,
      stage,
      text: truncateProgressText(text),
    };
    acc.events = pushProgressEvent(acc.events, e);
  }

  function addUsage(usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  }) {
    accumulateTokenUsage(acc, usage);
  }

  function addDrafts(n: number) {
    if (n <= 0) return;
    acc.drafts_so_far = (acc.drafts_so_far ?? 0) + n;
  }

  function setPath(p: "free" | "byo") {
    acc.path = p;
  }

  function setPresentStages(next: readonly ProgressStage[]) {
    stages = next;
  }

  function noteFreeGenCharged() {
    acc.free_gen_charged = true;
    acc.free_gen_slots = Math.max(acc.free_gen_slots ?? 0, 1);
  }

  function noteFreeGenSlots(slots: number) {
    const n = Math.max(0, Math.trunc(slots));
    acc.free_gen_slots = Math.max(acc.free_gen_slots ?? 0, n);
    if (n >= 1) acc.free_gen_charged = true;
  }

  return {
    emit,
    addEvent,
    addUsage,
    addDrafts,
    setPath,
    setPresentStages,
    noteFreeGenCharged,
    noteFreeGenSlots,
  };
}

type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  status: string;
};

type DeckOwnerRow = {
  id: string;
  user_id: string;
};

export type SecretRow = {
  provider: string;
  ciphertext: string;
  model: string | null;
};

export type ProcessGenerateOptions = {
  /**
   * Override LLM (tests). When set, skips Workers AI / BYO factories.
   * Free-path quota still applies when no user_secrets row exists.
   */
  llm?: LlmAdapter;
};

const NO_NEW_SECTIONS = "No new high-yield sections left in this document.";

export async function loadDeckFronts(
  db: D1Database,
  deckId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT front_json FROM cards WHERE deck_id = ? AND status IN ('draft', 'accepted') ORDER BY created_at DESC LIMIT 80",
    )
    .bind(deckId)
    .all<{ front_json: string }>();
  const fronts: string[] = [];
  for (const row of results ?? []) {
    try {
      const parsed: unknown = JSON.parse(row.front_json);
      if (typeof parsed === "string" && parsed.trim()) {
        fronts.push(parsed.trim());
      } else if (
        parsed &&
        typeof parsed === "object" &&
        "prompt" in parsed &&
        typeof (parsed as { prompt?: unknown }).prompt === "string"
      ) {
        const prompt = (parsed as { prompt: string }).prompt.trim();
        if (prompt) fronts.push(prompt);
      }
    } catch {
      // A bad front must not fail the job.
    }
  }
  return fronts;
}

async function rememberExhaustedWindow(
  db: D1Database,
  jobId: string,
  resume: WindowResume | null,
): Promise<void> {
  if (!resume) return;
  const coverageJson = JSON.stringify({
    ...buildCoverageLedger("", []),
    window_resume: resume,
  });
  await db
    .prepare("UPDATE generation_jobs SET coverage_json = ? WHERE id = ?")
    .bind(coverageJson, jobId)
    .run();
}

export async function markJobFailed(
  env: Env,
  jobId: string,
  error: string,
): Promise<void> {
  const db = getDb(env);
  const finishedAt = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ? AND status = ?",
    )
    .bind("failed", error, finishedAt, jobId, "running")
    .run();
  // Soft-complete (or another healer) may have already left `running`.
  if ((result.meta.changes ?? 0) > 0) {
    await afterRunningJobTerminal(env, jobId);
  }
}

const EMPTY_NOVEL_DRAFT_ERRORS = new Set([
  "No flashcard drafts could be produced from this material.",
  EMPTY_DRAFTS_FOR_LEARNING_OBJECTIVES,
  "New cards repeated cards already in this deck.",
]);

/** Atlas empty-novel-drafts with precraft present → needs_review; other errors fail. */
export async function markJobFailedOrAtlasSoftComplete(
  env: Env,
  jobId: string,
  error: string,
  atlasJob: boolean,
): Promise<void> {
  if (atlasJob && EMPTY_NOVEL_DRAFT_ERRORS.has(error)) {
    const db = getDb(env);
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM cards WHERE job_id = ?")
      .bind(jobId)
      .first<{ n: number }>();
    if (countRow && countRow.n > 0) {
      await softCompleteGenerationJob(env, jobId, null);
      return;
    }
  }
  await markJobFailed(env, jobId, error);
}

async function extractMaterialText(
  env: Env,
  material: MaterialRow,
): Promise<string> {
  if (!material.r2_key) {
    throw new Error("Material has no R2 object to extract");
  }

  const obj = await env.MATERIALS.get(material.r2_key);
  if (!obj) {
    throw new Error(`R2 object missing: ${material.r2_key}`);
  }

  if (material.kind !== "paste") {
    throw new Error(
      `Unsupported material kind for generation: ${material.kind}`,
    );
  }
  return obj.text();
}

/**
 * Shared text path: harvest → critique Layer-1 → generate remainder → merge.
 * Returns [] when text has nothing harvestable and no remainder for LLM.
 */
export async function runTextDraftPipeline(args: {
  text: string;
  env: Env;
  userId: string;
  jobId: string;
  secret: SecretRow | null;
  opts?: ProcessGenerateOptions;
  emit?: JobProgressEmit;
  /** Also-cover topic hints from the job (`topic_hints_json`). */
  topicHints?: string[];
  /** Reject avoid-patterns from the job (`avoid_patterns_json`). */
  avoidPatterns?: string[];
  /** Fronts already in the deck. Later chunks also see this run's new fronts. */
  avoidFronts?: string[];
  /**
   * Atlas job provenance: extras claim→card must put claim subject on the front.
   */
  atlasSubjectAnchor?: boolean;
  /** Emit rules stage before LLM when using TEXT_LLM_STAGES catalog. */
  emitRulesStage?: boolean;
  /** Token totals when this pass must not emit a stage. */
  onUsage?: (usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  }) => void;
  /** Refresh updated_at when this pass must not emit a stage. */
  heartbeat?: () => Promise<void>;
}): Promise<{ drafts: CardDraft[]; claims: StoredClaim[] }> {
  const rawRules = harvestRuleDrafts(args.text);
  const layer1Rules = filterDraftsByQuality(rawRules);
  const remainder = remainderAfterRules(args.text, rawRules);
  const needsLlm = Boolean(remainder.trim()) || layer1Rules.length > 0;
  if (!needsLlm) return { drafts: [], claims: [] };

  if (args.emitRulesStage && args.emit) {
    await args.emit.emit("rules", 0, 0, "Harvesting rules");
  }

  const reportUsage = args.onUsage ?? args.emit?.addUsage;
  const { llm, apiKey, provider } = await resolveTextLlm(
    args.env,
    args.secret,
    args.opts,
    reportUsage,
  );
  if (args.emit) {
    const path = !args.secret && provider === "workers-ai" ? "free" : "byo";
    args.emit.setPath(path);
  }
  if (!args.secret) {
    const db = getDb(args.env);
    const row = await db
      .prepare("SELECT progress_json FROM generation_jobs WHERE id = ?")
      .bind(args.jobId)
      .first<{ progress_json: string | null }>();
    if (!isFreeGenCharged(row?.progress_json)) {
      await consumeFreeGenSlot(args.env, args.userId);
      await db
        .prepare("UPDATE generation_jobs SET progress_json = ? WHERE id = ?")
        .bind(withFreeGenCharged(row?.progress_json), args.jobId)
        .run();
      args.emit?.noteFreeGenCharged();
    }
  }

  let critiquedRules = layer1Rules;
  if (layer1Rules.length > 0) {
    critiquedRules = await critiqueDraftsAgainstSource({
      sourceText: args.text,
      candidates: layer1Rules,
      llm,
      apiKey,
      provider,
      extraUserSuffix: buildExtraUserSuffix({
        avoidPatterns: args.avoidPatterns,
      }),
    });
  }
  if (args.emit && critiquedRules.length > 0) {
    recordDraftPreviews(args.emit, "rules", critiquedRules);
  }

  let llmDrafts: CardDraft[] = [];
  let claims: StoredClaim[] = [];
  if (remainder.trim()) {
    const pipeline = await runGenerationPipeline({
      text: remainder,
      llm,
      apiKey,
      provider,
      topicHints: args.topicHints,
      avoidPatterns: args.avoidPatterns,
      avoidFronts: args.avoidFronts,
      atlasSubjectAnchor: args.atlasSubjectAnchor,
      // Semantic stage uses Workers AI Neurons; skip on BYO to avoid quota burn.
      embedTexts:
        provider === "workers-ai"
          ? createWorkersAiEmbedTexts(args.env)
          : null,
      onProgress: args.emit
        ? (e) =>
            args.emit!.emit(
              e.stage,
              e.current,
              e.total,
              e.label,
              e.halfStepsDone,
            )
        : args.heartbeat
          ? () => args.heartbeat!()
          : undefined,
      onChunkDrafts: args.emit
        ? (drafts) => recordDraftPreviews(args.emit!, "generate", drafts)
        : undefined,
    });
    llmDrafts = pipeline.drafts;
    claims = pipeline.claims;
  }

  return {
    drafts: mergeAndDedupeDrafts(critiquedRules, llmDrafts),
    claims,
  };
}

export type ProcessGenerateResult = "done" | "busy";

/**
 * Claim → extract → generate → persist → write R2 extract sidecar.
 * Does not gap-fill or finalize (Workflow afterPersist / processGenerateJob all path).
 */
export async function runPass1Phase(
  env: Env,
  message: MaterialGenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<ProcessGenerateResult> {
  const db = getDb(env);
  const { jobId, materialId, deckId } = message;

  const claimHeartbeat = withUpdatedAt(null);
  let reclaimed = false;
  const claim = await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = NULL, progress_json = ? WHERE id = ? AND status = ?",
    )
    .bind("running", claimHeartbeat, jobId, "queued")
    .run();
  // Duplicate / stale queue delivery: another worker already claimed or finished.
  if (!claim.meta.changes) {
    const existing = await db
      .prepare(
        "SELECT status, progress_json, created_at FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        status: string;
        progress_json: string | null;
        created_at: string;
      }>();
    if (existing?.status !== "running") {
      return "done";
    }
    if (!isRunningJobStale(existing.progress_json, existing.created_at)) {
      return "busy";
    }
    const reclaimedProgress = withUpdatedAt(
      withoutStartedAt(existing.progress_json),
    );
    const reclaim =
      existing.progress_json == null
        ? await db
            .prepare(
              "UPDATE generation_jobs SET progress_json = ? WHERE id = ? AND status = ? AND progress_json IS NULL",
            )
            .bind(reclaimedProgress, jobId, "running")
            .run()
        : await db
            .prepare(
              "UPDATE generation_jobs SET progress_json = ? WHERE id = ? AND status = ? AND progress_json = ?",
            )
            .bind(reclaimedProgress, jobId, "running", existing.progress_json)
            .run();
    if (!reclaim.meta.changes) {
      return "busy";
    }
    reclaimed = true;
  }

  try {
    if (reclaimed) {
      // Same wipe as regen: mid-run death can leave drafts/claims; reclaim must not duplicate.
      await db
        .prepare("DELETE FROM study_claims WHERE job_id = ?")
        .bind(jobId)
        .run();
      await db.prepare("DELETE FROM cards WHERE job_id = ?").bind(jobId).run();
    }

    const material = await db
      .prepare(
        "SELECT id, deck_id, kind, r2_key, status FROM materials WHERE id = ?",
      )
      .bind(materialId)
      .first<MaterialRow>();

    if (!material) {
      throw new Error("Material not found");
    }
    if (material.deck_id !== deckId) {
      throw new Error("Material/deck mismatch");
    }

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
    const freeGenCharged = isFreeGenCharged(progressRow?.progress_json);
    const freeGenSlots = readFreeGenSlots(progressRow?.progress_json);
    const startedAt = readStartedAt(progressRow?.progress_json);
    const weightOverlay = env.CACHE
      ? await readStageWeightOverlay(env.CACHE).catch(() => null)
      : null;
    const topicHints = mergeTopicHints(
      parseTopicHintsJson(progressRow?.run_topic_hints_json),
      parseTopicHintsJson(progressRow?.topic_hints_json),
    );
    const avoidPatterns = parseTopicHintsJson(progressRow?.avoid_patterns_json);
    const atlasProvenance = parseAtlasJobProvenance(
      progressRow?.atlas_provenance_json,
    );
    if (reclaimed && atlasProvenance) {
      const decision = await ensureAtlasPrecraftAfterWipe(env, {
        jobId,
        deckId,
        atlasProvenanceJson: progressRow?.atlas_provenance_json,
        materialKind: material.kind,
        materialR2Key: material.r2_key,
      });
      if (decision === "stub_only") {
        await softCompleteGenerationJob(env, jobId, null);
        return "done";
      }
    }
    const prior = await loadMaterialWindowResume(db, materialId, jobId);
    const deckFronts = await loadDeckFronts(db, deckId);
    let windowResume: WindowResume | null = null;
    let stampPageTexts: { page: number; text: string }[] = [];
    let stampPickedPages: number[] = [];

    let drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;
    /** Text used for coverage gaps; empty for image-only jobs. */
    let coverageMaterial = "";

    if (material.kind === "image") {
      const progress = makeEmit(db, jobId, IMAGE_STAGES, {
        freeGenCharged,
        freeGenSlots,
        startedAt,
        weightOverlay,
      });
      // Vision needs a BYO provider; free Workers AI path is text-only.
      if (!secret && !opts?.llm) {
        throw new Error(IMAGE_BYO_REQUIRED);
      }
      const wrapKey = env.SECRETS_WRAP_KEY;
      let apiKey = "";
      let provider = "mock";
      let llm: LlmAdapter;
      if (opts?.llm) {
        llm = opts.llm;
      } else {
        if (!secret) {
          throw new Error(IMAGE_BYO_REQUIRED);
        }
        if (!wrapKey) {
          throw new Error("SECRETS_WRAP_KEY is not configured");
        }
        apiKey = await decryptSecret(secret.ciphertext, wrapKey);
        provider = parseLlmProvider(secret.provider);
        llm = createLlmAdapter(provider, { model: secret.model });
      }
      // Image generation always uses a BYO provider.
      progress.setPath("byo");

      await progress.emit("queued", 0, 0, "Queued");
      await progress.emit("extract", 0, 0, "Loading image");
      if (!material.r2_key) {
        throw new Error("Image material has no R2 object");
      }
      const imageR2Key = material.r2_key;
      const obj = await env.MATERIALS.get(imageR2Key);
      if (!obj) {
        throw new Error(`R2 object missing: ${imageR2Key}`);
      }
      const bytes = await obj.arrayBuffer();
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(
          `Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)}MB generate limit`,
        );
      }
      const generateTotal = 1;
      await progress.emit("generate", 0, generateTotal, "Generating cards");
      drafts = await llm.generateDrafts({
        text: "",
        apiKey,
        provider,
        imageKey: material.r2_key,
        image: {
          mimeType: mimeFromR2Key(imageR2Key),
          base64: bytesToBase64(bytes),
        },
      });
      recordDraftPreviews(progress, "generate", drafts);
      await progress.emit(
        "generate",
        generateTotal,
        generateTotal,
        "Generating cards",
      );
      drafts = bindOcclusionImageKey(drafts, material.r2_key);
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error(
          emptyDraftError(
            topicHints,
            "Generation produced no valid draft cards",
          ),
        );
      }
      drafts = drafts.map((d) => ({
        ...d,
        mediaR2Keys: [imageR2Key],
      }));
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts, atlasProvenance });
      await progress.emit("persist", 1, 1, "Saving drafts");
    } else if (material.kind === "pdf") {
      // Figure helper narrows this to figure-only stages when the PDF has no text.
      const progress = makeEmit(db, jobId, PDF_STAGES, {
        freeGenCharged,
        freeGenSlots,
        startedAt,
        weightOverlay,
      });
      await progress.emit("queued", 0, 0, "Queued");
      await progress.emit("extract", 0, 0, "Extracting material");
      if (!material.r2_key) {
        throw new Error("PDF material has no R2 object");
      }
      const pdfObject = await env.MATERIALS.get(material.r2_key);
      if (!pdfObject) {
        throw new Error(`R2 object missing: ${material.r2_key}`);
      }
      // ponytail: full R2 arrayBuffer up to MAX_FILE_BYTES (50MB) inside a ~128MB
      // isolate. Share one buffer through OCR windows + Docling; if OOM persists,
      // park R2-range / out-of-isolate extract (do not roll back the product cap).
      let pdfBytes: ArrayBuffer | undefined = await pdfObject.arrayBuffer();
      let text = "";
      let textError: unknown;
      let sidecar: OcrSidecar | null = null;
      try {
        sidecar = await readOcrSidecar(env, material.deck_id, material.id);
      } catch (err) {
        console.warn("OCR sidecar read failed", err);
      }
      try {
        const focused = await studyPdfWithOcrSidecar({
          env,
          deckId: material.deck_id,
          materialId: material.id,
          pdfBytes,
          startPage: prior.startPage,
          topicHints,
          usedKeys: prior.usedKeys,
          sidecar,
        });
        text = focused.text;
        windowResume = focused.resume;
        stampPageTexts = focused.pageTexts;
        stampPickedPages = focused.pickedPages;
      } catch (err) {
        textError = err;
        console.warn("PDF text extraction failed; trying figures", err);
      }
      coverageMaterial = text;
      if (text.trim() && (windowResume?.total_pages ?? 0) > 1) {
        await progress.emit(
          "extract",
          0,
          0,
          "Using the highest-yield sections",
        );
      }

      // Emit an excerpt event after extraction when text is present.
      if (text.trim()) {
        const excerpt = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
        progress.addEvent("excerpt", "extract", excerpt.slice(0, 160));
      }

      const { drafts: figureDrafts } = await collectPdfFigureDrafts({
        db,
        env,
        deckId,
        pdfMaterialId: material.id,
        jobId,
        pdfBytes,
        text,
        textError,
        secret,
        opts,
        progress,
      });
      // Drop full-PDF buffer before text LLM so peak memory falls sooner.
      pdfBytes = undefined;

      let textDrafts: CardDraft[] = [];
      let textClaims: StoredClaim[] = [];
      if (text.trim()) {
        const textResult = await runTextDraftPipeline({
          text,
          env,
          userId: deck.user_id,
          jobId,
          secret,
          opts,
          emit: progress,
          topicHints,
          avoidPatterns,
          avoidFronts: deckFronts,
          atlasSubjectAnchor: Boolean(atlasProvenance),
          emitRulesStage: true,
        });
        textDrafts = textResult.drafts;
        textClaims = textResult.claims;
      }

      if (stampPageTexts.length > 0 || stampPickedPages.length > 0) {
        textDrafts = stampDraftProvenancePages(
          textDrafts,
          stampPageTexts,
          stampPickedPages,
        );
      }
      const pdfQuality = filterDraftsByQuality([
        ...textDrafts,
        ...figureDrafts,
      ]);
      drafts = filterNovelDrafts(pdfQuality, deckFronts);
      if (drafts.length === 0) {
        if (textError && figureDrafts.length === 0) {
          throw textError;
        }
        if (!text.trim()) {
          await rememberExhaustedWindow(db, jobId, windowResume);
          if (prior.usedKeys.length > 0) throw new Error(NO_NEW_SECTIONS);
        }
        if (pdfQuality.length > 0 && deckFronts.length > 0) {
          throw new Error("New cards repeated cards already in this deck.");
        }
        throw new Error(
          text.trim()
            ? emptyDraftError(
                topicHints,
                "No flashcard drafts could be produced from this material.",
              )
            : "Extracted material text is empty and no usable figures were found. Upload OCR text or figure crops.",
        );
      }
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, {
        deckId,
        jobId,
        drafts: attachClaimIdsToDrafts(drafts, textClaims),
        atlasProvenance,
        claims: textClaims,
      });
      await progress.emit("persist", 1, 1, "Saving drafts");
    } else {
      // TEXT_LLM catalog; emit before extract so failures leave progress.
      const progress = makeEmit(db, jobId, TEXT_LLM_STAGES, {
        freeGenCharged,
        freeGenSlots,
        startedAt,
        weightOverlay,
      });
      await progress.emit("queued", 0, 0, "Queued");
      await progress.emit("extract", 0, 0, "Extracting material");

      let text = "";
      if (material.kind === "pptx") {
        if (!material.r2_key) {
          throw new Error("Material has no R2 object to extract");
        }
        const pptxObject = await env.MATERIALS.get(material.r2_key);
        if (!pptxObject) {
          throw new Error(`R2 object missing: ${material.r2_key}`);
        }
        const pptxBytes = await pptxObject.arrayBuffer();
        const focused = await focusStudyPages(
          (start) => extractPptxSlides(pptxBytes, { startSlide: start }),
          {
            startPage: prior.startPage,
            topicHints,
            usedKeys: prior.usedKeys,
          },
        );
        text = focused.text;
        windowResume = focused.resume;
        stampPageTexts = focused.pageTexts;
        stampPickedPages = focused.pickedPages;
      } else {
        const raw = await extractMaterialText(env, material);
        const prepared = prepareStudySource({
          pages: [{ page: 1, text: raw }],
          topicHints,
          usedKeys: prior.usedKeys,
          limit: MAX_PIPELINE_CHUNKS,
          pageStart: 1,
          pageEnd: 1,
          totalPages: 1,
        });
        text = prepared.text;
        windowResume = prepared.resume;
        stampPageTexts = [{ page: 1, text: raw }];
        stampPickedPages = prepared.pickedPages;
      }
      coverageMaterial = text;
      // Emit an excerpt event after extraction.
      if (text.trim()) {
        const excerpt = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
        progress.addEvent("excerpt", "extract", excerpt.slice(0, 160));
        if ((windowResume?.total_pages ?? 1) > 1) {
          await progress.emit(
            "extract",
            0,
            0,
            "Using the highest-yield sections",
          );
        }
      }
      if (!text.trim()) {
        await rememberExhaustedWindow(db, jobId, windowResume);
        if (prior.usedKeys.length > 0) throw new Error(NO_NEW_SECTIONS);
        throw new Error(
          material.kind === "pptx"
            ? "PPTX text extraction returned no text. Paste slide notes or OCR text instead."
            : "Extracted material text is empty",
        );
      }

      const textResult = await runTextDraftPipeline({
        text,
        env,
        userId: deck.user_id,
        jobId,
        secret,
        opts,
        emit: progress,
        topicHints,
        avoidPatterns,
        avoidFronts: deckFronts,
        atlasSubjectAnchor: Boolean(atlasProvenance),
        emitRulesStage: true,
      });
      drafts = textResult.drafts;
      const textClaims = textResult.claims;
      if (stampPageTexts.length > 0 || stampPickedPages.length > 0) {
        drafts = stampDraftProvenancePages(
          drafts,
          stampPageTexts,
          stampPickedPages,
        );
      }
      const textQuality = filterDraftsByQuality(drafts);
      drafts = filterNovelDrafts(textQuality, deckFronts);
      if (drafts.length === 0) {
        throw new Error(
          textQuality.length > 0 && deckFronts.length > 0
            ? "New cards repeated cards already in this deck."
            : emptyDraftError(
                topicHints,
                "No flashcard drafts could be produced from this material.",
              ),
        );
      }
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, {
        deckId,
        jobId,
        drafts: attachClaimIdsToDrafts(drafts, textClaims),
        atlasProvenance,
        claims: textClaims,
      });
      await progress.emit("persist", 1, 1, "Saving drafts");
    }

    try {
      await putExtractSidecar(env, jobId, {
        text: coverageMaterial,
        windowResume,
        drafts,
      });
    } catch (err) {
      // Drafts are already in D1; soft-complete still opens review; afterPersist
      // recovers when the sidecar is missing but cards exist.
      console.error("extract sidecar write failed after persist", jobId, err);
    }
    try {
      await softCompleteGenerationJob(env, jobId, null);
    } catch (err) {
      // Drafts already persisted; leave status for sweeper / afterPersist heal.
      console.error("soft-complete failed after persist", jobId, err);
    }
    return "done";
  } catch (err) {
    // Leave last progress_json; atlas with precraft → needs_review, else failed.
    const messageText =
      err instanceof Error ? err.message : "Generation failed";
    console.error("generation job failed", jobId, err);
    const provenanceRow = await db
      .prepare("SELECT atlas_provenance_json FROM generation_jobs WHERE id = ?")
      .bind(jobId)
      .first<{ atlas_provenance_json: string | null }>();
    const atlasJob = Boolean(
      parseAtlasJobProvenance(provenanceRow?.atlas_provenance_json),
    );
    await markJobFailedOrAtlasSoftComplete(
      env,
      jobId,
      messageText,
      atlasJob,
    );
    return "done";
  }
}
