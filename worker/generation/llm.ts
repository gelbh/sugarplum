import {
  parseCardDrafts,
  type CardDraft,
} from "./schema";
import { appendAvoidPatternsSuffix } from "./feedback-hints";
import {
  GENERATE_COMPACT_SYSTEM_PROMPT,
  GENERATE_SYSTEM_PROMPT,
  IMAGE_GENERATE_SYSTEM_PROMPT,
  appendTopicHintsSuffix,
  generateCompactUserPrompt,
  generateImageUserPrompt,
  generateUserPrompt,
} from "./prompts";

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
/** Same multi-card JSON headroom as the Workers AI free path. */
const ZAI_MAX_TOKENS = 8192;

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
  /** Optional also-cover topic hints from the generation job. */
  topicHints?: string[];
  /** Optional reject avoid-patterns snapshotted on job regen. */
  avoidPatterns?: string[];
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

export function userPromptForJson(text: string): string {
  return `${generateUserPrompt(text)}\n\nReturn JSON as {"cards":[...]}`;
}

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

/** Text generate: full prompt, then one compact retry on mid-JSON truncation. */
async function generateTextDraftsWithCompactRetry(
  text: string,
  completeOnce: (system: string, user: string) => Promise<CompleteResult>,
  topicHints: string[] = [],
  avoidPatterns: string[] = [],
): Promise<CardDraft[]> {
  const withSuffixes = (prompt: string) =>
    appendAvoidPatternsSuffix(
      appendTopicHintsSuffix(prompt, topicHints),
      avoidPatterns,
    );
  return withCompactTruncationRetry(
    async () =>
      parseCardsPayload(
        (
          await completeOnce(
            GENERATE_SYSTEM_PROMPT,
            withSuffixes(userPromptForJson(text)),
          )
        ).text,
      ),
    async () =>
      parseCardsPayload(
        (
          await completeOnce(
            GENERATE_COMPACT_SYSTEM_PROMPT,
            withSuffixes(generateCompactUserPrompt(text)),
          )
        ).text,
      ),
  );
}

function imagePromptForJson(imageKey: string): string {
  return `${generateImageUserPrompt(imageKey)}\n\nReturn JSON as {"cards":[...]}`;
}

function systemPromptFor(input: GenerateDraftsInput): string {
  return input.image ? IMAGE_GENERATE_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT;
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

function looksLikeTruncatedJson(text: string): boolean {
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
    async complete() {
      // Keep the fixed generate set so consumer + pipeline tests get 3 drafts.
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

function openAiCompatibleAdapter(opts: {
  requestUrl: string;
  textModel: string;
  visionModel: string;
  /** Z.ai rejects `response_format` on vision models (text models only). */
  visionJsonMode: boolean;
  extraBody?: Record<string, unknown>;
}): LlmAdapter {
  const { requestUrl, textModel, visionModel, visionJsonMode, extraBody } =
    opts;

  async function complete({ system, user, apiKey }: CompleteInput) {
    const res = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...extraBody,
        model: textModel,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(
        `LLM request failed (${res.status})${await readErrorDetail(res)}`,
      );
    }

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
          input.topicHints ?? [],
          input.avoidPatterns ?? [],
        );
      }

      const imageKey = input.imageKey ?? "material";
      const res = await fetch(requestUrl, {
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
            { role: "system", content: systemPromptFor(input) },
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

      if (!res.ok) {
        throw new Error(
          `LLM request failed (${res.status})${await readErrorDetail(res)}`,
        );
      }

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
    requestUrl: providerRequestUrl("openai"),
    textModel: "gpt-4o-mini",
    visionModel: "gpt-4o-mini",
    visionJsonMode: true,
  });
}

function zaiAdapter(textModel: ZaiTextModel): LlmAdapter {
  return openAiCompatibleAdapter({
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
    const res = await fetch(url, {
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

    if (!res.ok) {
      throw new Error(
        `LLM request failed (${res.status})${await readErrorDetail(res)}`,
      );
    }

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
          input.topicHints ?? [],
          input.avoidPatterns ?? [],
        );
      }

      const imageKey = input.imageKey ?? "material";
      const url = providerRequestUrl("anthropic");
      const res = await fetch(url, {
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
          system: systemPromptFor(input),
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

      if (!res.ok) {
        throw new Error(
          `LLM request failed (${res.status})${await readErrorDetail(res)}`,
        );
      }

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
    const res = await fetch(url, {
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

    if (!res.ok) {
      throw new Error(
        `LLM request failed (${res.status})${await readErrorDetail(res)}`,
      );
    }

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
          input.topicHints ?? [],
          input.avoidPatterns ?? [],
        );
      }

      const imageKey = input.imageKey ?? "material";
      const url = providerRequestUrl("google");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPromptFor(input) }],
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

      if (!res.ok) {
        throw new Error(
          `LLM request failed (${res.status})${await readErrorDetail(res)}`,
        );
      }

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
