import type { Env } from "../env";
import {
  parseCardsPayload,
  userPromptForJson,
  withCompactTruncationRetry,
  type CompleteInput,
  type GenerateDraftsInput,
  type LlmAdapter,
} from "./llm";
import {
  GENERATE_COMPACT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  generateCompactUserPrompt,
} from "./prompts";

/** Free-plan-eligible Workers AI instruct model (locked). */
export const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash" as const;

/**
 * Workers AI defaults completion length to 256 when omitted, which truncates
 * multi-card JSON mid-string. GLM docs prefer max_completion_tokens; keep
 * max_tokens as a compatibility alias.
 */
export const WORKERS_AI_MAX_TOKENS = 8192;

const CAPACITY_ERROR =
  "Workers AI is temporarily at capacity. " +
  "Add your own API key in Settings for BYO generation, or retry after UTC midnight.";

type AiRunContent = {
  content: string;
  finishReason: string | null;
  completionTokens: number | null;
};

function isWorkersAiCapacityError(err: unknown): boolean {
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  if (status === 429) return true;

  const msg = (
    err instanceof Error ? err.message : String(err ?? "")
  ).toLowerCase();
  return /rate.?limit|too many requests|capacity|neuron|overloaded|quota/.test(
    msg,
  );
}

function mapWorkersAiRunError(err: unknown): never {
  if (isWorkersAiCapacityError(err)) {
    throw new Error(CAPACITY_ERROR);
  }
  throw err instanceof Error ? err : new Error(String(err));
}

function contentFromAiRun(result: unknown): AiRunContent {
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI returned empty content");
  }

  const usage = (result as { usage?: { completion_tokens?: unknown } }).usage;
  const completionTokens =
    usage && typeof usage.completion_tokens === "number"
      ? usage.completion_tokens
      : null;

  const choices = (result as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = choices[0] as {
      message?: { content?: unknown };
      finish_reason?: unknown;
    };
    const content = choice.message?.content;
    if (typeof content === "string" && content.length > 0) {
      // Keep truncated bodies for generateDrafts salvage. complete() rejects
      // finish_reason length separately so critique does not get mid-JSON.
      return {
        content,
        finishReason:
          typeof choice.finish_reason === "string"
            ? choice.finish_reason
            : null,
        completionTokens,
      };
    }
  }

  // Older text-generation shape used by some Workers AI models.
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string" && response.length > 0) {
    return {
      content: response,
      finishReason: null,
      completionTokens,
    };
  }

  throw new Error("Workers AI returned empty content");
}

function withAiDiagnostics(err: unknown, run: AiRunContent): Error {
  const base =
    err instanceof Error ? err.message : String(err ?? "Generation failed");
  const bits = [`len=${run.content.length}`];
  if (run.finishReason) bits.push(`finish=${run.finishReason}`);
  if (run.completionTokens != null) {
    bits.push(`completion_tokens=${run.completionTokens}`);
  }
  return new Error(`${base} [${bits.join(" ")}]`);
}

/**
 * Platform free path: `env.AI` binding, no user API key.
 * Implements generate + complete for the critique pipeline.
 */
export function createWorkersAiAdapter(env: Env): LlmAdapter {
  if (!env.AI) {
    throw new Error("Workers AI binding (env.AI) is not configured");
  }

  async function runChat(system: string, user: string): Promise<AiRunContent> {
    let result: unknown;
    try {
      result = await env.AI!.run(WORKERS_AI_MODEL, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: WORKERS_AI_MAX_TOKENS,
        max_tokens: WORKERS_AI_MAX_TOKENS,
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false },
      });
    } catch (err) {
      mapWorkersAiRunError(err);
    }
    return contentFromAiRun(result);
  }

  async function complete(input: CompleteInput): Promise<string> {
    // apiKey ignored: Workers AI uses the binding, not BYO secrets.
    const run = await runChat(input.system, input.user);
    if (run.finishReason === "length") {
      throw new Error(
        "Workers AI response truncated (hit token limit). Try a shorter source or fewer facts.",
      );
    }
    return run.content;
  }

  return {
    complete,
    async generateDrafts(input: GenerateDraftsInput) {
      if (input.image) {
        throw new Error(
          "Workers AI free path does not support image generation. Add a BYO API key in Settings.",
        );
      }

      const parseOrThrow = (run: AiRunContent) => {
        try {
          return parseCardsPayload(run.content);
        } catch (err) {
          throw withAiDiagnostics(err, run);
        }
      };

      // One compact retry: live monoxenous failures end mid-first-card with
      // nothing to salvage; a smaller ask often completes within budget.
      return withCompactTruncationRetry(
        async () =>
          parseOrThrow(
            await runChat(
              GENERATE_SYSTEM_PROMPT,
              userPromptForJson(input.text),
            ),
          ),
        async () =>
          parseOrThrow(
            await runChat(
              GENERATE_COMPACT_SYSTEM_PROMPT,
              generateCompactUserPrompt(input.text),
            ),
          ),
      );
    },
  };
}
