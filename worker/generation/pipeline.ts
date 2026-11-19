import {
  CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT,
  CARD_FROM_CLAIM_SYSTEM_PROMPT,
  cardFromClaimCompactUserPrompt,
  cardFromClaimUserPrompt,
} from "./card-from-claim-prompts";
import {
  CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
  CLAIM_EXTRACT_SYSTEM_PROMPT,
  claimExtractCompactUserPrompt,
  claimExtractUserPrompt,
} from "./claim-prompts";
import {
  filterClaimsAgainstChunk,
  parseClaimsPayload,
  type StudyClaim,
} from "./claims";
import { CRITIQUE_SYSTEM_PROMPT, critiqueUserPrompt } from "./critique-prompts";
import {
  appendExtraUserSuffix,
  buildExtraUserSuffix,
  coveredFrontsPromptSuffix,
} from "./feedback-hints";
import {
  isTruncationParseError,
  parseCardsPayload,
  salvageCompleteJsonObjects,
  unwrapLlmJsonText,
  withCompactTruncationRetry,
} from "./llm-json";
import { type LlmAdapter } from "./llm";
import { parseCardDrafts, type CardDraft } from "./schema";

/** Hard cap per generate/critique chunk (~4–6k chars). */
export const CHUNK_CHAR_LIMIT = 5000;

/** Max chunks processed per job (generate+critique each); rest of text is dropped. */
export const MAX_PIPELINE_CHUNKS = 4;

/**
 * LLM used by the pipeline: complete for text extract/write/critique;
 * generateDrafts remains on the adapter for vision (unused by text path).
 */
export type PipelineLlm = LlmAdapter;

export type PipelineProgressEvent = {
  stage: "generate" | "critique";
  current: number;
  total: number;
  label: string;
  /** Completed generate+critique half-steps in 0..2*total (monotonic). */
  halfStepsDone: number;
};

export type RunGenerationPipelineInput = {
  text: string;
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
  /** Optional also-cover topic hints from the generation job. */
  topicHints?: string[];
  /** Optional reject avoid-patterns snapshotted on job regen. */
  avoidPatterns?: string[];
  /** Card fronts already in the deck, plus fronts produced earlier in this run. */
  avoidFronts?: string[];
  /** Best-effort; throws from the callback must not abort the pipeline. */
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
  /** Fired after each chunk's critique (or generate fallback). Best-effort. */
  onChunkDrafts?: (drafts: CardDraft[]) => void | Promise<void>;
};

/**
 * Remove lines claimed by the pre-critique rules harvest (via provenance.excerpt)
 * so the LLM pipeline does not re-see those lines — including ones Layer-1 or
 * critique later drop.
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

function isCardShape(obj: unknown): boolean {
  return (
    !!obj &&
    typeof obj === "object" &&
    "type" in obj &&
    "front" in obj &&
    "back" in obj
  );
}

function unwrapCardsJson(raw: string): unknown {
  const unwrapped = unwrapLlmJsonText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    // Same salvage path as parseCardsPayload: keep complete card objects
    // when the critique reply truncates mid-array.
    const salvaged = [
      ...salvageCompleteJsonObjects(raw),
      ...salvageCompleteJsonObjects(unwrapped),
    ].filter(isCardShape);
    const unique = [
      ...new Map(salvaged.map((c) => [JSON.stringify(c), c])).values(),
    ];
    if (unique.length > 0) return unique;
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

export type CritiqueChunkInput = {
  chunk: string;
  candidates: CardDraft[];
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
  /** From buildExtraUserSuffix; critique passes avoid patterns only. */
  extraUserSuffix?: string;
};

/**
 * Critique one batch against a source chunk. Unparseable/empty after 1 retry → null
 * (caller falls back to the pre-critique candidates).
 */
export async function critiqueChunk(
  args: CritiqueChunkInput,
): Promise<CardDraft[] | null> {
  const { chunk, candidates, llm, apiKey, provider, extraUserSuffix } = args;
  const system = CRITIQUE_SYSTEM_PROMPT;
  const user = appendExtraUserSuffix(
    critiqueUserPrompt(chunk, candidates),
    extraUserSuffix ?? "",
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.complete({ system, user, apiKey, provider });
      return parseCritiqueSurvivors(raw.text);
    } catch {
      // retry once, then fall back
    }
  }
  return null;
}

