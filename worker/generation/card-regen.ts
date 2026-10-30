import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
import {
  BYO_PROVIDERS_PHRASE,
  createLlmAdapter,
  isTruncationParseError,
  parseCardsPayload,
  parseLlmProvider,
  type LlmAdapter,
  type LlmTokenUsage,
} from "./llm";
import { CHUNK_CHAR_LIMIT } from "./pipeline";
import { consumeFreeGenSlot, releaseFreeGenSlot } from "./quota";
import { createWorkersAiAdapter, WorkersAiCapacityError } from "./workers-ai";
import {
  appendExtraUserSuffix,
  buildExtraUserSuffix,
} from "./feedback-hints";
import {
  parseProvenanceJson,
  provenanceExcerptText,
} from "../../src/study/regenSource";
import {
  assertValidMcqOptions,
  type CardDraft,
} from "./schema";

export const REGEN_CARD_TYPES = ["qa", "cloze", "mcq"] as const;
export type RegenCardType = (typeof REGEN_CARD_TYPES)[number];

/** Cap sync regen prompts to one pipeline chunk (job path uses the same limit). */
export function capRegenSourceText(text: string): string {
  if (text.length <= CHUNK_CHAR_LIMIT) return text;
  return text.slice(0, CHUNK_CHAR_LIMIT);
}

type TextRegenDraft = {
  type: RegenCardType;
  front: string;
  back: string;
  options?: string[];
  provenance: CardDraft["provenance"];
};

const REGEN_ONE_SYSTEM_PROMPT = `You regenerate a single spaced-repetition flashcard from study material.

Rules:
- Produce exactly one card of the requested type.
- One atomic fact; keep front/back under ~25 words; provenance.excerpt under ~12 words.
- Only create a card clearly grounded in the source excerpt.
- Cloze front must use exactly one Anki-style blank: {{c1::answer}}. Never multiple blanks.
- Cloze Extra (back) is optional: use "" when unused.
- For type "mcq": front is a single-fact question; back is the correct option (must appear in options); options is a unique array of 3–5 strings including back. Every distractor must be entailed by the cited excerpt.
- Respond with JSON only: {"cards":[{ "type": "qa"|"cloze"|"mcq", "front": string, "back": string, "options"?: string[], "provenance": { "pages": number[], "excerpt": string } }]}
- Do not wrap the array in markdown fences. Finish every string and close all braces.`;

export function regenerateOneUserPrompt(args: {
  text: string;
  type: RegenCardType;
  existingFront?: string;
  studyStruggle?: { again_14d: number; lapses: number };
}): string {
  const prior = args.existingFront?.trim()
    ? `\nPrevious front (adapt or replace): ${args.existingFront.trim()}\n`
    : "";
  const base = `Produce exactly one flashcard of type "${args.type}" from this material.${prior}
--- MATERIAL ---
${args.text}
--- END ---

Respond with JSON only as {"cards":[...]} containing exactly one card of type "${args.type}".`;
  return appendExtraUserSuffix(
    base,
    buildExtraUserSuffix({ studyStruggle: args.studyStruggle }),
  );
}

function parseRegenDraft(raw: string, type: RegenCardType): TextRegenDraft {
  const drafts = parseCardsPayload(raw);
  const hit = drafts.find((d) => d.type === type && typeof d.front === "string");
  if (!hit || typeof hit.front !== "string" || typeof hit.back !== "string") {
    throw new Error(`LLM did not return a ${type} card`);
  }
  const draft: TextRegenDraft = {
    type,
    front: hit.front,
    back: hit.back,
    provenance: hit.provenance,
  };
  return hit.type === "mcq"
    ? { ...draft, ...assertValidMcqOptions(hit.back, hit.options) }
    : draft;
}

function addUsage(
  a: LlmTokenUsage | null | undefined,
  b: LlmTokenUsage | null | undefined,
): LlmTokenUsage | null {
  if (!a) return b ?? null;
  if (!b) return a;
  const sum = (x?: number | null, y?: number | null) =>
    x == null && y == null ? null : (x ?? 0) + (y ?? 0);
  return {
    prompt_tokens: sum(a.prompt_tokens, b.prompt_tokens),
    completion_tokens: sum(a.completion_tokens, b.completion_tokens),
    total_tokens: sum(a.total_tokens, b.total_tokens),
  };
}

