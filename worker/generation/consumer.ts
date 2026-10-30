import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
import { extractFiguresViaDocling } from "../materials/docling";
import {
  listFigureChildrenForPdf,
  mimeFromR2Key,
  persistFigureCrops,
} from "../materials/figures";
import { MAX_IMAGE_BYTES } from "../materials/limits";
import type {
  FigureExtractMode,
  GenerateQueueMessage,
} from "./enqueue";
import {
  BYO_PROVIDERS_PHRASE,
  createLlmAdapter,
  parseLlmProvider,
  type LlmAdapter,
} from "./llm";
import { buildExtraUserSuffix } from "./feedback-hints";
import {
  critiqueDraftsAgainstSource,
  remainderAfterRules,
  runGenerationPipeline,
} from "./pipeline";
import {
  IMAGE_STAGES,
  PDF_FIGURE_ONLY_STAGES,
  PDF_STAGES,
  TEXT_LLM_STAGES,
  computePercent,
  computePipelineBandPercent,
  GENERATE_QUEUE_RETRY_DELAY_SEC,
  isFreeGenCharged,
  isRunningJobStale,
  readStartedAt,
  withoutStartedAt,
  withFreeGenCharged,
  withUpdatedAt,
  writeJobProgress,
  accumulateTokenUsage,
  type ProgressPatch,
  type ProgressStage,
  type ProgressEvent,
  truncateProgressText,
  pushProgressEvent,
} from "./progress";
import { buildCoverageLedger } from "./coverage";
import { consumeFreeGenSlot } from "./quota";
import { filterDraftsByQuality } from "./quality";
import { harvestRuleDrafts } from "./rules";
import { assertValidMcqOptions, type CardDraft } from "./schema";
import { mergeTopicHints, parseTopicHintsJson } from "./topic-hints";
import { recordGenerationUsageEventForJob } from "./usage";
import { createWorkersAiAdapter } from "./workers-ai";

/** ponytail: 240s ceiling for Fly wake + model load; raise if cold starts exceed client 10m poll. */
const DOCLING_ACCURATE_TIMEOUT_MS = 240_000;

const IMAGE_BYO_REQUIRED = `Image generation requires an ${BYO_PROVIDERS_PHRASE} API key under Settings.`;

export type JobProgressEmit = {
  emit: (
    stage: ProgressStage,
    current: number,
    total: number,
    label: string,
    halfStepsDone?: number,
  ) => Promise<void>;
  addEvent: (kind: ProgressEvent["kind"], stage: string, text: string) => void;
  addUsage: (usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  }) => void;
  addDrafts: (n: number) => void;
  setPath: (p: "free" | "byo") => void;
  setPresentStages: (stages: readonly ProgressStage[]) => void;
  /** Keep emit accumulator aligned after durable free-gen marker write. */
  noteFreeGenCharged: () => void;
};

function draftFrontPreview(d: CardDraft): string {
  return typeof d.front === "string"
    ? d.front
    : String(d.front.prompt ?? d.front.image_key ?? JSON.stringify(d.front));
}

function recordDraftPreviews(
  emit: JobProgressEmit,
  stage: string,
  drafts: CardDraft[],
) {
  emit.addDrafts(drafts.length);
  for (let i = 0; i < Math.min(2, drafts.length); i++) {
    emit.addEvent("draft", stage, draftFrontPreview(drafts[i]!));
  }
}

