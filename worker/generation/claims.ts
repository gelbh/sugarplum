import { unwrapLlmJsonText } from "./llm-json";

export type StudyClaim = {
  subject: string;
  predicate: string;
  object?: string;
  qualifiers?: string[];
  source_span: string;
  pages?: number[];
};

const PRONOUN_SUBJECT = /^(it|they|this|these|those)\b/i;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseClaimRow(raw: unknown): StudyClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const subject = asNonEmptyString(row.subject);
  const predicate = asNonEmptyString(row.predicate);
  const source_span = asNonEmptyString(row.source_span);
  if (!subject || !predicate || !source_span) return null;

  const claim: StudyClaim = { subject, predicate, source_span };

  const object = asNonEmptyString(row.object);
  if (object) claim.object = object;

  if (Array.isArray(row.qualifiers)) {
    const qualifiers = row.qualifiers
      .map((q) => asNonEmptyString(q))
      .filter((q): q is string => q !== null);
    if (qualifiers.length > 0) claim.qualifiers = qualifiers;
  }

  if (Array.isArray(row.pages)) {
    const pages = row.pages.filter(
      (p): p is number => typeof p === "number" && Number.isFinite(p),
    );
    if (pages.length > 0) claim.pages = pages;
  }

  return claim;
}

/**
 * Parse LLM claim JSON: array or `{"claims":[...]}`.
 * Malformed rows are skipped; empty/invalid payloads yield [].
 */
export function parseClaimsPayload(text: string): StudyClaim[] {
  const unwrapped = unwrapLlmJsonText(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return [];
  }

  const rows =
    parsed &&
    typeof parsed === "object" &&
    "claims" in parsed &&
    Array.isArray((parsed as { claims: unknown }).claims)
      ? (parsed as { claims: unknown[] }).claims
      : Array.isArray(parsed)
        ? parsed
        : null;

  if (!rows) return [];

  const claims: StudyClaim[] = [];
  for (const row of rows) {
    const claim = parseClaimRow(row);
    if (claim) claims.push(claim);
  }
  return claims;
}

/**
 * Keep claims with grounded spans in the chunk and non-pronoun subjects.
 */
export function filterClaimsAgainstChunk(
  claims: StudyClaim[],
  chunk: string,
): StudyClaim[] {
  const normalizedChunk = normalizeWs(chunk);
  return claims.filter((claim) => {
    if (!claim.subject || !claim.predicate || !claim.source_span) return false;
    if (PRONOUN_SUBJECT.test(claim.subject)) return false;
    const span = normalizeWs(claim.source_span);
    if (!span) return false;
    return normalizedChunk.includes(span);
  });
}
