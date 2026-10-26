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

  it("generateDrafts calls env.AI.run with locked model and system/user messages", async () => {
    const run = vi.fn(async (_model: string, inputs: { messages?: unknown }) => {
      expect(_model).toBe(WORKERS_AI_MODEL);
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
});
