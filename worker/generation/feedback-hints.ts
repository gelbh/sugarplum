const MAX_PATTERN_LEN = 80;
const MAX_PATTERNS = 8;

/** Build capped avoid-pattern stems from rejected card fronts. */
export function buildAvoidPatternsFromRejectedFronts(
  fronts: unknown[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const front of fronts) {
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
    out.push(truncated);
    if (out.length >= MAX_PATTERNS) break;
  }
  return out;
}

/** Optional generate/critique suffix when avoid patterns are present. */
export function avoidPatternsPromptSuffix(patterns: string[]): string {
  if (patterns.length === 0) return "";
  return `Avoid near-duplicates of these rejected stems; do not invent ungrounded facts: ${patterns.join("; ")}.`;
}

/** Append avoid-patterns instruction when patterns are present. */
export function appendAvoidPatternsSuffix(
  prompt: string,
  patterns: string[],
): string {
  const suffix = avoidPatternsPromptSuffix(patterns);
  return suffix ? `${prompt}\n\n${suffix}` : prompt;
}

/** Compact clarity/atomicity nudge when the card has recent Again or lapses. */
export function studyStrugglePromptSuffix(ctx: {
  again_14d: number;
  lapses: number;
}): string {
  if (ctx.again_14d < 1 && ctx.lapses < 1) return "";
  return "This card has been struggling in study. Prefer clearer wording and atomic facts; keep one idea per card.";
}
