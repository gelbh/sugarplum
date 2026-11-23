import {
  cacheGetJson,
  cachePutJson,
} from "../cache/kvJson";
import { sha256Hex } from "../materials/content-hash";
import type { StudyClaim } from "./claims";
import type {
  TypedRegenCardType,
  TypedRegenDraft,
} from "./claim-card-write";
import type { CardDraft } from "./schema";
import { filterDraftsByQuality } from "./quality";

/** Bump to invalidate all claim→card draft cache entries. */
export const CLAIM_CARD_DRAFT_CACHE_PREFIX = "cache:claim-card:v1:" as const;

/**
 * Tied to typed claim→card prompts in card-from-claim-prompts.ts.
 * Bump when those prompts change meaning.
 */
export const CLAIM_CARD_PROMPT_VERSION = "typed-claim-card-v1" as const;

/** Shared TTL for KV draft cache (seconds). */
export const CLAIM_CARD_DRAFT_CACHE_TTL_SECONDS = 86400;

function normalizeField(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalClaim(claim: StudyClaim): Record<string, unknown> {
  const out: Record<string, unknown> = {
    subject: normalizeField(claim.subject),
    predicate: normalizeField(claim.predicate),
    source_span: normalizeField(claim.source_span),
  };
  if (claim.object != null && claim.object.trim()) {
    out.object = normalizeField(claim.object);
  }
  if (claim.qualifiers && claim.qualifiers.length > 0) {
    out.qualifiers = claim.qualifiers
      .map((q) => normalizeField(q))
      .filter(Boolean)
      .sort();
  }
  if (claim.pages && claim.pages.length > 0) {
    out.pages = [...claim.pages].sort((a, b) => a - b);
  }
  return out;
}

export type ClaimCardDraftCacheKeyInput = {
  claim: StudyClaim;
  type: TypedRegenCardType;
  provider: string;
  model: string;
  extraUserSuffix: string;
  promptVersion?: string;
};

export async function claimCardDraftCacheKey(
  input: ClaimCardDraftCacheKeyInput,
): Promise<string> {
  const suffixDigest = await sha256Hex(input.extraUserSuffix);
  const payload = {
    claim: canonicalClaim(input.claim),
    type: input.type,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion ?? CLAIM_CARD_PROMPT_VERSION,
    suffixDigest,
  };
  const hash = await sha256Hex(JSON.stringify(payload));
  return `${CLAIM_CARD_DRAFT_CACHE_PREFIX}${hash}`;
}

function isDraftPayload(raw: unknown): raw is TypedRegenDraft {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    (o.type === "qa" || o.type === "cloze" || o.type === "mcq") &&
    typeof o.front === "string" &&
    typeof o.back === "string" &&
    o.provenance != null &&
    typeof o.provenance === "object"
  );
}

export async function readClaimCardDraft(
  kv: KVNamespace,
  input: ClaimCardDraftCacheKeyInput,
): Promise<TypedRegenDraft | null> {
  const key = await claimCardDraftCacheKey(input);
  const raw = await cacheGetJson<unknown>(kv, key);
  if (!isDraftPayload(raw)) return null;
  if (raw.type !== input.type) return null;
  if (filterDraftsByQuality([raw as CardDraft]).length !== 1) return null;
  return raw;
}

export async function writeClaimCardDraft(
  kv: KVNamespace,
  input: ClaimCardDraftCacheKeyInput,
  draft: TypedRegenDraft,
): Promise<void> {
  const key = await claimCardDraftCacheKey(input);
  await cachePutJson(kv, key, draft, CLAIM_CARD_DRAFT_CACHE_TTL_SECONDS);
}
