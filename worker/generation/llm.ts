import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiJsonSchemaResponseFormat,
} from "./cards-json-schema";
import { parseCardDrafts, type CardDraft } from "./schema";
import { appendExtraUserSuffix } from "./feedback-hints";
import {
  isTruncationParseError,
  parseCardsPayload,
  salvageCompleteJsonObjects,
  unwrapLlmJsonText,
  withCompactTruncationRetry,
} from "./llm-json";
import {
  ZAI_DEFAULT_TEXT_MODEL,
  ZAI_VISION_MODEL,
  parseLlmProvider,
  providerRequestUrl,
  resolveZaiTextModel,
  type UserLlmProvider,
  type ZaiTextModel,
} from "./llm-providers";
import {
  usageFromAnthropicShape,
  usageFromGoogleShape,
  usageFromOpenAiShape,
} from "./llm-usage";
import {
  GENERATE_COMPACT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  generateCompactUserPrompt,
  imagePromptForJson,
  systemPromptForGenerateDrafts,
  userPromptForJson,
} from "./prompts";

export { userPromptForJson };

export {
  isTruncationParseError,
  parseCardsPayload,
  salvageCompleteJsonObjects,
  unwrapLlmJsonText,
  withCompactTruncationRetry,
};

export {
  BYO_PROVIDERS_PHRASE,
  LLM_PROVIDERS,
  USER_LLM_PROVIDERS,
  ZAI_DEFAULT_TEXT_MODEL,
  ZAI_TEXT_MODELS,
  ZAI_VISION_MODEL,
  isUserLlmProvider,
  parseLlmProvider,
  providerRequestUrl,
  resolveZaiTextModel,
  type LlmProvider,
  type UserLlmProvider,
  type ZaiTextModel,
} from "./llm-providers";

export {
  usageFromAnthropicShape,
  usageFromGoogleShape,
  usageFromOpenAiShape,
} from "./llm-usage";

/** Same multi-card JSON headroom as the Workers AI free path. */
const ZAI_MAX_TOKENS = 8192;

export type GenerateImageInput = {
  mimeType: string;
  base64: string;
};

export type GenerateDraftsInput = {
  text: string;
  apiKey: string;
  provider: string;
  /** When set, run vision/image card generation instead of text Q&A/cloze. */
  image?: GenerateImageInput;
  /** Material R2 key for vision; required in prompts and occlusion fronts. */
  imageKey?: string;
  /** Precomposed topic/avoid/struggle user-prompt suffix. */
  extraUserSuffix?: string;
};

export type CompleteInput = {
  system: string;
  user: string;
  apiKey: string;
  provider: string;
};

/** Best-effort token counts from a provider response (nulls when silent). */
export type LlmTokenUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
};

export type CompleteResult = {
  text: string;
  usage?: LlmTokenUsage | null;
};

/** Flashcard generate + freeform complete (critique / custom prompts). */
export type LlmAdapter = {
  generateDrafts(input: GenerateDraftsInput): Promise<CardDraft[]>;
  complete(input: CompleteInput): Promise<CompleteResult>;
};

/** Text generate: full prompt, then one compact retry on mid-JSON truncation. */
async function generateTextDraftsWithCompactRetry(
  text: string,
  completeOnce: (system: string, user: string) => Promise<CompleteResult>,
  extraUserSuffix = "",
): Promise<CardDraft[]> {
  return withCompactTruncationRetry(
    async () =>
      parseCardsPayload(
        (
          await completeOnce(
            GENERATE_SYSTEM_PROMPT,
            appendExtraUserSuffix(userPromptForJson(text), extraUserSuffix),
          )
        ).text,
      ),
    async () =>
      parseCardsPayload(
        (
          await completeOnce(
            GENERATE_COMPACT_SYSTEM_PROMPT,
            appendExtraUserSuffix(
              generateCompactUserPrompt(text),
              extraUserSuffix,
            ),
          )
        ).text,
      ),
  );
}

