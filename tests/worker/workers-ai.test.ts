import { describe, expect, it, vi } from "vitest";
import { createLlmAdapter, parseLlmProvider } from "../../worker/generation/llm";
import {
  WORKERS_AI_MODEL,
  createWorkersAiAdapter,
} from "../../worker/generation/workers-ai";
import { createTestEnv } from "./test-env";

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
        },
      ) => {
      expect(_model).toBe(WORKERS_AI_MODEL);
      expect(inputs.max_completion_tokens).toBe(8192);
      expect(inputs.max_tokens).toBe(8192);
      expect(inputs.messages).toEqual([
        expect.objectContaining({ role: "system" }),
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("notes"),
        }),
      ]);
      return chatCompletionResult(sampleCardsJson);
    });

    const env = createTestEnv();
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

    const env = createTestEnv();
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

    const env = createTestEnv();
    env.AI = { run } as unknown as Ai;
    const adapter = createWorkersAiAdapter(env);

    const drafts = await adapter.generateDrafts({
      text: "notes about monoxenous protozoa",
      apiKey: "",
      provider: "workers-ai",
    });

    expect(drafts).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(2);
    const secondUser = (
      run.mock.calls[1]![1] as { messages: { content: string }[] }
    ).messages[1]!.content;
    expect(secondUser).toMatch(/3–5 short/i);
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

    const env = createTestEnv();
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
    const run = vi.fn(async (_model: string, inputs: { messages?: unknown[] }) => {
      expect(inputs.messages?.[0]).toEqual({
        role: "system",
        content: "critique-system",
      });
      expect(inputs.messages?.[1]).toEqual({
        role: "user",
        content: "critique-user",
      });
      return chatCompletionResult('{"cards":[]}');
    });

    const env = createTestEnv();
    env.AI = { run } as unknown as Ai;

    const adapter = createWorkersAiAdapter(env);
    const raw = await adapter.complete({
      system: "critique-system",
      user: "critique-user",
      apiKey: "should-not-matter",
      provider: "workers-ai",
    });

    expect(raw).toBe('{"cards":[]}');
    expect(run).toHaveBeenCalledOnce();
    const [, inputs] = run.mock.calls[0]!;
    expect(JSON.stringify(inputs)).not.toContain("should-not-matter");
  });

  it("throws when AI binding is missing", () => {
    const env = createTestEnv();
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

    const env = createTestEnv();
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
  });
});
