import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb } from "./harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAdapter,
  parseLlmProvider,
} from "../../worker/generation/llm";
import {
  workersAiClaimsJsonSchemaResponseFormat,
  workersAiJsonSchemaResponseFormat,
} from "../../worker/generation/cards-json-schema";
import {
  WORKERS_AI_CLAIM_CARD_MODEL,
  classifyClaimCardFallback,
} from "../../worker/generation/claim-card-fallback";
import {
  WORKERS_AI_MODEL,
  createWorkersAiAdapter,
  isWorkersAiDeprecatedModelError,
} from "../../worker/generation/workers-ai";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

const sampleCardsJson = JSON.stringify({
  cards: [
    {
      type: "qa",
      front: "Q?",
      back: "A",
      provenance: { pages: [1], excerpt: "ex" },
    },
    {
      type: "qa",
      front: "Q2?",
      back: "A2",
      provenance: { pages: [1], excerpt: "ex" },
    },
    {
      type: "cloze",
      front: "The {{c1::term}} matters.",
      back: "term",
      provenance: { pages: [1], excerpt: "ex" },
    },
  ],
});

function chatCompletionResult(content: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: WORKERS_AI_MODEL,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content, refusal: null },
        finish_reason: "stop" as const,
        logprobs: null,
      },
    ],
  };
}

