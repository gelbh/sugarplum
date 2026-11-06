import type { Env } from "../../worker/env";
import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiJsonSchemaResponseFormat,
  workersAiJsonSchemaResponseFormat,
} from "../../worker/generation/cards-json-schema";
import {
  parseCardsPayload,
  ZAI_DEFAULT_TEXT_MODEL,
  createLlmAdapter,
  type LlmAdapter,
} from "../../worker/generation/llm";
import { GENERATE_SYSTEM_PROMPT } from "../../worker/generation/prompts";
import {
  WORKERS_AI_MODEL,
  createWorkersAiAdapter,
} from "../../worker/generation/workers-ai";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

type LiveProvider = "openai" | "zai" | "workers-ai";

function schemaRequested(): boolean {
  return process.env.EVAL_LIVE_JSON_SCHEMA === "1";
}

function readProvider(): LiveProvider {
  const raw = process.env.EVAL_LIVE_PROVIDER?.trim().toLowerCase() ?? "";
  if (!raw) throw new Error("EVAL_LIVE_PROVIDER is required");
  if (raw === "openai" || raw === "zai" || raw === "workers-ai") return raw;
  throw new Error(
    `EVAL_LIVE_PROVIDER must be openai, zai, or workers-ai (got ${raw})`,
  );
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireProviderKeys(provider: LiveProvider): void {
  if (provider === "openai" || provider === "zai") {
    requiredEnv("EVAL_LIVE_API_KEY");
    return;
  }
  requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  requiredEnv("CLOUDFLARE_API_TOKEN");
}

function workersAiUrl(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function postWorkersAi(
  accountId: string,
  token: string,
  model: string,
  inputs: unknown,
): Promise<unknown> {
  const res = await fetch(workersAiUrl(accountId, model), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(inputs),
  });
  if (!res.ok) {
    throw new Error(`Workers AI request failed (${res.status})`);
  }
  const body = (await res.json()) as {
    success?: boolean;
    result?: unknown;
    errors?: unknown;
  };
  if (body.success === false) {
    throw new Error(JSON.stringify(body.errors));
  }
  return body.result;
}

function workersAiResponseFormat():
  | ReturnType<typeof workersAiJsonSchemaResponseFormat>
  | typeof JSON_OBJECT_RESPONSE_FORMAT {
  return schemaRequested()
    ? workersAiJsonSchemaResponseFormat()
    : JSON_OBJECT_RESPONSE_FORMAT;
}

function openAiResponseFormat():
  | ReturnType<typeof openAiJsonSchemaResponseFormat>
  | typeof JSON_OBJECT_RESPONSE_FORMAT {
  return schemaRequested()
    ? openAiJsonSchemaResponseFormat()
    : JSON_OBJECT_RESPONSE_FORMAT;
}

export function textFromAiResult(result: unknown): string {
  const record = result as {
    choices?: { message?: { content?: unknown } }[];
    response?: unknown;
  } | null;
  const content = record?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.length > 0) return content;
  if (typeof record?.response === "string" && record.response.length > 0) {
    return record.response;
  }
  return "";
}

function contentFromChatResult(result: unknown, emptyMessage: string): string {
  const text = textFromAiResult(result);
  if (!text) throw new Error(emptyMessage);
  return text;
}

function workersAiShim(accountId: string, token: string): LlmAdapter {
  const env = {
    AI: {
      run: async (model: string, inputs: unknown) =>
        postWorkersAi(accountId, token, model, inputs),
    },
  } as unknown as Env;
  return createWorkersAiAdapter(env);
}

function handBuiltAdapter(
  provider: "openai" | "workers-ai",
  secrets: { apiKey?: string; accountId?: string; token?: string },
): LlmAdapter {
  async function chat(system: string, user: string): Promise<string> {
    if (provider === "openai") {
      const res = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${secrets.apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          response_format: openAiResponseFormat(),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`LLM request failed (${res.status})`);
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      return contentFromChatResult(body, "LLM returned empty content");
    }

    const result = await postWorkersAi(
      secrets.accountId ?? "",
      secrets.token ?? "",
      WORKERS_AI_MODEL,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_completion_tokens: 8192,
        max_tokens: 8192,
        temperature: 0.3,
        chat_template_kwargs: { enable_thinking: false },
        response_format: workersAiResponseFormat(),
      },
    );
    return contentFromChatResult(result, "Workers AI returned empty content");
  }

  return {
    async generateDrafts(input) {
      if (input.image) {
        throw new Error("eval:live does not support image generation");
      }
      return parseCardsPayload(await chat(GENERATE_SYSTEM_PROMPT, input.text));
    },
    async complete(input) {
      return { text: await chat(input.system, input.user), usage: null };
    },
  };
}

export function createLiveAdapter(): LlmAdapter {
  const provider = readProvider();
  if (schemaRequested() && provider === "zai") {
    throw new Error("Z.ai does not support json_schema");
  }
  requireProviderKeys(provider);

  if (!schemaRequested() && (provider === "openai" || provider === "zai")) {
    const model =
      provider === "zai" ? ZAI_DEFAULT_TEXT_MODEL : "gpt-4o-mini";
    return createLlmAdapter(provider, { model });
  }

  if (!schemaRequested() && provider === "workers-ai") {
    return workersAiShim(
      requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
      requiredEnv("CLOUDFLARE_API_TOKEN"),
    );
  }

  if (provider === "openai") {
    return handBuiltAdapter(provider, {
      apiKey: requiredEnv("EVAL_LIVE_API_KEY"),
    });
  }
  if (provider !== "workers-ai") {
    throw new Error("Z.ai does not support json_schema");
  }
  return handBuiltAdapter("workers-ai", {
    accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
    token: requiredEnv("CLOUDFLARE_API_TOKEN"),
  });
}
