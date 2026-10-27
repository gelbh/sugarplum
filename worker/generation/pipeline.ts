import {
  CRITIQUE_SYSTEM_PROMPT,
  critiqueUserPrompt,
} from "./critique-prompts";
import {
  unwrapLlmJsonText,
  type GenerateDraftsInput,
  type LlmAdapter,
} from "./llm";
import { parseCardDrafts, type CardDraft } from "./schema";

/** Hard cap per generate/critique chunk (~4–6k chars). */
export const CHUNK_CHAR_LIMIT = 5000;

/** Max chunks processed per job (generate+critique each); rest of text is dropped. */
export const MAX_PIPELINE_CHUNKS = 4;

/**
 * LLM used by the pipeline: generateDrafts for the create pass,
 * complete for the critique pass (custom system/user prompts).
 */
export type PipelineLlm = LlmAdapter;

export type RunGenerationPipelineInput = {
  text: string;
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
};

/**
 * Remove lines that were harvested by rules (matched via provenance.excerpt)
 * so the LLM pipeline can run on the prose remainder.
 */
export function remainderAfterRules(
  text: string,
  rulesDrafts: CardDraft[],
): string {
  if (rulesDrafts.length === 0) return text;

  const excerpts = new Set(
    rulesDrafts.map((d) => d.provenance.excerpt.trim()).filter(Boolean),
  );

  return text
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !excerpts.has(line) && !excerpts.has(trimmed);
    })
    .join("\n");
}

/** Split text into sequential chunks at or under CHUNK_CHAR_LIMIT. */
export function chunkText(
  text: string,
  limit: number = CHUNK_CHAR_LIMIT,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    // Prefer breaking at a paragraph, then a newline, else hard cut.
    let breakAt =
      window.lastIndexOf("\n\n") >= 0
        ? window.lastIndexOf("\n\n")
        : window.lastIndexOf("\n");
    if (breakAt < limit * 0.4) {
      breakAt = limit;
    }
    const chunk = remaining.slice(0, breakAt).trim();
    if (chunk) chunks.push(chunk);
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function unwrapCardsJson(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapLlmJsonText(raw));
  } catch {
    throw new Error("Critique returned non-JSON content");
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "cards" in parsed &&
    Array.isArray((parsed as { cards: unknown }).cards)
  ) {
    return (parsed as { cards: unknown }).cards;
  }
  if (Array.isArray(parsed)) return parsed;
  throw new Error('Critique JSON must be an array or {"cards":[...]}');
}

function parseCritiqueSurvivors(raw: string): CardDraft[] {
  const cards = unwrapCardsJson(raw);
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error("Critique returned no cards");
  }
  // Validate each card; skip individually invalid survivors.
  const survivors: CardDraft[] = [];
  for (const item of cards) {
    try {
      survivors.push(...parseCardDrafts([item]));
    } catch {
      // drop invalid
    }
  }
  if (survivors.length === 0) {
    throw new Error("Critique returned no schema-valid cards");
  }
  return survivors;
}

async function critiqueChunk(args: {
  chunk: string;
  candidates: CardDraft[];
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
}): Promise<CardDraft[] | null> {
  const { chunk, candidates, llm, apiKey, provider } = args;
  const system = CRITIQUE_SYSTEM_PROMPT;
  const user = critiqueUserPrompt(chunk, candidates);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.complete({ system, user, apiKey, provider });
      return parseCritiqueSurvivors(raw);
    } catch {
      // retry once, then fall back
    }
  }
  return null;
}

/**
 * Chunk remainder text → generate drafts → critique (keep/rewrite/drop).
 * Critique unparseable/empty after 1 retry → fall back to schema-valid generate drafts.
 * Empty/whitespace text → [] without calling the LLM.
 */
export async function runGenerationPipeline(
  input: RunGenerationPipelineInput,
): Promise<CardDraft[]> {
  const { text, llm, apiKey, provider } = input;
  if (!text.trim()) return [];

  const chunks = chunkText(text).slice(0, MAX_PIPELINE_CHUNKS);
  const out: CardDraft[] = [];

  for (const chunk of chunks) {
    const generateInput: GenerateDraftsInput = {
      text: chunk,
      apiKey,
      provider,
    };
    const generated = await llm.generateDrafts(generateInput);
    if (generated.length === 0) continue;

    const critiqued = await critiqueChunk({
      chunk,
      candidates: generated,
      llm,
      apiKey,
      provider,
    });

    out.push(...(critiqued ?? generated));
  }

  return out;
}