export type CritiqueDraftsAgainstSourceInput = {
  sourceText: string;
  candidates: CardDraft[];
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
  extraUserSuffix?: string;
};

/**
 * Critique Layer-1 (or generate) candidates against source text.
 * Chunks long source; assigns drafts by excerpt containment.
 * Hard-fail after retries → return the input candidates unchanged.
 */
export async function critiqueDraftsAgainstSource(
  input: CritiqueDraftsAgainstSourceInput,
): Promise<CardDraft[]> {
  const { sourceText, candidates, llm, apiKey, provider, extraUserSuffix } =
    input;
  if (candidates.length === 0) return [];

  const chunks = chunkText(sourceText).slice(0, MAX_PIPELINE_CHUNKS);
  if (chunks.length === 0) return candidates;

  if (chunks.length === 1) {
    const result = await critiqueChunk({
      chunk: chunks[0]!,
      candidates,
      llm,
      apiKey,
      provider,
      extraUserSuffix,
    });
    return result ?? candidates;
  }

  const buckets: CardDraft[][] = chunks.map(() => []);
  const unmatched: CardDraft[] = [];
  for (const draft of candidates) {
    const excerpt = draft.provenance.excerpt.trim();
    let matched = false;
    for (let i = 0; i < chunks.length; i++) {
      if (excerpt && chunks[i]!.includes(excerpt)) {
        buckets[i]!.push(draft);
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(draft);
  }

  const out: CardDraft[] = [...unmatched];
  for (let i = 0; i < chunks.length; i++) {
    const bucket = buckets[i]!;
    if (bucket.length === 0) continue;
    const result = await critiqueChunk({
      chunk: chunks[i]!,
      candidates: bucket,
      llm,
      apiKey,
      provider,
      extraUserSuffix,
    });
    out.push(...(result ?? bucket));
  }
  return out;
}

/**
 * Chunk remainder text → extract claims → write cards → critique (keep/rewrite/drop).
 * Critique unparseable/empty after 1 retry → fall back to schema-valid write drafts.
 * Empty/whitespace text → [] without calling the LLM.
 */
async function safeOnProgress(
  onProgress: RunGenerationPipelineInput["onProgress"],
  event: PipelineProgressEvent,
): Promise<void> {
  if (!onProgress) return;
  try {
    await onProgress(event);
  } catch {
    // Progress must never fail generation.
  }
}

async function safeOnChunkDrafts(
  onChunkDrafts: RunGenerationPipelineInput["onChunkDrafts"],
  drafts: CardDraft[],
): Promise<void> {
  if (!onChunkDrafts) return;
  try {
    await onChunkDrafts(drafts);
  } catch {
    // Progress must never fail generation.
  }
}

type ClaimStageLlm = {
  llm: PipelineLlm;
  apiKey: string;
  provider: string;
};

async function extractClaimsForChunk(
  chunk: string,
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<StudyClaim[]> {
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const completeOnce = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "claims",
    });

  try {
    return await withCompactTruncationRetry(
      async () =>
        filterClaimsAgainstChunk(
          parseClaimsPayload(
            (
              await completeOnce(
                CLAIM_EXTRACT_SYSTEM_PROMPT,
                claimExtractUserPrompt(chunk),
              )
            ).text,
          ),
          chunk,
        ),
      async () =>
        filterClaimsAgainstChunk(
          parseClaimsPayload(
            (
              await completeOnce(
                CLAIM_EXTRACT_COMPACT_SYSTEM_PROMPT,
                claimExtractCompactUserPrompt(chunk),
              )
            ).text,
          ),
          chunk,
        ),
    );
  } catch (err) {
    // Double truncation → empty chunk; other errors (network) must propagate.
    if (isTruncationParseError(err)) return [];
    throw err;
  }
}

function isCardsParseFailure(err: unknown): boolean {
  return (
    err instanceof Error &&
    (/non-JSON/i.test(err.message) ||
      /must be an array or \{\"cards\"/i.test(err.message))
  );
}

async function writeCardsFromClaims(
  claims: StudyClaim[],
  args: ClaimStageLlm & { extraUserSuffix?: string },
): Promise<CardDraft[]> {
  if (claims.length === 0) return [];
  const { llm, apiKey, provider, extraUserSuffix } = args;
  const completeOnce = (system: string, user: string) =>
    llm.complete({
      system,
      user: appendExtraUserSuffix(user, extraUserSuffix ?? ""),
      apiKey,
      provider,
      jsonShape: "cards",
    });

  try {
    return await withCompactTruncationRetry(
      async () =>
        parseCardsPayload(
          (
            await completeOnce(
              CARD_FROM_CLAIM_SYSTEM_PROMPT,
              cardFromClaimUserPrompt(claims),
            )
          ).text,
        ),
      async () =>
        parseCardsPayload(
          (
            await completeOnce(
              CARD_FROM_CLAIM_COMPACT_SYSTEM_PROMPT,
              cardFromClaimCompactUserPrompt(claims),
            )
          ).text,
        ),
    );
  } catch (err) {
    // Double truncation or unparseable → same as empty generate for this chunk.
    if (isTruncationParseError(err) || isCardsParseFailure(err)) return [];
    throw err;
  }
}

export async function runGenerationPipeline(
  input: RunGenerationPipelineInput,
): Promise<CardDraft[]> {
  const {
    text,
    llm,
    apiKey,
    provider,
    topicHints,
    avoidPatterns,
    avoidFronts,
    onProgress,
    onChunkDrafts,
  } = input;
  if (!text.trim()) return [];

  const extractSuffix = buildExtraUserSuffix({ topicHints });
  const writeSuffix = buildExtraUserSuffix({ avoidPatterns });
  const critiqueSuffix = buildExtraUserSuffix({ avoidPatterns });
  const coveredFronts = [...(avoidFronts ?? [])];

  const chunks = chunkText(text).slice(0, MAX_PIPELINE_CHUNKS);
  const total = chunks.length;
  const out: CardDraft[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const chunkLabel = i + 1;
    const report = (
      stage: "generate" | "critique",
      current: number,
      halfStepsDone: number,
      label: string,
    ) =>
      safeOnProgress(onProgress, {
        stage,
        current,
        total,
        halfStepsDone,
        label,
      });

    const chunkTag = `chunk ${chunkLabel}/${total}`;

    await report(
      "generate",
      chunkLabel,
      2 * i,
      `Extracting claims (${chunkTag})`,
    );

    const claims = await extractClaimsForChunk(chunk, {
      llm,
      apiKey,
      provider,
      extraUserSuffix: extractSuffix,
    });

    const coveredSuffix = coveredFrontsPromptSuffix(coveredFronts);
    const writeExtra = [writeSuffix, coveredSuffix].filter(Boolean).join("\n\n");
    const critiqueExtra = [critiqueSuffix, coveredSuffix]
      .filter(Boolean)
      .join("\n\n");

    if (claims.length === 0) {
      // Keep critique half-steps aligned with total even when extract is empty.
      await report(
        "generate",
        chunkLabel,
        2 * i + 1,
        `Writing cards (${chunkTag})`,
      );
      await report(
        "critique",
        chunkLabel,
        2 * i + 1,
        `Critiquing cards (${chunkTag})`,
      );
      await report(
        "critique",
        chunkLabel,
        2 * i + 2,
        `Critiquing cards (${chunkTag})`,
      );
      continue;
    }

    await report(
      "generate",
      chunkLabel,
      2 * i + 1,
      `Writing cards (${chunkTag})`,
    );

    const generated = await writeCardsFromClaims(claims, {
      llm,
      apiKey,
      provider,
      extraUserSuffix: writeExtra,
    });

    if (generated.length === 0) {
      await report(
        "critique",
        chunkLabel,
        2 * i + 1,
        `Critiquing cards (${chunkTag})`,
      );
      await report(
        "critique",
        chunkLabel,
        2 * i + 2,
        `Critiquing cards (${chunkTag})`,
      );
      continue;
    }

    await report(
      "critique",
      chunkLabel,
      2 * i + 1,
      `Critiquing cards (${chunkTag})`,
    );

    const critiqued = await critiqueChunk({
      chunk,
      candidates: generated,
      llm,
      apiKey,
      provider,
      extraUserSuffix: critiqueExtra,
    });

    await report(
      "critique",
      chunkLabel,
      2 * i + 2,
      `Critiquing cards (${chunkTag})`,
    );

    // Critique null (unparseable/empty after retry) → fall back to write drafts.
    const batch = critiqued ?? generated;
    out.push(...batch);
    for (const draft of batch) {
      if (typeof draft.front === "string" && draft.front.trim()) {
        coveredFronts.push(draft.front.trim());
      }
    }
    await safeOnChunkDrafts(onChunkDrafts, batch);
  }

  return out;
}
