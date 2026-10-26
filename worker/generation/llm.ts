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

/** Includes test fixture provider. */
export const LLM_PROVIDERS = [...USER_LLM_PROVIDERS, "mock"] as const;
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

export type LlmAdapter = {
  generateDrafts(input: GenerateDraftsInput): Promise<CardDraft[]>;
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
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Fixed drafts for tests (no network). */
export function mockLlmAdapter(): LlmAdapter {
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
          front: "Name one key fact from the material.",
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
    },
  };
}

function userPromptForJson(text: string): string {
  return `${generateUserPrompt(text)}\n\nReturn JSON as {"cards":[...]}`;
}

function imagePromptForJson(): string {
  return `${generateImageUserPrompt()}\n\nReturn JSON as {"cards":[...]}`;
}

function systemPromptFor(input: GenerateDraftsInput): string {
  return input.image ? IMAGE_GENERATE_SYSTEM_PROMPT : GENERATE_SYSTEM_PROMPT;
}

function parseCardsPayload(content: string): CardDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM returned non-JSON content");
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

async function readErrorDetail(res: Response): Promise<string> {
  const detail = await res.text().catch(() => "");
  return detail ? `: ${detail.slice(0, 200)}` : "";
}

function openAiAdapter(): LlmAdapter {
  return {
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      const url = providerRequestUrl("openai");
      const userContent = image
        ? [
            { type: "text", text: imagePromptForJson() },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            },
          ]
        : userPromptForJson(text);
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
            { role: "user", content: userContent },
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
  return {
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      const url = providerRequestUrl("anthropic");
      const userContent = image
        ? [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: image.base64,
              },
            },
            { type: "text", text: imagePromptForJson() },
          ]
        : userPromptForJson(text);
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
          messages: [{ role: "user", content: userContent }],
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
  return {
    async generateDrafts(input) {
      const { text, apiKey, image } = input;
      const url = providerRequestUrl("google");
      const parts = image
        ? [
            { text: imagePromptForJson() },
            {
              inlineData: {
                mimeType: image.mimeType,
                data: image.base64,
              },
            },
          ]
        : [{ text: userPromptForJson(text) }];
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
          contents: [{ role: "user", parts }],
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

/** Resolve adapter from allowlisted provider; rejects unknown / URL strings. */
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
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}
