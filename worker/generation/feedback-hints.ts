import {
  REJECT_REASON_LABELS,
  type RejectReason,
} from "../../src/lib/rejectReasons";

const MAX_PATTERN_LEN = 80;
const MAX_PATTERNS = 8;

/** Optional generate-prompt suffix when the job has topic hints. */
export function topicHintsPromptSuffix(hints: string[]): string {
  if (hints.length === 0) return "";
  return `You must attempt cards covering each of these topics if grounded in the material; do not invent ungrounded facts: ${hints.join("; ")}.`;
}

/** Build capped avoid-pattern stems from rejected cards; reasoned rejects rank first. */
export function buildAvoidPatternsFromRejected(
  entries: Array<{ front: unknown; reason: RejectReason | null }>,
): string[] {
  const ordered = [...entries].sort(
    (a, b) => Number(!a.reason) - Number(!b.reason),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { front, reason } of ordered) {
    if (typeof front !== "string") continue;
    const trimmed = front.trim();
    if (!trimmed) continue;
    const truncated =
      trimmed.length > MAX_PATTERN_LEN
        ? trimmed.slice(0, MAX_PATTERN_LEN)
        : trimmed;
    const key = truncated.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(
      reason
        ? `${truncated} (reason: ${REJECT_REASON_LABELS[reason].toLowerCase()})`
        : truncated,
    );
    if (out.length >= MAX_PATTERNS) break;
  }
  return out;
}

/** Optional generate/critique suffix when avoid patterns are present. */
export function avoidPatternsPromptSuffix(patterns: string[]): string {
  if (patterns.length === 0) return "";
  return `Avoid near-duplicates of these rejected stems; do not invent ungrounded facts: ${patterns.join("; ")}.`;
}

/** Compact clarity/atomicity nudge when the card has recent Again or lapses. */
export function studyStrugglePromptSuffix(ctx: {
  again_14d: number;
  lapses: number;
}): string {
  if (ctx.again_14d < 1 && ctx.lapses < 1) return "";
  return "This card has been struggling in study. Prefer clearer wording and atomic facts; keep one idea per card.";
}

/** Compose optional user-prompt suffixes in fixed order: topic → avoid → struggle. */
export function buildExtraUserSuffix(parts: {
  topicHints?: string[];
  avoidPatterns?: string[];
  studyStruggle?: { again_14d: number; lapses: number };
}): string {
  const chunks: string[] = [];
  const topic = topicHintsPromptSuffix(parts.topicHints ?? []);
  if (topic) chunks.push(topic);
  const avoid = avoidPatternsPromptSuffix(parts.avoidPatterns ?? []);
  if (avoid) chunks.push(avoid);
  if (parts.studyStruggle) {
    const struggle = studyStrugglePromptSuffix(parts.studyStruggle);
    if (struggle) chunks.push(struggle);
  }
  return chunks.join("\n\n");
}

export function appendExtraUserSuffix(prompt: string, suffix: string): string {
  return suffix ? `${prompt}\n\n${suffix}` : prompt;
}
