import type { Env } from "../env";
import { getDb } from "../db/client";
import { decryptSecret } from "../crypto/secrets";
import { extractPptxText } from "../materials/extract-pptx";
import { pdfTextOrOcrSidecar, readOcrSidecar } from "../materials/ocr-sidecar";
import {
  addUsage,
  extractClaimsForChunk,
  writeOneCardFromClaim,
  type TypedRegenDraft,
} from "./claim-stages";
import { pickClaimForRegen } from "./claims";
import {
  BYO_PROVIDERS_PHRASE,
  createLlmAdapter,
  parseLlmProvider,
  type LlmAdapter,
  type LlmTokenUsage,
} from "./llm";
import { CHUNK_CHAR_LIMIT } from "./pipeline";
import { filterDraftsByQuality } from "./quality";
import { consumeFreeGenSlot } from "./quota";
import {
  createWorkersAiAdapter,
  WorkersAiCapacityError,
} from "./workers-ai";
import { buildExtraUserSuffix } from "./feedback-hints";
import {
  parseProvenanceJson,
  provenanceExcerptText,
} from "../../src/study/regenSource";
import type { CardDraft } from "./schema";

/** Sync regen failed without updating the card (HTTP 422). */
export class ClaimAwareRegenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimAwareRegenError";
  }
}

export const REGEN_CARD_TYPES = ["qa", "cloze", "mcq"] as const;
export type RegenCardType = (typeof REGEN_CARD_TYPES)[number];

/** Cap sync regen prompts to one pipeline chunk (job path uses the same limit). */
export function capRegenSourceText(text: string): string {
  if (text.length <= CHUNK_CHAR_LIMIT) return text;
  return text.slice(0, CHUNK_CHAR_LIMIT);
}

/**
 * Prefer provenance excerpt as extract corpus; else capped material.
 * Claim-aware regen must not prefer full material when an excerpt exists.
 */
export function resolveRegenCorpus(args: {
  excerpt: string;
  materialText: string;
}): string {
  const excerpt = args.excerpt.trim();
  if (excerpt.length > 0) return capRegenSourceText(excerpt);
  return capRegenSourceText(args.materialText);
}

/**
 * Claim-aware single-card regen: excerpt-first extract → pick → typed write → Layer-1.
 * Throws ClaimAwareRegenError when no claim or quality fails after one reask.
 */
export async function regenerateClaimAwareCard(args: {
  excerpt: string;
  materialText: string;
  type: RegenCardType;
  existingFront?: string;
  studyStruggle?: { again_14d: number; lapses: number };
  llm: LlmAdapter;
  apiKey: string;
  provider: string;
}): Promise<{ draft: TypedRegenDraft; usage: LlmTokenUsage | null }> {
  const corpus = resolveRegenCorpus({
    excerpt: args.excerpt,
    materialText: args.materialText,
  });
  if (!corpus.trim()) {
    throw new ClaimAwareRegenError(
      "No source text available for this card. Edit manually or regenerate from material with text.",
    );
  }

  const struggleSuffix = buildExtraUserSuffix({
    studyStruggle: args.studyStruggle,
  });

  let usage: LlmTokenUsage | null = null;
  let completedCalls = 0;
  const trackingLlm: LlmAdapter = {
    complete: async (input) => {
      try {
        const result = await args.llm.complete(input);
        completedCalls += 1;
        usage = addUsage(usage, result.usage);
        return result;
      } catch (err) {
        // Prior successful calls already spent the free slot; do not refund.
        if (err instanceof WorkersAiCapacityError && completedCalls > 0) {
          throw new Error(err.message);
        }
        throw err;
      }
    },
    generateDrafts: (input) => args.llm.generateDrafts(input),
  };
  const stageArgs = {
    llm: trackingLlm,
    apiKey: args.apiKey,
    provider: args.provider,
    extraUserSuffix: struggleSuffix,
  };

  const claims = await extractClaimsForChunk(corpus, stageArgs);
  const claim = pickClaimForRegen(claims, {
    excerpt: args.excerpt,
    previousFront: args.existingFront,
  });
  if (!claim) {
    throw new ClaimAwareRegenError(
      "Could not extract an atomic claim from the source. Edit the card manually or try different material.",
    );
  }

  let written = await writeOneCardFromClaim(claim, args.type, stageArgs);
  let ok =
    filterDraftsByQuality([written.draft as CardDraft]).length === 1
      ? written.draft
      : null;

  if (!ok) {
    const qualityHint =
      "Previous card failed quality gates (too long, compound, or essay). Write a shorter single-fact card.";
    const qualitySuffix = [struggleSuffix, qualityHint]
      .filter(Boolean)
      .join("\n\n");
    written = await writeOneCardFromClaim(claim, args.type, {
      ...stageArgs,
      extraUserSuffix: qualitySuffix,
    });
    ok =
      filterDraftsByQuality([written.draft as CardDraft]).length === 1
        ? written.draft
        : null;
  }

  if (!ok) {
    throw new ClaimAwareRegenError(
      "Regenerated card failed quality gates. Edit manually or try again.",
    );
  }

  return { draft: ok, usage };
}

type MaterialLite = {
  id: string;
  deck_id: string;
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
    return pdfTextOrOcrSidecar(bytes, () =>
      readOcrSidecar(env, material.deck_id, material.id),
    );
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
        `SELECT m.id, m.deck_id, m.kind, m.r2_key
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
    return {
      llm: createWorkersAiAdapter(env),
      apiKey: "",
      provider: "workers-ai",
      path: "free",
      releaseQuota: await consumeFreeGenSlot(env, userId),
    };
  }

  throw new Error(
    "Workers AI is not available and no LLM API key is configured. " +
      `Add an ${BYO_PROVIDERS_PHRASE} API key under Settings, or retry later.`,
  );
}
