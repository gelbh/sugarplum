import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
import { MAX_IMAGE_BYTES } from "../materials/limits";
import type { GenerateQueueMessage } from "./enqueue";
import { createLlmAdapter, parseLlmProvider, type LlmAdapter } from "./llm";
import {
  remainderAfterRules,
  runGenerationPipeline,
} from "./pipeline";
import {
  computePercent,
  writeJobProgress,
  type ProgressStage,
} from "./progress";
import { consumeFreeGenSlot } from "./quota";
import { filterDraftsByQuality } from "./quality";
import { harvestRuleDrafts } from "./rules";
import type { CardDraft } from "./schema";
import { createWorkersAiAdapter } from "./workers-ai";

const PRESENT_STAGES = [
  "queued",
  "extract",
  "generate",
  "persist",
] as const satisfies readonly ProgressStage[];

async function emitProgress(
  db: D1Database,
  jobId: string,
  stage: ProgressStage,
  current: number,
  total: number,
  label: string,
): Promise<void> {
  // Best-effort: progress must never flip a successful job to failed.
  try {
    await writeJobProgress(db, jobId, {
      stage,
      current,
      total,
      percent: computePercent(stage, current, total, PRESENT_STAGES),
      label,
    });
  } catch (err) {
    console.error("writeJobProgress failed", jobId, stage, err);
  }
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
 * image → vision generate; text → rules harvest → (optional) LLM pipeline → merge.
 * On failure marks the job failed with an actionable error (does not throw after mark).
 */
export async function processGenerateJob(
  env: Env,
  message: GenerateQueueMessage,
  opts?: ProcessGenerateOptions,
): Promise<void> {
  const db = getDb(env);
  const { jobId, materialId, deckId } = message;

  await db
    .prepare("UPDATE generation_jobs SET status = ?, error = NULL WHERE id = ?")
    .bind("running", jobId)
    .run();

  try {
    await emitProgress(db, jobId, "queued", 0, 0, "Queued");

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

      await emitProgress(db, jobId, "extract", 0, 0, "Loading image");
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
      await emitProgress(
        db,
        jobId,
        "generate",
        0,
        generateTotal,
        "Generating cards",
      );
      drafts = await llm.generateDrafts({
        text: "",
        apiKey,
        provider,
        image: {
          mimeType: mimeFromR2Key(material.r2_key),
          base64: bytesToBase64(bytes),
        },
      });
      await emitProgress(
        db,
        jobId,
        "generate",
        generateTotal,
        generateTotal,
        "Generating cards",
      );
      mediaR2Keys = [material.r2_key];
    } else {
      await emitProgress(db, jobId, "extract", 0, 0, "Extracting material");
      const text = await extractMaterialText(env, material);
      if (!text.trim()) {
        throw new Error("Extracted material text is empty");
      }

      const rulesDrafts = harvestRuleDrafts(text);
      const remainder = remainderAfterRules(text, rulesDrafts);

      let llmDrafts: CardDraft[] = [];

      if (remainder.trim()) {
        const { llm, apiKey, provider } = await resolveTextLlm(
          env,
          secret,
          opts,
        );
        if (!secret) {
          // Charge the attempt before LLM so failures still count toward the cap.
          await consumeFreeGenSlot(env, deck.user_id);
        }

        const generateTotal = 1;
        await emitProgress(
          db,
          jobId,
          "generate",
          0,
          generateTotal,
          "Generating cards",
        );
        llmDrafts = await runGenerationPipeline({
          text: remainder,
          llm,
          apiKey,
          provider,
        });
        await emitProgress(
          db,
          jobId,
          "generate",
          generateTotal,
          generateTotal,
          "Generating cards",
        );
      } else if (rulesDrafts.length === 0) {
        throw new Error(
          "No flashcard drafts could be produced from this material.",
        );
      }

      drafts = mergeAndDedupeDrafts(rulesDrafts, llmDrafts);
    }

    drafts = filterDraftsByQuality(drafts);

    if (drafts.length === 0) {
      throw new Error("Generation produced no valid draft cards");
    }

    await emitProgress(db, jobId, "persist", 0, 1, "Saving drafts");
    await insertDraftCards(db, { deckId, jobId, drafts, mediaR2Keys });
    // Final progress before terminal status so pollers never stop below 100%.
    await emitProgress(db, jobId, "persist", 1, 1, "Saving drafts");

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
