import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
import type { GenerateQueueMessage } from "./enqueue";
import { createLlmAdapter, parseLlmProvider, type LlmAdapter } from "./llm";
import type { CardDraft } from "./schema";

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
  /** Override LLM (tests). Default: createLlmAdapter(provider). */
  llm?: LlmAdapter;
};

function newId(): string {
  return crypto.randomUUID();
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

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]!);
  }
  return btoa(binary);
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
 * Process one generate queue message: extract → LLM → draft cards → needs_review.
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

    if (!secret) {
      throw new Error(
        "No LLM API key configured. Save a key under Settings before generating.",
      );
    }

    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }

    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    const llm = opts?.llm ?? createLlmAdapter(provider);

    let drafts: CardDraft[];
    let mediaR2Keys: string[] | null = null;

    if (material.kind === "image") {
      if (!material.r2_key) {
        throw new Error("Image material has no R2 object");
      }
      const obj = await env.MATERIALS.get(material.r2_key);
      if (!obj) {
        throw new Error(`R2 object missing: ${material.r2_key}`);
      }
      const bytes = await obj.arrayBuffer();
      drafts = await llm.generateDrafts({
        text: "",
        apiKey,
        provider,
        image: {
          mimeType: mimeFromR2Key(material.r2_key),
          base64: bytesToBase64(bytes),
        },
      });
      mediaR2Keys = [material.r2_key];
    } else {
      const text = await extractMaterialText(env, material);
      if (!text.trim()) {
        throw new Error("Extracted material text is empty");
      }
      drafts = await llm.generateDrafts({
        text,
        apiKey,
        provider,
      });
    }

    await insertDraftCards(db, { deckId, jobId, drafts, mediaR2Keys });

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