function makeEmit(
  db: D1Database,
  jobId: string,
  presentStages: readonly ProgressStage[],
  opts?: { freeGenCharged?: boolean; startedAt?: string },
) {
  // Mutable accumulator merged into every progress write.
  // drafts_so_far stays unset until the first batch (avoids mid-job "0 cards left").
  let stages = presentStages;
  const acc: {
    path?: "free" | "byo";
    free_gen_charged?: boolean;
    started_at?: string;
    tokens_used?: number;
    tokens_prompt?: number;
    tokens_completion?: number;
    drafts_so_far?: number;
    events?: ProgressEvent[];
  } = {
    events: [],
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
      (stage === "generate" || stage === "critique")
        ? computePipelineBandPercent(halfStepsDone, total, stages)
        : computePercent(stage, current, total, stages);

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
  }

  return {
    emit,
    addEvent,
    addUsage,
    addDrafts,
    setPath,
    setPresentStages,
    noteFreeGenCharged,
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

type SecretRow = {
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

function newId(): string {
  return crypto.randomUUID();
}

function normalizeFront(front: string): string {
  return front.trim().toLowerCase();
}

function draftDedupeKey(draft: CardDraft): string {
  if (draft.type === "occlusion") {
    return `occlusion:${draft.front.image_key}:${draft.front.regions
      .map((r) => r.id)
      .join(",")}`;
  }
  return normalizeFront(draft.front);
}

/** Stamp material R2 key onto occlusion fronts (LLM must not invent storage keys). */
function bindOcclusionImageKey(
  drafts: CardDraft[],
  imageKey: string,
): CardDraft[] {
  return drafts.map((draft) => {
    if (draft.type !== "occlusion") return draft;
    return {
      ...draft,
      front: { ...draft.front, image_key: imageKey },
      media_keys: [imageKey],
    };
  });
}

/** Merge rules then LLM drafts; drop near-identical fronts (trim + lower). */
export function mergeAndDedupeDrafts(
  rulesDrafts: CardDraft[],
  llmDrafts: CardDraft[],
): CardDraft[] {
  const seen = new Set<string>();
  const out: CardDraft[] = [];
  for (const draft of [...rulesDrafts, ...llmDrafts]) {
    const key = draftDedupeKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}

async function markJobFailed(
  db: D1Database,
  jobId: string,
  error: string,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?",
    )
    .bind("failed", error, finishedAt, jobId)
    .run();
  await recordGenerationUsageEventForJob(db, jobId);
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

  if (material.kind === "paste") {
    return obj.text();
  }

  if (material.kind === "pdf") {
    const bytes = await obj.arrayBuffer();
    return extractPdfText(bytes);
  }

  if (material.kind === "pptx") {
    const bytes = await obj.arrayBuffer();
    return extractPptxText(bytes);
  }

  throw new Error(`Unsupported material kind for generation: ${material.kind}`);
}

/** Chunked so large images do not blow the call stack via spread. */
function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(arr[j]!);
    }
  }
  return btoa(binary);
}

async function resolveTextLlm(
  env: Env,
  secret: SecretRow | null,
  opts?: ProcessGenerateOptions,
  onUsage?: (usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  }) => void,
): Promise<{ llm: LlmAdapter; apiKey: string; provider: string }> {
  if (secret) {
    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }
    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    const llm =
      opts?.llm ?? createLlmAdapter(provider, { model: secret.model });
    return { llm, apiKey, provider };
  }

  if (opts?.llm) {
    return { llm: opts.llm, apiKey: "", provider: "workers-ai" };
  }
  if (env.AI) {
    return {
      llm: createWorkersAiAdapter(env, { onUsage }),
      apiKey: "",
      provider: "workers-ai",
    };
  }
  throw new Error(
    "Workers AI is not available and no LLM API key is configured. " +
      `Add an ${BYO_PROVIDERS_PHRASE} API key under Settings, or retry later.`,
  );
}

/**
 * Shared text path: harvest → critique Layer-1 → generate remainder → merge.
 * Returns [] when text has nothing harvestable and no remainder for LLM.
 */
