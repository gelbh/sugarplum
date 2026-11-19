import { parseCardDrafts, type CardDraft } from "./schema";

/** True when parseCardsPayload (or a wrapped caller) hit mid-JSON truncation. */
export function isTruncationParseError(err: unknown): boolean {
  return err instanceof Error && /truncated mid-JSON/i.test(err.message);
}

/**
 * Run `first`; on mid-JSON truncation parse error only, run `retry` once.
 * Used by Workers AI and BYO generateDrafts text paths.
 */
export async function withCompactTruncationRetry<T>(
  first: () => Promise<T>,
  retry: () => Promise<T>,
): Promise<T> {
  try {
    return await first();
  } catch (err) {
    if (!isTruncationParseError(err)) throw err;
    return await retry();
  }
}

/**
 * Extract JSON text from Workers AI / GLM replies.
 * Handles whole-string fences, embedded fences, and prose around a raw
 * object/array. Does not invent structure when none is present.
 */
export function unwrapLlmJsonText(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return trimmed;

  const wholeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (wholeFence?.[1]) return wholeFence[1].trim();

  const embeddedFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (embeddedFence?.[1]) return embeddedFence[1].trim();

  const startObj = trimmed.indexOf("{");
  const startArr = trimmed.indexOf("[");
  let start = -1;
  if (startObj >= 0 && startArr >= 0) start = Math.min(startObj, startArr);
  else start = Math.max(startObj, startArr);
  if (start < 0) return trimmed;

  const open = trimmed[start]!;
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  if (end > start) return trimmed.slice(start, end + 1).trim();

  return trimmed;
}

/**
 * Pull complete top-level `{...}` values from a truncated JSON array/object
 * body (string-aware). Used when the model hits a completion cap mid-card.
 */
export function salvageCompleteJsonObjects(text: string): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "{") {
      i += 1;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = i; j < text.length; j += 1) {
      const ch = text[j]!;
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) {
      // Unclosed object (truncation): skip this `{` and keep scanning
      // for complete nested objects (e.g. finished cards).
      i += 1;
      continue;
    }
    const slice = text.slice(i, end + 1);
    try {
      out.push(JSON.parse(slice));
    } catch {
      /* skip non-card fragments */
    }
    i = end + 1;
  }
  return out;
}

export function looksLikeTruncatedJson(text: string): boolean {
  const t = text.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (const ch of t) {
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") depth -= 1;
  }
  return inString || depth !== 0;
}

export function parseCardsPayload(content: string): CardDraft[] {
  const unwrapped = unwrapLlmJsonText(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    const isCardShape = (obj: unknown) =>
      !!obj &&
      typeof obj === "object" &&
      "type" in obj &&
      "front" in obj &&
      "back" in obj;
    // Prefer raw text: unwrap's last-`}` slice can clip a truncated payload
    // to an incomplete wrapper and hide complete card objects.
    const salvaged = [
      ...salvageCompleteJsonObjects(content),
      ...salvageCompleteJsonObjects(unwrapped),
    ].filter(isCardShape);
    const unique = [
      ...new Map(salvaged.map((c) => [JSON.stringify(c), c])).values(),
    ];
    if (unique.length > 0) {
      return parseCardDrafts(unique);
    }
    const preview = content.trim().replace(/\s+/g, " ").slice(0, 80);
    if (
      looksLikeTruncatedJson(unwrapped) ||
      looksLikeTruncatedJson(content.trim())
    ) {
      throw new Error(
        preview
          ? `LLM response truncated mid-JSON (preview: ${preview})`
          : "LLM response truncated mid-JSON",
      );
    }
    throw new Error(
      preview
        ? `LLM returned non-JSON content (preview: ${preview})`
        : "LLM returned non-JSON content",
    );
  }

  const cards =
    parsed &&
    typeof parsed === "object" &&
    "cards" in parsed &&
    Array.isArray((parsed as { cards: unknown }).cards)
      ? (parsed as { cards: unknown }).cards
      : Array.isArray(parsed)
        ? parsed
        : null;

  if (!cards) {
    throw new Error('LLM JSON must be an array or {"cards":[...]}');
  }

  return parseCardDrafts(cards);
}
