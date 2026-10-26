import {
  parseCardDrafts,
  type CardDraft,
} from "./schema";
import { GENERATE_SYSTEM_PROMPT, generateUserPrompt } from "./prompts";

/** User-selectable BYO providers (Settings + Secrets). */
export const USER_LLM_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type UserLlmProvider = (typeof USER_LLM_PROVIDERS)[number];

/** Includes test fixture provider. */
export const LLM_PROVIDERS = [...USER_LLM_PROVIDERS, "mock"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type GenerateDraftsInput = {
  text: string;
  apiKey: string;
  provider: string;
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
export function providerRequestUrl(provider: LlmProvider, apiKey?: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1/chat/completions";
    case "anthropic":
      return "https://api.anthropic.com/v1/messages";
    case "google": {
      const model = "gemini-2.0-flash";
      const key = apiKey ?? "";
      return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    }
    case "mock":
      throw new Error("mock provider has no network URL");
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Fixed 2 QA + 1 cloze for tests (no network). */
export function mockLlmAdapter(): LlmAdapter {
  return {
    async generateDrafts({ text }) {
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
    async generateDrafts({ text, apiKey }) {
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
            { role: "system", content: GENERATE_SYSTEM_PROMPT },
            { role: "user", content: userPromptForJson(text) },
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
    async generateDrafts({ text, apiKey }) {
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
          system: GENERATE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPromptForJson(text) }],
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
    async generateDrafts({ text, apiKey }) {
      const url = providerRequestUrl("google", apiKey);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: GENERATE_SYSTEM_PROMPT }] },
          contents: [
            { role: "user", parts: [{ text: userPromptForJson(text) }] },
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
