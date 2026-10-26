import {
  parseCardDrafts,
  type CardDraft,
} from "./schema";
import { GENERATE_SYSTEM_PROMPT, generateUserPrompt } from "./prompts";

export type GenerateDraftsInput = {
  text: string;
  apiKey: string;
  provider: string;
};

export type LlmAdapter = {
  generateDrafts(input: GenerateDraftsInput): Promise<CardDraft[]>;
};

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

function openAiCompatibleBaseUrl(provider: string): string {
  const p = provider.trim().toLowerCase();
  if (p === "openai" || p === "") return "https://api.openai.com/v1";
  if (p === "openrouter") return "https://openrouter.ai/api/v1";
  if (p.startsWith("http://") || p.startsWith("https://")) {
    return p.replace(/\/$/, "");
  }
  return "https://api.openai.com/v1";
}

function openAiCompatibleModel(provider: string): string {
  const p = provider.trim().toLowerCase();
  if (p === "openrouter") return "openai/gpt-4o-mini";
  return "gpt-4o-mini";
}

/** BYO-key OpenAI-compatible chat completions → CardDraft[]. */
export function openAiCompatibleAdapter(): LlmAdapter {
  return {
    async generateDrafts({ text, apiKey, provider }) {
      const base = openAiCompatibleBaseUrl(provider);
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: openAiCompatibleModel(provider),
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: GENERATE_SYSTEM_PROMPT },
            {
              role: "user",
              content: `${generateUserPrompt(text)}\n\nReturn JSON as {"cards":[...]} `,
            },
          ],
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `LLM request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
      }

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned empty content");

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
    },
  };
}

/** Resolve adapter: provider "mock" uses the test fixture; else OpenAI-compatible. */
export function createLlmAdapter(provider: string): LlmAdapter {
  if (provider.trim().toLowerCase() === "mock") return mockLlmAdapter();
  return openAiCompatibleAdapter();
}