/** Fixed drafts for tests (no network). */
export function mockLlmAdapter(): LlmAdapter {
  const textDrafts = (text: string): CardDraft[] => {
    const excerpt = text.slice(0, 120) || "source excerpt";
    return parseCardDrafts([
      {
        type: "qa",
        front: "What is the primary topic of these notes?",
        back: "The material's main subject as stated in the source.",
        provenance: { pages: [1], excerpt },
      },
      {
        type: "qa",
        front: "Name one key fact from the material?",
        back: "A concrete detail drawn from the excerpt.",
        provenance: { pages: [1], excerpt },
      },
      {
        type: "cloze",
        front: "A key term in these notes is {{c1::concept}}.",
        back: "concept",
        provenance: { pages: [1], excerpt },
      },
    ]);
  };

  return {
    async generateDrafts({ text, image, imageKey }) {
      if (image) {
        const key = imageKey ?? "materials/mock/image.png";
        return parseCardDrafts([
          {
            type: "occlusion",
            front: {
              image_key: key,
              prompt: "Identify the hidden region",
              regions: [
                {
                  id: "r1",
                  x: 0.12,
                  y: 0.18,
                  w: 0.28,
                  h: 0.22,
                  label: "Structure A",
                },
                {
                  id: "r2",
                  x: 0.55,
                  y: 0.4,
                  w: 0.2,
                  h: 0.16,
                  label: "Structure B",
                },
              ],
              mode: "hide_one",
            },
            back: { answer: "Structure A" },
            provenance: {
              pages: [1],
              excerpt: "labelled structures in image",
            },
            media_keys: [key],
          },
          {
            type: "image_label",
            front: "What structure is highlighted in this image?",
            back: "The labelled anatomical or diagram structure.",
            provenance: {
              pages: [1],
              excerpt: "image region under study",
            },
          },
          {
            type: "diagram",
            front: "How do the labelled parts relate spatially?",
            back: "Describe the adjacency or flow shown in the diagram.",
            provenance: {
              pages: [1],
              excerpt: "diagram spatial relation",
            },
          },
        ]);
      }
      return textDrafts(text);
    },
    async complete({ system, user }) {
      const s = system.toLowerCase();
      // Claim extract: return grounded claims so the text pipeline can write cards.
      if (s.includes("extract") && s.includes("claim")) {
        const start = user.indexOf("--- MATERIAL ---");
        const end = user.indexOf("--- END ---");
        const material =
          start >= 0 && end > start
            ? user.slice(start + "--- MATERIAL ---".length, end).trim()
            : user.trim();
        const span = material.slice(0, Math.min(80, material.length));
        if (!span) {
          return { text: JSON.stringify({ claims: [] }), usage: null };
        }
        return {
          text: JSON.stringify({
            claims: [
              {
                subject: "Notes",
                predicate: "state the primary topic",
                source_span: span,
                pages: [1],
              },
              {
                subject: "Material",
                predicate: "includes a key fact",
                source_span: span,
                pages: [1],
              },
              {
                subject: "Source",
                predicate: "mentions a key term",
                object: "concept",
                source_span: span,
                pages: [1],
              },
            ],
          }),
          usage: null,
        };
      }
      // Write + critique (+ unknown): fixed 3-card set for consumer/pipeline tests.
      return {
        text: JSON.stringify({
          cards: textDrafts("mock critique excerpt"),
        }),
        usage: null,
      };
    },
  };
}

async function readErrorDetail(res: Response): Promise<string> {
  const detail = await res.text().catch(() => "");
  return detail ? `: ${detail.slice(0, 200)}` : "";
}

