import type { Env } from "../env";
import type { EmbedTextsFn } from "./claim-dedupe";

/** Small English embedding model for in-job claim paraphrase merge. */
export const WORKERS_AI_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5" as const;

type EmbedResponse = {
  data?: number[][];
  shape?: number[];
};

/**
 * Batch-embed texts via Workers AI. Returns null on empty input, shape mismatch,
 * or any AI error (callers fail-open).
 */
export function createWorkersAiEmbedTexts(env: Env): EmbedTextsFn {
  return async (texts: string[]) => {
    if (texts.length === 0) return [];
    if (!env.AI) return null;
    try {
      const raw = (await env.AI.run(WORKERS_AI_EMBED_MODEL, {
        text: texts,
      })) as EmbedResponse;
      const data = raw?.data;
      if (!Array.isArray(data) || data.length !== texts.length) return null;
      if (!data.every((row) => Array.isArray(row) && row.length > 0)) {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  };
}