/** Narrow sync generate for one card of a requested type. */
export async function generateOneCard(args: {
  text: string;
  type: RegenCardType;
  existingFront?: string;
  studyStruggle?: { again_14d: number; lapses: number };
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
}): Promise<{ draft: TextRegenDraft; usage?: LlmTokenUsage | null }> {
  const user = regenerateOneUserPrompt({
    text: args.text,
    type: args.type,
    existingFront: args.existingFront,
    studyStruggle: args.studyStruggle,
  });
  const ask = (suffix = "") =>
    args.llm.complete({
      system: REGEN_ONE_SYSTEM_PROMPT,
      user: user + suffix,
      apiKey: args.apiKey,
      provider: args.provider,
    });

  const first = await ask();
  try {
    return {
      draft: parseRegenDraft(first.text, args.type),
      usage: first.usage,
    };
  } catch (err) {
    if (isTruncationParseError(err)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const reaskSuffix = `\n\nYour previous reply was rejected: ${message}. Respond with JSON only containing exactly one "${args.type}" card.`;
    let second: Awaited<ReturnType<typeof ask>>;
    try {
      second = await ask(reaskSuffix);
    } catch (reaskErr) {
      // Tokens were spent on the first call, so the caller must not refund.
      if (reaskErr instanceof WorkersAiCapacityError) {
        throw new Error(reaskErr.message);
      }
      throw reaskErr;
    }
    return {
      draft: parseRegenDraft(second.text, args.type),
      usage: addUsage(first.usage, second.usage),
    };
  }
}

type MaterialLite = {
  kind: string;
  r2_key: string | null;
};

async function materialTextFromR2(
  env: Env,
  material: MaterialLite,
): Promise<string> {
  if (!material.r2_key) return "";
  const obj = await env.MATERIALS.get(material.r2_key);
  if (!obj) return "";

  if (material.kind === "paste") {
    return (await obj.text()).trim();
  }
  if (material.kind === "pdf") {
    const bytes = await obj.arrayBuffer();
    return (await extractPdfText(bytes)).trim();
  }
  if (material.kind === "pptx") {
    const bytes = await obj.arrayBuffer();
    return (await extractPptxText(bytes)).trim();
  }
  return "";
}

/** Material R2 text via job, else provenance.excerpt; empty both → "". */
export async function loadCardSourceText(
  env: Env,
  card: { job_id: string | null; provenance_json: string | null },
): Promise<string> {
  if (card.job_id) {
    const db = getDb(env);
    const material = await db
      .prepare(
        `SELECT m.kind, m.r2_key
         FROM generation_jobs j
         INNER JOIN materials m ON m.id = j.material_id
         WHERE j.id = ?`,
      )
      .bind(card.job_id)
      .first<MaterialLite>();
    if (material) {
      try {
        const fromMaterial = await materialTextFromR2(env, material);
        if (fromMaterial.length > 0) return fromMaterial;
      } catch {
        // Fall through to provenance excerpt.
      }
    }
  }
  return provenanceExcerptText(parseProvenanceJson(card.provenance_json));
}

/**
 * Thin fork of consumer `resolveTextLlm` for sync single-card regen (no job
 * emit / usage hooks). Shared extract deferred; keep behavior aligned manually.
 */
export async function resolveRegenLlm(
  env: Env,
  userId: string,
): Promise<{
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
  path: "free" | "byo";
  releaseQuota: () => Promise<void>;
}> {
  const db = getDb(env);
  const secret = await db
    .prepare(
      "SELECT provider, ciphertext, model FROM user_secrets WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ provider: string; ciphertext: string; model: string | null }>();

  if (secret) {
    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }
    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    return {
      llm: createLlmAdapter(provider, { model: secret.model }),
      apiKey,
      provider,
      path: "byo",
      releaseQuota: async () => {},
    };
  }

  if (env.AI) {
    // Same free-path policy as job consumer: reserve a daily slot before AI.run.
    await consumeFreeGenSlot(env, userId);
    return {
      llm: createWorkersAiAdapter(env),
      apiKey: "",
      provider: "workers-ai",
      path: "free",
      releaseQuota: () => releaseFreeGenSlot(env, userId),
    };
  }

  throw new Error(
    "Workers AI is not available and no LLM API key is configured. " +
      `Add an ${BYO_PROVIDERS_PHRASE} API key under Settings, or retry later.`,
  );
}
