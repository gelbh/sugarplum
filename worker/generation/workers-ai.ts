import type { Env } from "../env";
import {
  parseCardsPayload,
  userPromptForJson,
  type CompleteInput,
  type GenerateDraftsInput,
  type LlmAdapter,
} from "./llm";
import { GENERATE_SYSTEM_PROMPT } from "./prompts";

/** Free-plan-eligible Workers AI instruct model (locked). */
export const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash" as const;

const CAPACITY_ERROR =
  "Workers AI is temporarily at capacity. " +
  "Add your own API key in Settings for BYO generation, or retry after UTC midnight.";

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

function contentFromAiRun(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new Error("Workers AI returned empty content");
  }

  const choices = (result as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as { message?: { content?: unknown } })
      ?.message;
    const content = message?.content;
    if (typeof content === "string" && content.length > 0) return content;
  }

  // Older text-generation shape used by some Workers AI models.
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string" && response.length > 0) return response;

  throw new Error("Workers AI returned empty content");
}

/**
 * Platform free path: `env.AI` binding, no user API key.
 * Implements generate + complete for the critique pipeline.
 */
export function createWorkersAiAdapter(env: Env): LlmAdapter {
  if (!env.AI) {
    throw new Error("Workers AI binding (env.AI) is not configured");
  }

  async function complete(input: CompleteInput): Promise<string> {
    const { system, user } = input;
    // apiKey ignored: Workers AI uses the binding, not BYO secrets.
    let result: unknown;
    try {
      result = await env.AI!.run(WORKERS_AI_MODEL, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false },
      });
    } catch (err) {
      mapWorkersAiRunError(err);
    }
    return contentFromAiRun(result);
  }

  return {
    complete,
    async generateDrafts(input: GenerateDraftsInput) {
      const content = await complete({
        system: GENERATE_SYSTEM_PROMPT,
        user: userPromptForJson(input.text),
        apiKey: input.apiKey,
        provider: input.provider,
      });
      return parseCardsPayload(content);
    },
  };
}