const PROVIDER_LABEL: Record<UserLlmProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  zai: "Z.ai",
};
/** 529 is Anthropic "overloaded". */
const TRANSIENT_STATUSES = new Set([429, 503, 529]);
// ponytail: body heuristic; an unrecognised quota message costs ~7s of retries before the friendly error.
const QUOTA_PATTERN =
  /insufficient|balance|quota|billing|recharge|expired|subscription|resets? at|will reset/i;
const BACKOFF_MS = [2000, 5000];
const MAX_RETRY_AFTER_MS = 10_000;

function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    : null;
}

const FORMAT_REJECTION = /response_format|json_schema/i;

async function postLlm(
  provider: UserLlmProvider,
  url: string,
  init: RequestInit,
  fallbackInit?: RequestInit,
): Promise<Response> {
  let request = init;
  let formatFallback = fallbackInit;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, request);
    if (res.ok) return res;
    const detail = await readErrorDetail(res);
    if (
      formatFallback &&
      res.status === 400 &&
      FORMAT_REJECTION.test(detail)
    ) {
      request = formatFallback;
      formatFallback = undefined;
      // A format rejection starts a fresh transient budget on the fallback body.
      attempt = -1;
      continue;
    }
    if (!TRANSIENT_STATUSES.has(res.status) || QUOTA_PATTERN.test(detail)) {
      throw new Error(`LLM request failed (${res.status})${detail}`);
    }
    if (attempt >= BACKOFF_MS.length) {
      console.warn("LLM overloaded after retries", provider, res.status, detail);
      throw new Error(
        `${PROVIDER_LABEL[provider]} is overloaded right now. Wait a minute and try again, or switch provider in Settings.`,
      );
    }
    const wait = retryAfterMs(res) ?? BACKOFF_MS[attempt]!;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function openAiCompatibleAdapter(opts: {
  provider: "openai" | "zai";
  requestUrl: string;
  textModel: string;
  visionModel: string;
  /** Z.ai rejects `response_format` on vision models (text models only). */
  visionJsonMode: boolean;
  /** OpenAI text calls. Z.ai stays on json_object. */
  jsonSchema?: boolean;
  extraBody?: Record<string, unknown>;
}): LlmAdapter {
  const {
    provider,
    requestUrl,
    textModel,
    visionModel,
    visionJsonMode,
    jsonSchema = false,
    extraBody,
  } = opts;

  async function complete({ system, user, apiKey }: CompleteInput) {
    const textInit = (responseFormat: unknown): RequestInit => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...extraBody,
        model: textModel,
        temperature: 0.3,
        response_format: responseFormat,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const res = await postLlm(
      provider,
      requestUrl,
      textInit(
        jsonSchema
          ? openAiJsonSchemaResponseFormat()
          : JSON_OBJECT_RESPONSE_FORMAT,
      ),
      jsonSchema ? textInit(JSON_OBJECT_RESPONSE_FORMAT) : undefined,
    );

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty content");
    return { text: content, usage: usageFromOpenAiShape(body) };
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        return generateTextDraftsWithCompactRetry(
          text,
          (system, user) =>
            complete({
              system,
              user,
              apiKey,
              provider: input.provider,
            }),
          input.extraUserSuffix ?? "",
        );
      }

      const imageKey = input.imageKey ?? "material";
      const res = await postLlm(provider, requestUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...extraBody,
          model: visionModel,
          temperature: 0.3,
          ...(visionJsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
          messages: [
            { role: "system", content: systemPromptForGenerateDrafts(input) },
            {
              role: "user",
              content: [
                { type: "text", text: imagePromptForJson(imageKey) },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${image.mimeType};base64,${image.base64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned empty content");
      return parseCardsPayload(content);
    },
  };
}

function openAiAdapter(): LlmAdapter {
  return openAiCompatibleAdapter({
    provider: "openai",
    requestUrl: providerRequestUrl("openai"),
    textModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    visionJsonMode: true,
    jsonSchema: true,
  });
}

function zaiAdapter(textModel: ZaiTextModel): LlmAdapter {
  return openAiCompatibleAdapter({
    provider: "zai",
    requestUrl: providerRequestUrl("zai"),
    textModel,
    visionModel: ZAI_VISION_MODEL,
    visionJsonMode: false,
    // GLM-4.7 thinks compulsorily unless disabled; default output cap is 65k.
    extraBody: {
      thinking: { type: "disabled" },
      max_tokens: ZAI_MAX_TOKENS,
    },
  });
}

function anthropicAdapter(): LlmAdapter {
  async function complete({ system, user, apiKey }: CompleteInput) {
    const url = providerRequestUrl("anthropic");
    const res = await postLlm("anthropic", url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 4096,
        temperature: 0.3,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const body = (await res.json()) as {
      content?: { type?: string; text?: string }[];
    };
    const textBlock = body.content?.find((b) => b.type === "text");
    const content = textBlock?.text;
    if (!content) throw new Error("LLM returned empty content");
    return { text: content, usage: usageFromAnthropicShape(body) };
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        return generateTextDraftsWithCompactRetry(
          text,
          (system, user) =>
            complete({
              system,
              user,
              apiKey,
              provider: input.provider,
            }),
          input.extraUserSuffix ?? "",
        );
      }

      const imageKey = input.imageKey ?? "material";
      const url = providerRequestUrl("anthropic");
      const res = await postLlm("anthropic", url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 4096,
          temperature: 0.3,
          system: systemPromptForGenerateDrafts(input),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mimeType,
                    data: image.base64,
                  },
                },
                { type: "text", text: imagePromptForJson(imageKey) },
              ],
            },
          ],
        }),
      });

      const body = (await res.json()) as {
        content?: { type?: string; text?: string }[];
      };
      const textBlock = body.content?.find((b) => b.type === "text");
      const content = textBlock?.text;
      if (!content) throw new Error("LLM returned empty content");
      return parseCardsPayload(content);
    },
  };
}

