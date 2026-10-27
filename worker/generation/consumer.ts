import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
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
  RULES_ONLY_STAGES,
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

function mimeFromR2Key(r2Key: string): string {
  const lower = r2Key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
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

async function insertDraftCards(
  db: D1Database,
  args: {
    deckId: string;
    jobId: string;
    drafts: CardDraft[];
    mediaR2Keys: string[] | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const mediaJson =
    args.mediaR2Keys && args.mediaR2Keys.length > 0
      ? JSON.stringify(args.mediaR2Keys)
      : null;
  for (const draft of args.drafts) {
    const id = newId();
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
        JSON.stringify(draft.back),
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

    let drafts: CardDraft[];
    let mediaR2Keys: string[] | null = null;

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
      const obj = await env.MATERIALS.get(material.r2_key);
      if (!obj) {
        throw new Error(`R2 object missing: ${material.r2_key}`);
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
          mimeType: mimeFromR2Key(material.r2_key),
          base64: bytesToBase64(bytes),
        },
      });
      await emit("generate", generateTotal, generateTotal, "Generating cards");
      mediaR2Keys = [material.r2_key];
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error("Generation produced no valid draft cards");
      }
      await emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts, mediaR2Keys });
      await emit("persist", 1, 1, "Saving drafts");
    } else {
      // TEXT_LLM catalog until harvest decides; emit before extract so failures leave progress.
      const preHarvest = makeEmit(db, jobId, TEXT_LLM_STAGES);
      await preHarvest("queued", 0, 0, "Queued");
      await preHarvest("extract", 0, 0, "Extracting material");

      const text = await extractMaterialText(env, material);
      if (!text.trim()) {
        throw new Error("Extracted material text is empty");
      }

      const rawRules = harvestRuleDrafts(text);
      const layer1Rules = filterDraftsByQuality(rawRules);
      // Remainder strips pre-critique harvest excerpts so critique drops stay out of LLM.
      const remainder = remainderAfterRules(text, rawRules);

      const needsLlm = Boolean(remainder.trim()) || layer1Rules.length > 0;
      if (!needsLlm) {
        throw new Error(
          "No flashcard drafts could be produced from this material.",
        );
      }

      // Rules critique and/or remainder generate both need LLM stage weights.
      const stages = TEXT_LLM_STAGES;
      const emit = makeEmit(db, jobId, stages);
      await emit("rules", 0, 0, "Harvesting rules");

      const { llm, apiKey, provider } = await resolveTextLlm(
        env,
        secret,
        opts,
      );
      if (!secret) {
        // Charge before LLM (rules critique and/or generate) so failures count.
        await consumeFreeGenSlot(env, deck.user_id);
      }

      // Critique hard-fail → keep Layer-1 survivors only (never raw harvest).
      let critiquedRules = layer1Rules;
      if (layer1Rules.length > 0) {
        critiquedRules = await critiqueDraftsAgainstSource({
          sourceText: text,
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
          onProgress: (e) =>
            emit(e.stage, e.current, e.total, e.label, e.halfStepsDone),
        });
      }

      drafts = mergeAndDedupeDrafts(critiquedRules, llmDrafts);
      drafts = filterDraftsByQuality(drafts);
      if (drafts.length === 0) {
        throw new Error("Generation produced no valid draft cards");
      }
      await emit("persist", 0, 1, "Saving drafts");
      await insertDraftCards(db, { deckId, jobId, drafts, mediaR2Keys });
      await emit("persist", 1, 1, "Saving drafts");
    }

    const covered = drafts.map(
      (d) => d.provenance.excerpt.slice(0, 80) || d.front.slice(0, 80),
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
