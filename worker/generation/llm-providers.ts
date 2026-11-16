/** User-selectable BYO providers (Settings + Secrets). */
export const USER_LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "zai",
] as const;
export type UserLlmProvider = (typeof USER_LLM_PROVIDERS)[number];

/** Z.ai Settings text-model allowlist (vision uses ZAI_VISION_MODEL). */
export const ZAI_TEXT_MODELS = [
  "glm-4.7-flash",
  "glm-4.7-flashx",
  "glm-4.7",
] as const;
export type ZaiTextModel = (typeof ZAI_TEXT_MODELS)[number];
export const ZAI_DEFAULT_TEXT_MODEL: ZaiTextModel = "glm-4.7-flash";
export const ZAI_VISION_MODEL = "glm-4.6v-flash" as const;

function isZaiTextModel(value: string): value is ZaiTextModel {
  return (ZAI_TEXT_MODELS as readonly string[]).includes(value);
}

/** Resolve a zai text model id: blank → default Flash, unknown → null. */
export function resolveZaiTextModel(
  raw: string | null | undefined,
): ZaiTextModel | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return ZAI_DEFAULT_TEXT_MODEL;
  return isZaiTextModel(trimmed) ? trimmed : null;
}

export const BYO_PROVIDERS_PHRASE = "OpenAI, Anthropic, Google, or Z.ai";

/** Includes test fixture + internal platform provider. */
export const LLM_PROVIDERS = [
  ...USER_LLM_PROVIDERS,
  "mock",
  "workers-ai",
] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function isUserLlmProvider(value: string): value is UserLlmProvider {
  return (USER_LLM_PROVIDERS as readonly string[]).includes(value);
}

export function parseLlmProvider(raw: string): LlmProvider {
  const p = raw.trim().toLowerCase();
  if ((LLM_PROVIDERS as readonly string[]).includes(p)) {
    return p as LlmProvider;
  }
  throw new Error(
    `Unsupported LLM provider "${raw.trim()}". Allowed: ${USER_LLM_PROVIDERS.join(", ")}`,
  );
}

/** Absolute request URL for the provider's generate call (tests assert routing). */
export function providerRequestUrl(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "google": {
      const model = "gemini-2.0-flash";
      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    }
    case "zai":
      return "https://api.z.ai/api/paas/v4/chat/completions";
    case "mock":
      throw new Error("mock provider has no network URL");
    case "workers-ai":
      throw new Error("workers-ai uses env.AI binding, not HTTP");
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}
