/** Parse stored provenance JSON; malformed or missing → null. */
export function parseProvenanceJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Trimmed provenance excerpt, or "" when absent / not a string. */
export function provenanceExcerptText(provenance: unknown): string {
  if (!provenance || typeof provenance !== "object") return "";
  const excerpt = (provenance as { excerpt?: unknown }).excerpt;
  return typeof excerpt === "string" ? excerpt.trim() : "";
}

/**
 * Regen can try material (via job) or the provenance excerpt. Material text is
 * only checked server-side, so a job card may still 422 if its material is empty.
 */
export function cardHasRegenSource(card: {
  job_id?: string | null;
  provenance?: unknown;
}): boolean {
  return Boolean(card.job_id) || provenanceExcerptText(card.provenance) !== "";
}