async function runTextDraftPipeline(args: {
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
  /** Emit rules stage before LLM when using TEXT_LLM_STAGES catalog. */
  emitRulesStage?: boolean;
}): Promise<CardDraft[]> {
  const rawRules = harvestRuleDrafts(args.text);
  const layer1Rules = filterDraftsByQuality(rawRules);
  const remainder = remainderAfterRules(args.text, rawRules);
  const needsLlm = Boolean(remainder.trim()) || layer1Rules.length > 0;
  if (!needsLlm) return [];

  if (args.emitRulesStage && args.emit) {
    await args.emit.emit("rules", 0, 0, "Harvesting rules");
  }

  const { llm, apiKey, provider } = await resolveTextLlm(
    args.env,
    args.secret,
    args.opts,
    args.emit ? (usage) => args.emit!.addUsage(usage) : undefined,
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
        .prepare(
          "UPDATE generation_jobs SET progress_json = ? WHERE id = ?",
        )
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
  if (remainder.trim()) {
    llmDrafts = await runGenerationPipeline({
      text: remainder,
      llm,
      apiKey,
      provider,
      topicHints: args.topicHints,
      avoidPatterns: args.avoidPatterns,
      onProgress: args.emit
        ? (e) =>
            args.emit!.emit(
              e.stage,
              e.current,
              e.total,
              e.label,
              e.halfStepsDone,
            )
        : undefined,
      onChunkDrafts: args.emit
        ? (drafts) => recordDraftPreviews(args.emit!, "generate", drafts)
        : undefined,
    });
  }

  return mergeAndDedupeDrafts(critiquedRules, llmDrafts);
}

export async function insertDraftCards(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  for (const draft of args.drafts) {
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

/**
 * Process one generate queue message:
 * image → vision generate;
 * text → harvest → Layer-1 → rules critique → remainder LLM → merge → Layer-1.
 * On failure marks the job failed with an actionable error (does not throw after mark).
 */
export type ProcessGenerateResult = "done" | "busy";

export async function processGenerateJob(
  env: Env,
  message: GenerateQueueMessage,
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
            .bind(
              reclaimedProgress,
              jobId,
              "running",
              existing.progress_json,
            )
            .run();
    if (!reclaim.meta.changes) {
      return "busy";
    }
    reclaimed = true;
  }

  try {
    if (reclaimed) {
      // Same wipe as regen: mid-run death can leave drafts; reclaim must not duplicate.
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
        "SELECT progress_json, topic_hints_json, avoid_patterns_json, run_topic_hints_json FROM generation_jobs WHERE id = ?",
      )
      .bind(jobId)
      .first<{
        progress_json: string | null;
        topic_hints_json: string | null;
        avoid_patterns_json: string | null;
        run_topic_hints_json: string | null;
      }>();
    const freeGenCharged = isFreeGenCharged(progressRow?.progress_json);
    const startedAt = readStartedAt(progressRow?.progress_json);
    const topicHints = mergeTopicHints(
      parseTopicHintsJson(progressRow?.run_topic_hints_json),
      parseTopicHintsJson(progressRow?.topic_hints_json),
    );
    const avoidPatterns = parseTopicHintsJson(
      progressRow?.avoid_patterns_json,
    );

    let drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;
    /** Text used for coverage gaps; empty for image-only jobs. */
    let coverageMaterial = "";

    if (material.kind === "image") {
      const progress = makeEmit(db, jobId, IMAGE_STAGES, {
        freeGenCharged,
        startedAt,
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
        throw new Error("Generation produced no valid draft cards");
      }
      drafts = drafts.map((d) => ({
        ...d,
        mediaR2Keys: [imageR2Key],
      }));
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await progress.emit("persist", 1, 1, "Saving drafts");
    } else if (material.kind === "pdf") {
      // Start with full PDF catalog; switch to figure-only after extract if no text.
      let presentStages: readonly ProgressStage[] = PDF_STAGES;
      const progress = makeEmit(db, jobId, presentStages, {
        freeGenCharged,
        startedAt,
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
      const pdfBytes = await pdfObject.arrayBuffer();
      let text = "";
      let textError: unknown;
      try {
        text = await extractPdfText(pdfBytes.slice(0));
      } catch (err) {
        textError = err;
        console.warn("PDF text extraction failed; trying figures", err);
      }
      coverageMaterial = text;

      // Emit an excerpt event after extraction when text is present.
      if (text.trim()) {
        const excerpt = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
        progress.addEvent("excerpt", "extract", excerpt.slice(0, 160));
      }

      const figureChildren = await listFigureChildrenForPdf(db, {
        deckId,
        pdfMaterialId: material.id,
      });
      const readyFigureKeys = figureChildren
        .filter((row) => row.status === "ready")
        .map((row) => row.r2_key);
      const hasUploadingFigures = figureChildren.some(
        (row) => row.status === "uploading",
      );

      const jobModeRow = await db
        .prepare(
          "SELECT figure_extract_mode FROM generation_jobs WHERE id = ?",
        )
        .bind(jobId)
        .first<{ figure_extract_mode: string | null }>();
      const figureExtractMode: FigureExtractMode =
        jobModeRow?.figure_extract_mode === "accurate" ? "accurate" : "fast";

      const willAttemptDocling =
        figureExtractMode === "accurate" &&
        Boolean(env.DOCLING_URL) &&
        readyFigureKeys.length === 0 &&
        !hasUploadingFigures;

      // Soft-continue only when Accurate Docling may still produce figures.
      if (textError && !willAttemptDocling && readyFigureKeys.length === 0) {
        throw textError;
      }

      if (!text.trim()) {
        presentStages = PDF_FIGURE_ONLY_STAGES;
        progress.setPresentStages(presentStages);
      }

      type FigureRef = {
        r2Key: string;
        page?: number;
        caption?: string;
      };
      let figures: FigureRef[] = readyFigureKeys.map((r2Key) => ({ r2Key }));
      let figureWarning: string | undefined;

      // Manual/client crops (ready or still uploading) win over Docling for this PDF.
      if (figures.length === 0 && hasUploadingFigures) {
        figureWarning =
          "Waiting on in-flight figure uploads; skipped Docling for this run";
        console.warn(figureWarning);
      } else if (willAttemptDocling) {
        await progress.emit("figures", 0, 0, "Waking figure extractor…");
        await progress.emit("figures", 0, 0, "Detecting figures…");
        const figureResult = await extractFiguresViaDocling(env, pdfBytes, {
          signal: AbortSignal.timeout(DOCLING_ACCURATE_TIMEOUT_MS),
        });
        if (figureResult.warning) {
          figureWarning = figureResult.warning;
          console.warn(figureResult.warning);
        }
        if (figureResult.crops.length > 0) {
          const persisted = await persistFigureCrops(env, {
            deckId,
            pdfMaterialId: material.id,
            crops: figureResult.crops,
          });
          figures = persisted.map(({ r2Key, crop }) => ({
            r2Key,
            page: crop.page,
            caption: crop.caption,
          }));
        }
      }

      const figureDrafts: Array<CardDraft & { mediaR2Keys?: string[] }> = [];
      if (figures.length > 0) {
        await progress.emit("figures", 0, figures.length, "Processing figures");
        let vision: {
          llm: LlmAdapter;
          apiKey: string;
          provider: string;
        } | null = null;
        if (secret || opts?.llm) {
          vision = secret
            ? await resolveTextLlm(env, secret, opts, (usage) =>
                progress.addUsage(usage),
              )
            : { llm: opts!.llm!, apiKey: "", provider: "mock" };
        } else {
          figureWarning =
            "Skipping PDF figures: vision generation requires an LLM API key.";
          console.warn(figureWarning);
        }
        if (vision) {
          // Mark path for progress (free vs byo) when vision LLM resolved.
          progress.setPath(
            !secret && vision.provider === "workers-ai" ? "free" : "byo",
          );
          for (let i = 0; i < figures.length; i++) {
            const figure = figures[i]!;
            try {
              const figureObject = await env.MATERIALS.get(figure.r2Key);
              if (!figureObject) {
                console.warn(`Figure R2 object missing: ${figure.r2Key}`);
                continue;
              }
              const figureBytes = await figureObject.arrayBuffer();
              if (figureBytes.byteLength > MAX_IMAGE_BYTES) {
                figureWarning = `Skipped oversized figure(s); max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`;
                console.warn(`Skipping oversized PDF figure: ${figure.r2Key}`);
                continue;
              }
              const generated = await vision.llm.generateDrafts({
                text: "",
                apiKey: vision.apiKey,
                provider: vision.provider,
                image: {
                  mimeType: mimeFromR2Key(figure.r2Key),
                  base64: bytesToBase64(figureBytes),
                },
              });
              recordDraftPreviews(progress, "figures", generated);
              const excerpt =
                figure.caption?.trim() || `Figure p.${figure.page ?? "?"}#${i}`;
              const pages =
                figure.page && figure.page >= 1 ? [figure.page] : [];
              figureDrafts.push(
                ...filterDraftsByQuality(generated).map((draft) => ({
                  ...draft,
                  mediaR2Keys: [figure.r2Key],
                  provenance: {
                    pages: pages.length > 0 ? pages : draft.provenance.pages,
                    excerpt: draft.provenance.excerpt?.trim() || excerpt,
                  },
                })),
              );
            } catch (err) {
              console.warn(
                `PDF figure generation failed for ${figure.r2Key}`,
                err,
              );
            } finally {
              await progress.emit(
                "figures",
                i + 1,
                figures.length,
                figureWarning
                  ? `Processing figures (${figureWarning})`
                  : "Processing figures",
              );
            }
          }
        } else {
          await progress.emit(
            "figures",
            figures.length,
            figures.length,
            figureWarning ?? "Processing figures",
          );
        }
      } else {
        await progress.emit(
          "figures",
          0,
          0,
          figureWarning ?? "No figures found",
        );
      }

      let textDrafts: CardDraft[] = [];
      if (text.trim()) {
        textDrafts = await runTextDraftPipeline({
          text,
          env,
          userId: deck.user_id,
          jobId,
          secret,
          opts,
          emit: progress,
          topicHints,
          avoidPatterns,
          emitRulesStage: true,
        });
      }

      drafts = filterDraftsByQuality([...textDrafts, ...figureDrafts]);
      if (drafts.length === 0) {
        if (textError && figureDrafts.length === 0) {
          throw textError;
        }
        throw new Error(
          text.trim()
            ? "No flashcard drafts could be produced from this material."
            : "Extracted material text is empty and no usable figures were found. Upload OCR text or figure crops.",
        );
      }
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await progress.emit("persist", 1, 1, "Saving drafts");
    } else {
      // TEXT_LLM catalog; emit before extract so failures leave progress.
      const progress = makeEmit(db, jobId, TEXT_LLM_STAGES, {
        freeGenCharged,
        startedAt,
      });
      await progress.emit("queued", 0, 0, "Queued");
      await progress.emit("extract", 0, 0, "Extracting material");

      const text = await extractMaterialText(env, material);
      coverageMaterial = text;
      // Emit an excerpt event after extraction.
      if (text.trim()) {
        const excerpt = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
        progress.addEvent("excerpt", "extract", excerpt.slice(0, 160));
      }
      if (!text.trim()) {
        throw new Error("Extracted material text is empty");
      }

      drafts = await runTextDraftPipeline({
        text,
        env,
        userId: deck.user_id,
        jobId,
        secret,
        opts,
        emit: progress,
        topicHints,
        avoidPatterns,
        emitRulesStage: true,
      });
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error(
          "No flashcard drafts could be produced from this material.",
        );
      }
      await progress.emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await progress.emit("persist", 1, 1, "Saving drafts");
    }

    const coverageJson = JSON.stringify(
      buildCoverageLedger(coverageMaterial, drafts),
    );

    const finishedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = ?, finished_at = ? WHERE id = ?",
      )
      .bind("needs_review", coverageJson, finishedAt, jobId)
      .run();
    await recordGenerationUsageEventForJob(db, jobId);
    return "done";
  } catch (err) {
    // Leave last progress_json; only mark status failed.
    const messageText =
      err instanceof Error ? err.message : "Generation failed";
    console.error("generation job failed", jobId, err);
    await markJobFailed(db, jobId, messageText);
    return "done";
  }
}

/** Cloudflare Queues consumer entry for sugarplum-generate. */
export async function handleGenerateQueue(
  batch: MessageBatch<GenerateQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const result = await processGenerateJob(env, msg.body);
    if (result === "busy") {
      msg.retry({ delaySeconds: GENERATE_QUEUE_RETRY_DELAY_SEC });
    } else {
      msg.ack();
    }
  }
}