describe("Workers AI adapter", () => {
  it("parseLlmProvider accepts workers-ai; createLlmAdapter requires env factory", () => {
    expect(parseLlmProvider("workers-ai")).toBe("workers-ai");
    expect(() => createLlmAdapter("workers-ai")).toThrow(
      /createWorkersAiAdapter/i,
    );
  });

  it("generateDrafts calls env.AI.run with locked model, completion budget, and system/user messages", async () => {
    const run = vi.fn(
      async (
        _model: string,
        inputs: {
          messages?: unknown;
          max_tokens?: number;
          max_completion_tokens?: number;
          response_format?: { type?: string };
        },
        options?: {
          gateway?: { id?: string; skipCache?: boolean };
        },
      ) => {
        expect(_model).toBe(WORKERS_AI_MODEL);
        expect(inputs.max_completion_tokens).toBe(8192);
        expect(inputs.max_tokens).toBe(8192);
        expect(inputs.response_format).toEqual(workersAiJsonSchemaResponseFormat());
        expect(inputs.messages).toEqual([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("notes"),
          }),
        ]);
        expect(options).toEqual({
          gateway: { id: "sugarplum", skipCache: true },
        });
        return chatCompletionResult(sampleCardsJson);
      },
    );

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;

    const adapter = createWorkersAiAdapter(env);
    const drafts = await adapter.generateDrafts({
      text: "notes about mitochondria",
      apiKey: "ignored-key",
      provider: "workers-ai",
    });

    expect(run).toHaveBeenCalledOnce();
    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.type).toBe("qa");
    expect(drafts[2]?.type).toBe("cloze");
  });

  it("complete uses claim-card model and reasoning low when requested", async () => {
    const run = vi.fn(
      async (
        model: string,
        inputs: {
          reasoning_effort?: string;
          reasoning?: { effort?: string };
        },
      ) => {
        expect(model).toBe(WORKERS_AI_CLAIM_CARD_MODEL);
        expect(inputs.reasoning_effort).toBe("low");
        expect(inputs.reasoning).toEqual({ effort: "low" });
        return chatCompletionResult('{"cards":[]}');
      },
    );
    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);
    await adapter.complete({
      system: "sys",
      user: "usr",
      apiKey: "",
      provider: "workers-ai",
      model: WORKERS_AI_CLAIM_CARD_MODEL,
      reasoningEffort: "low",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("complete defaults to WORKERS_AI_MODEL without reasoningEffort", async () => {
    const run = vi.fn(async (model: string, inputs: Record<string, unknown>) => {
      expect(model).toBe(WORKERS_AI_MODEL);
      expect(inputs.reasoning_effort).toBeUndefined();
      expect(inputs.reasoning).toBeUndefined();
      return chatCompletionResult('{"cards":[]}');
    });
    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);
    await adapter.complete({
      system: "sys",
      user: "usr",
      apiKey: "",
      provider: "workers-ai",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("detects deprecated model and claim-card fallback errors", () => {
    expect(
      isWorkersAiDeprecatedModelError({ status: 410, message: "gone" }),
    ).toBe(true);
    expect(
      isWorkersAiDeprecatedModelError({ code: 5028, message: "deprecated" }),
    ).toBe(true);
    expect(
      classifyClaimCardFallback(new Error("LLM did not return a qa card")),
    ).toBe("parse");
    expect(
      classifyClaimCardFallback(
        new Error("Workers AI is temporarily at capacity. Add your own key."),
      ),
    ).toBe("capacity");
    expect(
      classifyClaimCardFallback(new Error("invalid auth parse token")),
    ).toBeNull();
  });

  it("complete honors gatewayCache when set (default remains skipCache true)", async () => {
    const run = vi.fn(
      async (
        _model: string,
        _inputs: unknown,
        options?: {
          gateway?: { id?: string; skipCache?: boolean; cacheTtl?: number };
        },
      ) => {
        expect(options).toEqual({
          gateway: {
            id: "sugarplum",
            skipCache: false,
            cacheTtl: 3600,
          },
        });
        return chatCompletionResult('{"cards":[]}');
      },
    );
    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);
    await adapter.complete({
      system: "sys",
      user: "usr",
      apiKey: "",
      provider: "workers-ai",
      gatewayCache: { skipCache: false, cacheTtl: 3600 },
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("complete returns assistant content and ignores apiKey", async () => {
    const run = vi.fn(
      async (
        _model: string,
        inputs: {
          messages?: unknown[];
          response_format?: { type?: string };
        },
      ) => {
        expect(inputs.response_format).toEqual(workersAiJsonSchemaResponseFormat());
        expect(inputs.messages?.[0]).toEqual({
          role: "system",
          content: "critique-system",
        });
        expect(inputs.messages?.[1]).toEqual({
          role: "user",
          content: "critique-user",
        });
        return chatCompletionResult('{"cards":[]}');
      },
    );

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;

    const adapter = createWorkersAiAdapter(env);
    const result = await adapter.complete({
      system: "critique-system",
      user: "critique-user",
      apiKey: "should-not-matter",
      provider: "workers-ai",
    });

    expect(result.text).toBe('{"cards":[]}');
    expect(run).toHaveBeenCalledOnce();
    const [, inputs] = run.mock.calls[0]!;
    expect(JSON.stringify(inputs)).not.toContain("should-not-matter");
  });

  it("complete returns usage from AI.run payload", async () => {
    const run = vi.fn(async () => ({
      ...chatCompletionResult('{"cards":[]}'),
      usage: {
        prompt_tokens: 40,
        completion_tokens: 12,
        total_tokens: 52,
      },
    }));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);
    const result = await adapter.complete({
      system: "s",
      user: "u",
      apiKey: "",
      provider: "workers-ai",
    });

    expect(result.usage).toEqual({
      prompt_tokens: 40,
      completion_tokens: 12,
      total_tokens: 52,
    });
  });

  it("complete with jsonShape claims sends claims schema", async () => {
    const run = vi.fn(
      async (
        _model: string,
        inputs: { response_format?: unknown },
      ) => {
        expect(inputs.response_format).toEqual(
          workersAiClaimsJsonSchemaResponseFormat(),
        );
        return chatCompletionResult('{"claims":[]}');
      },
    );

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = await adapter.complete({
      system: "extract-system",
      user: "extract-user",
      apiKey: "",
      provider: "workers-ai",
      jsonShape: "claims",
    });

    expect(result.text).toBe('{"claims":[]}');
    expect(run).toHaveBeenCalledOnce();
  });

  it("throws when AI binding is missing", () => {
    const env = cfEnv;
    // Simulate misconfigured Worker without AI.
    (env as { AI?: Ai }).AI = undefined;
    expect(() => createWorkersAiAdapter(env)).toThrow(/env\.AI/i);
  });

  it("maps capacity / 429 AI.run failures to Settings / midnight hint", async () => {
    const run = vi.fn(async () => {
      const err = new Error("Workers AI rate limit: neurons exhausted");
      (err as Error & { status: number }).status = 429;
      throw err;
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    await expect(
      adapter.complete({
        system: "s",
        user: "u",
        apiKey: "",
        provider: "workers-ai",
      }),
    ).rejects.toThrow(/Settings|BYO|UTC midnight|capacity/i);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
