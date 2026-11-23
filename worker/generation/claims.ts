import {
  looksLikeTruncatedJson,
  salvageCompleteJsonObjects,
  unwrapLlmJsonText,
} from "./llm-json";

export type StudyClaim = {
  subject: string;
  predicate: string;
  object?: string;
  qualifiers?: string[];
  source_span: string;
  pages?: number[];
};

/** StudyClaim with a stable id minted at extract time (persisted to D1). */
export type StoredClaim = StudyClaim & { id: string };

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

function isClaimShape(obj: unknown): boolean {
  return (
    !!obj &&
    typeof obj === "object" &&
    "subject" in obj &&
    "predicate" in obj &&
    "source_span" in obj
  );
}

function claimsFromRows(rows: unknown[]): StudyClaim[] {
  const claims: StudyClaim[] = [];
  for (const row of rows) {
    const claim = parseClaimRow(row);
    if (claim) claims.push(claim);
  }
  return claims;
}

/**
 * Parse LLM claim JSON: array or `{"claims":[...]}`.
 * Salvages complete claim objects on truncated JSON; throws mid-JSON truncation
 * when nothing can be salvaged. Other invalid payloads yield [].
 */
export function parseClaimsPayload(text: string): StudyClaim[] {
  const unwrapped = unwrapLlmJsonText(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    // Prefer raw text: unwrap's last-`}` slice can clip a truncated payload
    // and hide complete claim objects.
    const salvaged = [
      ...salvageCompleteJsonObjects(text),
      ...salvageCompleteJsonObjects(unwrapped),
    ].filter(isClaimShape);
    const unique = [
      ...new Map(salvaged.map((c) => [JSON.stringify(c), c])).values(),
    ];
    const claims = claimsFromRows(unique);
    if (claims.length > 0) return claims;

    const preview = text.trim().replace(/\s+/g, " ").slice(0, 80);
    if (
      looksLikeTruncatedJson(unwrapped) ||
      looksLikeTruncatedJson(text.trim())
    ) {
      throw new Error(
        preview
          ? `LLM response truncated mid-JSON (preview: ${preview})`
          : "LLM response truncated mid-JSON",
      );
    }
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
  return claimsFromRows(rows);
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

function spansOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Pick one claim for single-card regen: excerpt match, then front overlap, else first.
 */
export function pickClaimForRegen(
  claims: StudyClaim[],
  opts: { excerpt?: string; previousFront?: string } = {},
): StudyClaim | null {
  if (claims.length === 0) return null;

  const excerpt = opts.excerpt ? normalizeWs(opts.excerpt) : "";
  if (excerpt) {
    const byExcerpt = claims.find((claim) =>
      spansOverlap(normalizeWs(claim.source_span), excerpt),
    );
    if (byExcerpt) return byExcerpt;
  }

  const front = opts.previousFront ? normalizeWs(opts.previousFront) : "";
  if (front) {
    const frontLower = front.toLowerCase();
    const byFront = claims.find((claim) => {
      const subject = normalizeWs(claim.subject).toLowerCase();
      if (subject.length >= 3 && frontLower.includes(subject)) return true;
      return spansOverlap(normalizeWs(claim.source_span), front);
    });
    if (byFront) return byFront;
  }

  return claims[0] ?? null;
}

/** Exact excerpt ↔ source_span join; returns the full stored claim or null. */
export function resolveStoredClaimByExcerpt(
  claims: StoredClaim[],
  excerpt: string,
): StoredClaim | null {
  const needle = normalizeWs(excerpt);
  if (!needle || claims.length === 0) return null;
  return (
    claims.find((claim) => normalizeWs(claim.source_span) === needle) ?? null
  );
}

/**
 * Match a draft provenance excerpt to a buffered claim id.
 * Exact normalized equality only (no substring overlap) so short spans cannot steal joins.
 */
export function matchClaimIdForDraft(
  claims: StoredClaim[],
  excerpt: string,
): string | null {
  return resolveStoredClaimByExcerpt(claims, excerpt)?.id ?? null;
}

type StudyClaimRow = {
  subject: string;
  predicate: string;
  source_span: string;
  object: string | null;
  qualifiers_json: string | null;
  pages_json: string | null;
};

/** Map a study_claims D1 row to StudyClaim (invalid JSON → omit optional fields). */
export function studyClaimFromRow(row: StudyClaimRow): StudyClaim {
  const claim: StudyClaim = {
    subject: row.subject,
    predicate: row.predicate,
    source_span: row.source_span,
  };
  const object = asNonEmptyString(row.object);
  if (object) claim.object = object;

  if (row.qualifiers_json) {
    try {
      const parsed: unknown = JSON.parse(row.qualifiers_json);
      if (Array.isArray(parsed)) {
        const qualifiers = parsed
          .map((q) => asNonEmptyString(q))
          .filter((q): q is string => q !== null);
        if (qualifiers.length > 0) claim.qualifiers = qualifiers;
      }
    } catch {
      // Invalid JSON: leave qualifiers unset.
    }
  }

  if (row.pages_json) {
    try {
      const parsed: unknown = JSON.parse(row.pages_json);
      if (Array.isArray(parsed)) {
        const pages = parsed.filter(
          (p): p is number => typeof p === "number" && Number.isFinite(p),
        );
        if (pages.length > 0) claim.pages = pages;
      }
    } catch {
      // Invalid JSON: leave pages unset.
    }
  }

  return claim;
}
