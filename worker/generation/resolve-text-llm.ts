import { decryptSecret } from "../crypto/secrets";
import type { Env } from "../env";
import {
  BYO_PROVIDERS_PHRASE,
  createLlmAdapter,
  parseLlmProvider,
  type LlmAdapter,
} from "./llm";
import { createWorkersAiAdapter } from "./workers-ai";

type TextLlmSecret = {
  provider: string;
  ciphertext: string;
  model: string | null;
};

export async function resolveTextLlm(
  env: Env,
  secret: TextLlmSecret | null,
  opts?: { llm?: LlmAdapter },
  onUsage?: (usage: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  }) => void,
): Promise<{ llm: LlmAdapter; apiKey: string; provider: string }> {
  if (secret) {
    const wrapKey = env.SECRETS_WRAP_KEY;
    if (!wrapKey) {
      throw new Error("SECRETS_WRAP_KEY is not configured");
    }
    const apiKey = await decryptSecret(secret.ciphertext, wrapKey);
    const provider = parseLlmProvider(secret.provider);
    const llm =
      opts?.llm ?? createLlmAdapter(provider, { model: secret.model });
    return { llm, apiKey, provider };
  }

  if (opts?.llm) {
    return { llm: opts.llm, apiKey: "", provider: "workers-ai" };
  }
  if (env.AI) {
    return {
      llm: createWorkersAiAdapter(env, { onUsage }),
      apiKey: "",
      provider: "workers-ai",
    };
  }
  throw new Error(
    "Workers AI is not available and no LLM API key is configured. " +
      `Add an ${BYO_PROVIDERS_PHRASE} API key under Settings, or retry later.`,
  );
}