function googleAdapter(): LlmAdapter {
  async function complete({ system, user, apiKey }: CompleteInput) {
    const url = providerRequestUrl("google");
    const res = await postLlm("google", url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("LLM returned empty content");
    return { text: content, usage: usageFromGoogleShape(body) };
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        return generateTextDraftsWithCompactRetry(
          text,
          (system, user) =>
            complete({
              system,
              user,
              apiKey,
              provider: input.provider,
            }),
          input.extraUserSuffix ?? "",
        );
      }

      const imageKey = input.imageKey ?? "material";
      const url = providerRequestUrl("google");
      const res = await postLlm("google", url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPromptForGenerateDrafts(input) }],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: imagePromptForJson(imageKey) },
                {
                  inlineData: {
                    mimeType: image.mimeType,
                    data: image.base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      });

      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const content = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("LLM returned empty content");
      return parseCardsPayload(content);
    },
  };
}

export type CreateLlmAdapterOptions = {
  /** Z.ai text model; ignored for other providers. */
  model?: string | null;
};

/**
 * Resolve BYO / mock adapter. For platform free path use
 * `createWorkersAiAdapter(env)` (needs `env.AI`).
 */
export function createLlmAdapter(
  provider: string,
  opts?: CreateLlmAdapterOptions,
): LlmAdapter {
  const p = parseLlmProvider(provider);
  switch (p) {
    case "mock":
      return mockLlmAdapter();
    case "openai":
      return openAiAdapter();
    case "anthropic":
      return anthropicAdapter();
    case "google":
      return googleAdapter();
    case "zai":
      // Allowlist is enforced on Settings write; a stored id later dropped
      // from it falls back to the default instead of failing every job.
      return zaiAdapter(
        resolveZaiTextModel(opts?.model) ?? ZAI_DEFAULT_TEXT_MODEL,
      );
    case "workers-ai":
      throw new Error(
        'Provider "workers-ai" requires createWorkersAiAdapter(env)',
      );
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}
