import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb } from "../harness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKERS_AI_MODEL,
  WORKERS_AI_RUN_TIMEOUT_MS,
  createWorkersAiAdapter,
} from "../../../worker/generation/workers-ai";

afterEach(async () => {
  await resetTestDb(cfEnv);
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
