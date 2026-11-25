import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb } from "../harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workersAiJsonSchemaResponseFormat } from "../../../worker/generation/cards-json-schema";
import { isTruncationParseError } from "../../../worker/generation/llm-json";
import {
  WORKERS_AI_MODEL,
  createWorkersAiAdapter,
} from "../../../worker/generation/workers-ai";

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
});
