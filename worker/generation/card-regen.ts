import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPdfText } from "../materials/extract-pdf";
import { extractPptxText } from "../materials/extract-pptx";
import {
  createLlmAdapter,
  parseCardsPayload,
  parseLlmProvider,
  type LlmAdapter,
} from "./llm";
import { createWorkersAiAdapter } from "./workers-ai";
import {
  assertValidMcqOptions,
  type CardDraft,
} from "./schema";

export const REGEN_CARD_TYPES = ["qa", "cloze", "mcq"] as const;
export type RegenCardType = (typeof REGEN_CARD_TYPES)[number];

type TextRegenDraft = Extract<
  CardDraft,
  { type: "qa" | "cloze" | "mcq" | "image_label" | "diagram" }
>;

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
}): string {
  const prior = args.existingFront?.trim()
    ? `\nPrevious front (adapt or replace): ${args.existingFront.trim()}\n`
    : "";
  return `Produce exactly one flashcard of type "${args.type}" from this material.${prior}
--- MATERIAL ---
${args.text}
--- END ---

Respond with JSON only as {"cards":[...]} containing exactly one card of type "${args.type}".`;
}

/** Narrow sync generate for one card of a requested type. */
export async function generateOneCard(args: {
  text: string;
  type: RegenCardType;
  existingFront?: string;
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
}): Promise<TextRegenDraft> {
  const raw = await args.llm.complete({
    system: REGEN_ONE_SYSTEM_PROMPT,
    user: regenerateOneUserPrompt({
      text: args.text,
      type: args.type,
      existingFront: args.existingFront,
    }),
    apiKey: args.apiKey,
    provider: args.provider,
  });
  const drafts = parseCardsPayload(raw);
  const match = drafts.find(
    (d): d is TextRegenDraft =>
      d.type === args.type && typeof d.front === "string",
  );
  if (!match) {
    throw new Error(`LLM did not return a ${args.type} card`);
  }
  if (match.type === "mcq") {
    assertValidMcqOptions(match.back, match.options);
  }
  return match;
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

function provenanceExcerpt(provenanceJson: string | null): string {
  if (!provenanceJson) return "";
  try {
    const parsed = JSON.parse(provenanceJson) as { excerpt?: unknown };
    return typeof parsed.excerpt === "string" ? parsed.excerpt.trim() : "";
  } catch {
    return "";
  }
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
  return provenanceExcerpt(card.provenance_json);
}

export async function resolveRegenLlm(
  env: Env,
  userId: string,
): Promise<{ llm: LlmAdapter; apiKey: string; provider: string }> {
  const db = getDb(env);
  const secret = await db
    .prepare(
      "SELECT provider, ciphertext FROM user_secrets WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ provider: string; ciphertext: string }>();

  if (secret) {
    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }
    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    return { llm: createLlmAdapter(provider), apiKey, provider };
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
