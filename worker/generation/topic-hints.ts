/** Caps for optional generate-time learning-objective / focus topic hints. */
export const MAX_TOPIC_HINTS = 20;
export const MAX_TOPIC_HINT_CHARS = 300;

/**
 * Parse `topicHints` from paste/upload JSON.
 * Strips empties; returns null when absent or empty after strip.
 * Throws with a short message when shape or caps are violated.
 */
export function normalizeTopicHints(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    throw new Error("Invalid topicHints");
  }
  const cleaned: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new Error("Invalid topicHints");
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TOPIC_HINT_CHARS) {
      throw new Error("topicHints entry too long");
    }
    cleaned.push(trimmed);
  }
  if (cleaned.length > MAX_TOPIC_HINTS) {
    throw new Error("Too many topicHints");
  }
  return cleaned.length === 0 ? null : cleaned;
}

/** Parse persisted `topic_hints_json` from a generation job row. */
export function parseTopicHintsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

/** Selected hints first, then existing; case-insensitive dedupe. Default cap is MAX_TOPIC_HINTS. */
export function mergeTopicHints(
  selected: string[],
  existing: string[],
  cap: number = MAX_TOPIC_HINTS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hint of [...selected, ...existing]) {
    const trimmed = hint.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= cap) break;
  }
  return out;
}
