import {
  parseCardDrafts,
  type CardDraft,
} from "./schema";
import {
  GENERATE_SYSTEM_PROMPT,
  IMAGE_GENERATE_SYSTEM_PROMPT,
  generateImageUserPrompt,
  generateUserPrompt,
} from "./prompts";

/** User-selectable BYO providers (Settings + Secrets). */
export const USER_LLM_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type UserLlmProvider = (typeof USER_LLM_PROVIDERS)[number];

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
};

export type CompleteInput = {
  system: string;
  user: string;
  apiKey: string;
  provider: string;
};

/** Flashcard generate + freeform complete (critique / custom prompts). */
export type LlmAdapter = {
  generateDrafts(input: GenerateDraftsInput): Promise<CardDraft[]>;
  complete(input: CompleteInput): Promise<string>;
};

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

function imagePromptForJson(): string {
  return `${generateImageUserPrompt()}\n\nReturn JSON as {"cards":[...]}`;
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

export function parseCardsPayload(content: string): CardDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapLlmJsonText(content));
  } catch {
    const preview = content.trim().replace(/\s+/g, " ").slice(0, 80);
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
    async generateDrafts({ text, image }) {
      if (image) {
        return parseCardDrafts([
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
      return JSON.stringify({
        cards: textDrafts("mock critique excerpt"),
      });
    },
  };
}

async function readErrorDetail(res: Response): Promise<string> {
  const detail = await res.text().catch(() => "");
  return detail ? `: ${detail.slice(0, 200)}` : "";
}

function openAiAdapter(): LlmAdapter {
  async function complete({ system, user, apiKey }: CompleteInput) {
    const url = providerRequestUrl("openai");
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
    return content;
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        const content = await complete({
          system: GENERATE_SYSTEM_PROMPT,
          user: userPromptForJson(text),
          apiKey,
          provider: input.provider,
        });
        return parseCardsPayload(content);
      }

      const url = providerRequestUrl("openai");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPromptFor(input) },
            {
              role: "user",
              content: [
                { type: "text", text: imagePromptForJson() },
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
    return content;
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        const content = await complete({
          system: GENERATE_SYSTEM_PROMPT,
          user: userPromptForJson(text),
          apiKey,
          provider: input.provider,
        });
        return parseCardsPayload(content);
      }

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
                { type: "text", text: imagePromptForJson() },
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
    return content;
  }

  return {
    complete,
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      if (!image) {
        const content = await complete({
          system: GENERATE_SYSTEM_PROMPT,
          user: userPromptForJson(text),
          apiKey,
          provider: input.provider,
        });
        return parseCardsPayload(content);
      }

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
                { text: imagePromptForJson() },
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

/**
 * Resolve BYO / mock adapter. For platform free path use
 * `createWorkersAiAdapter(env)` (needs `env.AI`).
 */
export function createLlmAdapter(provider: string): LlmAdapter {
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
