import type { LlmTokenUsage } from "./llm";

function asUsageInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

/** OpenAI-style `usage` object. */
export function usageFromOpenAiShape(body: unknown): LlmTokenUsage | null {
  if (!body || typeof body !== "object") return null;
  const usage = (body as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const prompt_tokens = asUsageInt(u.prompt_tokens);
  const completion_tokens = asUsageInt(u.completion_tokens);
  let total_tokens = asUsageInt(u.total_tokens);
  if (
    total_tokens == null &&
    (prompt_tokens != null || completion_tokens != null)
  ) {
    total_tokens = (prompt_tokens ?? 0) + (completion_tokens ?? 0);
  }
  if (
    prompt_tokens == null &&
    completion_tokens == null &&
    total_tokens == null
  ) {
    return null;
  }
  return { prompt_tokens, completion_tokens, total_tokens };
}

/** Anthropic Messages `usage` (`input_tokens` / `output_tokens`). */
export function usageFromAnthropicShape(body: unknown): LlmTokenUsage | null {
  if (!body || typeof body !== "object") return null;
  const usage = (body as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const prompt_tokens = asUsageInt(u.input_tokens);
  const completion_tokens = asUsageInt(u.output_tokens);
  if (prompt_tokens == null && completion_tokens == null) return null;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: (prompt_tokens ?? 0) + (completion_tokens ?? 0),
  };
}

/** Google `usageMetadata` token counts. */
export function usageFromGoogleShape(body: unknown): LlmTokenUsage | null {
  if (!body || typeof body !== "object") return null;
  const meta = (body as { usageMetadata?: unknown }).usageMetadata;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const prompt_tokens = asUsageInt(m.promptTokenCount);
  const completion_tokens = asUsageInt(m.candidatesTokenCount);
  let total_tokens = asUsageInt(m.totalTokenCount);
  if (
    total_tokens == null &&
    (prompt_tokens != null || completion_tokens != null)
  ) {
    total_tokens = (prompt_tokens ?? 0) + (completion_tokens ?? 0);
  }
  if (
    prompt_tokens == null &&
    completion_tokens == null &&
    total_tokens == null
  ) {
    return null;
  }
  return { prompt_tokens, completion_tokens, total_tokens };
}
