import { env as cfEnv } from "cloudflare:workers";
import {
  resetTestDb,
} from "./harness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAdapter,
  parseLlmProvider,
} from "../../worker/generation/llm";
import {
  workersAiClaimsJsonSchemaResponseFormat,
  workersAiJsonSchemaResponseFormat,
} from "../../worker/generation/cards-json-schema";
import { isTruncationParseError } from "../../worker/generation/llm-json";
import {
  WORKERS_AI_CLAIM_CARD_MODEL,
  classifyClaimCardFallback,
} from "../../worker/generation/claim-card-fallback";
import {
  WORKERS_AI_MODEL,
  WORKERS_AI_RUN_TIMEOUT_MS,
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

  it("salvages complete cards when finish_reason is length", async () => {
    const completeCard = {
      type: "qa",
      front: "What defines monoxenous protozoa?",
      back: "A single host.",
      provenance: { pages: [1], excerpt: "monoxenous" },
    };
    const truncated =
      '{"cards":[' +
      JSON.stringify(completeCard) +
      ',{"type":"qa","front":"What is Direct';

    const run = vi.fn(async () => ({
      ...chatCompletionResult(truncated),
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: truncated,
            refusal: null,
          },
          finish_reason: "length" as const,
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 256,
        total_tokens: 356,
      },
    }));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const drafts = await adapter.generateDrafts({
      text: "notes",
      apiKey: "",
      provider: "workers-ai",
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.front).toContain("monoxenous");
    expect(run).toHaveBeenCalledOnce();
  });

  it("retries once with a compact prompt when mid-JSON has nothing to salvage", async () => {
    const truncatedMidFirst =
      '{"cards":[{"type":"qa","front":"What defines monoxenous protozoa?","back":"Direc';
    const compactOk = JSON.stringify({
      cards: [
        {
          type: "qa",
          front: "What defines monoxenous protozoa?",
          back: "Direct lifecycle in one host.",
          provenance: { pages: [1], excerpt: "monoxenous" },
        },
      ],
    });

    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ...chatCompletionResult(truncatedMidFirst),
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: truncatedMidFirst,
              refusal: null,
            },
            finish_reason: "stop" as const,
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 40,
          total_tokens: 140,
        },
      })
      .mockResolvedValueOnce(chatCompletionResult(compactOk));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const drafts = await adapter.generateDrafts({
      text: "notes about monoxenous protozoa",
      apiKey: "",
      provider: "workers-ai",
    });

    expect(drafts).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(2);
    const secondMessages = (
      run.mock.calls[1]![1] as { messages: { role: string; content: string }[] }
    ).messages;
    expect(secondMessages[0]!.content).toMatch(/3–5 high-yield cards only/i);
    expect(secondMessages[1]!.content).toMatch(/3–5 short/i);
  });

  it("retries once without response_format when JSON Mode cannot be met", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("JSON Mode couldn't be met"))
      .mockResolvedValueOnce(chatCompletionResult(sampleCardsJson));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const drafts = await adapter.generateDrafts({
      text: "notes",
      apiKey: "",
      provider: "workers-ai",
    });

    expect(drafts).toHaveLength(3);
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      (run.mock.calls[0]![1] as { response_format?: unknown }).response_format,
    ).toEqual(workersAiJsonSchemaResponseFormat());
    expect(
      (run.mock.calls[1]![1] as { response_format?: unknown }).response_format,
    ).toBeUndefined();
  });

  it("names truncation with diagnostics when retry also fails", async () => {
    const truncatedMidFirst =
      '{"cards":[{"type":"qa","front":"What defines monoxenous protozoa?","back":"Direc';
    const run = vi.fn(async () => ({
      ...chatCompletionResult(truncatedMidFirst),
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: truncatedMidFirst,
            refusal: null,
          },
          finish_reason: "stop" as const,
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
      },
    }));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    await expect(
      adapter.generateDrafts({
        text: "notes",
        apiKey: "",
        provider: "workers-ai",
      }),
    ).rejects.toThrow(/truncated mid-JSON.*len=\d+.*finish=stop/i);
    expect(run).toHaveBeenCalledTimes(2);
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

  it("complete rejects finish_reason length with truncated mid-JSON for compact retry", async () => {
    const truncated = '{"cards":[{"type":"qa","front":"Q","back":"A';
    const run = vi.fn(async () => ({
      ...chatCompletionResult(truncated),
      choices: [
        {
          index: 0,
          message: {
            role: "assistant" as const,
            content: truncated,
            refusal: null,
          },
          finish_reason: "length" as const,
          logprobs: null,
        },
      ],
    }));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const err = await adapter
      .complete({
        system: "critique-system",
        user: "critique-user",
        apiKey: "",
        provider: "workers-ai",
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(Error);
    expect(isTruncationParseError(err)).toBe(true);
    expect((err as Error).message).toMatch(/truncated mid-JSON/i);
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

describe("Workers AI 3046 request-timeout retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function timeoutErr() {
    return new Error("3046: Request timeout");
  }

  const complete = (adapter: ReturnType<typeof createWorkersAiAdapter>) =>
    adapter.complete({
      system: "s",
      user: "u",
      apiKey: "",
      provider: "workers-ai",
    });

  it("retries once after 3046 then succeeds", async () => {
    const at: number[] = [];
    const run = vi.fn(async () => {
      at.push(Date.now());
      if (run.mock.calls.length === 1) throw timeoutErr();
      return chatCompletionResult('{"ok":true}');
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(run).toHaveBeenCalledTimes(2);
    expect(at.map((t) => t - at[0]!)).toEqual([0, 2000]);
  });

  it("exhausts two retries then throws a friendly timeout error", async () => {
    const run = vi.fn(async () => {
      throw timeoutErr();
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    const assertion = expect(result).rejects.toThrow(
      /Workers AI timed out.*BYO API key in Settings/i,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("does not treat capacity 429 as a request timeout", async () => {
    const run = vi.fn(async () => {
      const err = new Error("Workers AI rate limit: neurons exhausted");
      (err as Error & { status: number }).status = 429;
      throw err;
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    const assertion = expect(result).rejects.toThrow(
      /Settings|BYO|UTC midnight|capacity/i,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fails immediately on non-timeout errors", async () => {
    const run = vi.fn(async () => {
      throw new Error("model unavailable");
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    const assertion = expect(result).rejects.toThrow(/model unavailable/i);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("backs off 2s then 5s between timeout retries", async () => {
    const at: number[] = [];
    const run = vi.fn(async () => {
      at.push(Date.now());
      throw timeoutErr();
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    const assertion = expect(result).rejects.toThrow(/Workers AI timed out/i);
    await vi.runAllTimersAsync();
    await assertion;
    expect(run).toHaveBeenCalledTimes(3);
    expect(at.map((t) => t - at[0]!)).toEqual([0, 2000, 7000]);
  });

  it("treats a hung AI.run as 3046 after the local deadline then retries", async () => {
    let calls = 0;
    const run = vi.fn(() => {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return Promise.resolve(chatCompletionResult('{"ok":true}'));
    });

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    await vi.advanceTimersByTimeAsync(WORKERS_AI_RUN_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries when AI.run hangs past every local deadline", async () => {
    const run = vi.fn(() => new Promise(() => {}));

    const env = cfEnv;
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const result = complete(adapter);
    const assertion = expect(result).rejects.toThrow(
      /Workers AI timed out.*BYO API key in Settings/i,
    );
    await vi.advanceTimersByTimeAsync(
      3 * WORKERS_AI_RUN_TIMEOUT_MS + 2000 + 5000,
    );
    await assertion;
    expect(run).toHaveBeenCalledTimes(3);
  });
});
