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
import type { GenerateQueueMessage } from "./enqueue";
import { createLlmAdapter, parseLlmProvider, type LlmAdapter } from "./llm";
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
  writeJobProgress,
  type ProgressStage,
} from "./progress";
import { consumeFreeGenSlot } from "./quota";
import { filterDraftsByQuality } from "./quality";
import { harvestRuleDrafts } from "./rules";
import type { CardDraft } from "./schema";
import { createWorkersAiAdapter } from "./workers-ai";

async function emitProgress(
  db: D1Database,
  jobId: string,
  stage: ProgressStage,
  current: number,
  total: number,
  label: string,
  presentStages: readonly ProgressStage[],
  halfStepsDone?: number,
): Promise<void> {
  // Best-effort: progress must never flip a successful job to failed.
  try {
    const percent =
      halfStepsDone !== undefined &&
      (stage === "generate" || stage === "critique")
        ? computePipelineBandPercent(halfStepsDone, total, presentStages)
        : computePercent(stage, current, total, presentStages);
    await writeJobProgress(db, jobId, {
      stage,
      current,
      total,
      percent,
      label,
    });
  } catch (err) {
    console.error("writeJobProgress failed", jobId, stage, err);
  }
}

function makeEmit(
  db: D1Database,
  jobId: string,
  presentStages: readonly ProgressStage[],
) {
  return (
    stage: ProgressStage,
    current: number,
    total: number,
    label: string,
    halfStepsDone?: number,
  ) =>
    emitProgress(
      db,
      jobId,
      stage,
      current,
      total,
      label,
      presentStages,
      halfStepsDone,
    );
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

/** Merge rules then LLM drafts; drop near-identical fronts (trim + lower). */
export function mergeAndDedupeDrafts(
  rulesDrafts: CardDraft[],
  llmDrafts: CardDraft[],
): CardDraft[] {
  const seen = new Set<string>();
  const out: CardDraft[] = [];
  for (const draft of [...rulesDrafts, ...llmDrafts]) {
    const key = normalizeFront(draft.front);
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

  throw new Error(
    `Unsupported material kind for generation: ${material.kind}`,
  );
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
): Promise<{ llm: LlmAdapter; apiKey: string; provider: string }> {
  if (secret) {
    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }
    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    const llm = opts?.llm ?? createLlmAdapter(provider);
    return { llm, apiKey, provider };
  }

  if (opts?.llm) {
    return { llm: opts.llm, apiKey: "", provider: "workers-ai" };
  }
  if (env.AI) {
    return {
      llm: createWorkersAiAdapter(env),
      apiKey: "",
      provider: "workers-ai",
    };
  }
  throw new Error(
    "Workers AI is not available and no LLM API key is configured. " +
      "Add an OpenAI, Anthropic, or Google API key under Settings, or retry later.",
  );
}

type TextPipelineEmit = (
  stage: ProgressStage,
  current: number,
  total: number,
  label: string,
  halfStepsDone?: number,
) => Promise<void>;

/**
 * Shared text path: harvest → critique Layer-1 → generate remainder → merge.
 * Returns [] when text has nothing harvestable and no remainder for LLM.
 */
async function runTextDraftPipeline(args: {
  text: string;
  env: Env;
  userId: string;
  secret: SecretRow | null;
  opts?: ProcessGenerateOptions;
  emit?: TextPipelineEmit;
  /** Emit rules stage before LLM when using TEXT_LLM_STAGES catalog. */
  emitRulesStage?: boolean;
}): Promise<CardDraft[]> {
  const rawRules = harvestRuleDrafts(args.text);
  const layer1Rules = filterDraftsByQuality(rawRules);
  const remainder = remainderAfterRules(args.text, rawRules);
  const needsLlm = Boolean(remainder.trim()) || layer1Rules.length > 0;
  if (!needsLlm) return [];

  if (args.emitRulesStage && args.emit) {
    await args.emit("rules", 0, 0, "Harvesting rules");
  }

  const { llm, apiKey, provider } = await resolveTextLlm(
    args.env,
    args.secret,
    args.opts,
  );
  if (!args.secret) {
    await consumeFreeGenSlot(args.env, args.userId);
  }

  let critiquedRules = layer1Rules;
  if (layer1Rules.length > 0) {
    critiquedRules = await critiqueDraftsAgainstSource({
      sourceText: args.text,
      candidates: layer1Rules,
      llm,
      apiKey,
      provider,
    });
  }

  let llmDrafts: CardDraft[] = [];
  if (remainder.trim()) {
    llmDrafts = await runGenerationPipeline({
      text: remainder,
      llm,
      apiKey,
      provider,
      onProgress: args.emit
        ? (e) =>
            args.emit!(e.stage, e.current, e.total, e.label, e.halfStepsDone)
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
        ? JSON.stringify({ answer: draft.back, options: draft.options ?? [] })
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
export async function processGenerateJob(
  env: Env,
  message: GenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<void> {
  const db = getDb(env);
  const { jobId, materialId, deckId } = message;

  const claim = await db
    .prepare(
      "UPDATE generation_jobs SET status = ?, error = NULL WHERE id = ? AND status = ?",
    )
    .bind("running", jobId, "queued")
    .run();
  // Duplicate / stale queue delivery: another worker already claimed or finished.
  if (!claim.meta.changes) {
    return;
  }

  try {
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
        "SELECT provider, ciphertext FROM user_secrets WHERE user_id = ?",
      )
      .bind(deck.user_id)
      .first<SecretRow>();

    let drafts: Array<CardDraft & { mediaR2Keys?: string[] | null }>;

    if (material.kind === "image") {
      const emit = makeEmit(db, jobId, IMAGE_STAGES);
      // Vision needs a BYO provider; free Workers AI path is text-only.
      if (!secret && !opts?.llm) {
        throw new Error(
          "Image generation requires an OpenAI, Anthropic, or Google API key under Settings.",
        );
      }
      const wrapKey = env.SECRETS_WRAP_KEY;
      let apiKey = "";
      let provider = "mock";
      let llm: LlmAdapter;
      if (opts?.llm) {
        llm = opts.llm;
      } else {
        if (!secret) {
          throw new Error(
            "Image generation requires an OpenAI, Anthropic, or Google API key under Settings.",
          );
        }
        if (!wrapKey) {
          throw new Error("SECRETS_WRAP_KEY is not configured");
        }
        apiKey = await decryptSecret(secret.ciphertext, wrapKey);
        provider = parseLlmProvider(secret.provider);
        llm = createLlmAdapter(provider);
      }

      await emit("queued", 0, 0, "Queued");
      await emit("extract", 0, 0, "Loading image");
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
      await emit("generate", 0, generateTotal, "Generating cards");
      drafts = await llm.generateDrafts({
        text: "",
        apiKey,
        provider,
        image: {
          mimeType: mimeFromR2Key(imageR2Key),
          base64: bytesToBase64(bytes),
        },
      });
      await emit("generate", generateTotal, generateTotal, "Generating cards");
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error("Generation produced no valid draft cards");
      }
      drafts = drafts.map((d) => ({
        ...d,
        mediaR2Keys: [imageR2Key],
      }));
      await emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await emit("persist", 1, 1, "Saving drafts");
    } else if (material.kind === "pdf") {
      // Start with full PDF catalog; switch to figure-only after extract if no text.
      let presentStages: readonly ProgressStage[] = PDF_STAGES;
      let emit = makeEmit(db, jobId, presentStages);
      await emit("queued", 0, 0, "Queued");
      await emit("extract", 0, 0, "Extracting material");
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

      if (textError && !env.DOCLING_URL && readyFigureKeys.length === 0) {
        throw textError;
      }

      if (!text.trim()) {
        presentStages = PDF_FIGURE_ONLY_STAGES;
        emit = makeEmit(db, jobId, presentStages);
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
      } else if (figures.length === 0 && env.DOCLING_URL) {
        const doclingTimeout = AbortSignal.timeout(60_000);
        const figureResult = await extractFiguresViaDocling(env, pdfBytes, {
          signal: doclingTimeout,
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
        await emit("figures", 0, figures.length, "Processing figures");
        let vision: { llm: LlmAdapter; apiKey: string; provider: string } | null =
          null;
        if (secret || opts?.llm) {
          vision = secret
            ? await resolveTextLlm(env, secret, opts)
            : { llm: opts!.llm!, apiKey: "", provider: "mock" };
        } else {
          figureWarning =
            "Skipping PDF figures: vision generation requires an LLM API key.";
          console.warn(figureWarning);
        }
        if (vision) {
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
              const excerpt =
                figure.caption?.trim() ||
                `Figure p.${figure.page ?? "?"}#${i}`;
              const pages =
                figure.page && figure.page >= 1 ? [figure.page] : [];
              figureDrafts.push(
                ...filterDraftsByQuality(generated).map((draft) => ({
                  ...draft,
                  mediaR2Keys: [figure.r2Key],
                  provenance: {
                    pages: pages.length > 0 ? pages : draft.provenance.pages,
                    excerpt:
                      draft.provenance.excerpt?.trim() || excerpt,
                  },
                })),
              );
            } catch (err) {
              console.warn(`PDF figure generation failed for ${figure.r2Key}`, err);
            } finally {
              await emit(
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
          await emit(
            "figures",
            figures.length,
            figures.length,
            figureWarning ?? "Processing figures",
          );
        }
      } else {
        await emit(
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
          secret,
          opts,
          emit,
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
      await emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await emit("persist", 1, 1, "Saving drafts");
    } else {
      // TEXT_LLM catalog; emit before extract so failures leave progress.
      const emit = makeEmit(db, jobId, TEXT_LLM_STAGES);
      await emit("queued", 0, 0, "Queued");
      await emit("extract", 0, 0, "Extracting material");

      const text = await extractMaterialText(env, material);
      if (!text.trim()) {
        throw new Error("Extracted material text is empty");
      }

      drafts = await runTextDraftPipeline({
        text,
        env,
        userId: deck.user_id,
        secret,
        opts,
        emit,
        emitRulesStage: true,
      });
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error(
          "No flashcard drafts could be produced from this material.",
        );
      }
      await emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts });
      await emit("persist", 1, 1, "Saving drafts");
    }

    const covered = drafts.map(
      (d) => d.front.slice(0, 80) || d.provenance.excerpt.slice(0, 80),
    );
    const coverageJson = JSON.stringify({
      covered,
      gaps: [] as string[],
      draft_count: drafts.length,
    });

    const finishedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE generation_jobs SET status = ?, error = NULL, coverage_json = ?, finished_at = ? WHERE id = ?",
      )
      .bind("needs_review", coverageJson, finishedAt, jobId)
      .run();
  } catch (err) {
    // Leave last progress_json; only mark status failed.
    const messageText =
      err instanceof Error ? err.message : "Generation failed";
    await markJobFailed(db, jobId, messageText);
  }
}

/** Cloudflare Queues consumer entry for sugarplum-generate. */
export async function handleGenerateQueue(
  batch: MessageBatch<GenerateQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    await processGenerateJob(env, msg.body);
    msg.ack();
  }
}
