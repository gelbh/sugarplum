import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLlmAdapter } from "../../../worker/generation/llm";

describe("BYO generateDrafts compact retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once with compact prompts when openai truncates mid-JSON", async () => {
    const truncated =
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

    const bodies: { messages?: { role: string; content: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          messages?: { role: string; content: string }[];
        };
        bodies.push(body);
        const content = bodies.length === 1 ? truncated : compactOk;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const drafts = await createLlmAdapter("openai").generateDrafts({
      text: "notes about monoxenous protozoa",
      apiKey: "sk-openai",
      provider: "openai",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.front).toContain("monoxenous");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.messages?.[0]?.content).toMatch(
      /3–5 high-yield cards only/i,
    );
    expect(bodies[1]?.messages?.[1]?.content).toMatch(/3–5 short/i);
  });
});

describe("BYO overload retry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const OVERLOADED =
    "The service may be temporarily overloaded, please try again later";
  const zai429 =
    (code: string, message = OVERLOADED, headers?: HeadersInit) =>
    () =>
      new Response(JSON.stringify({ error: { code, message } }), {
        status: 429,
        headers,
      });
  const ok = () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  function stubFetch(replies: (() => Response)[]) {
    const at: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        at.push(Date.now());
        return replies.shift()!();
      }),
    );
    return at;
  }

  const complete = () =>
    createLlmAdapter("zai").complete({
      system: "s",
      user: "u",
      apiKey: "k",
      provider: "zai",
    });

  it("retries Z.ai overload with backoff, honouring Retry-After", async () => {
    const at = stubFetch([
      zai429("1305"),
      zai429("1305", OVERLOADED, { "retry-after": "3" }),
      ok,
    ]);
    const result = complete();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(at.map((t) => t - at[0]!)).toEqual([0, 2000, 5000]);
  });

  it("fails fast on a quota 429 with the raw provider error", async () => {
    const at = stubFetch([
      zai429(
        "1113",
        "Insufficient balance or no resource package. Please recharge.",
      ),
    ]);
    const result = complete();
    const assertion = expect(result).rejects.toThrow(
      /^LLM request failed \(429\): .*Insufficient balance/,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(at).toHaveLength(1);
  });

  it("names the provider once retries run out", async () => {
    const at = stubFetch([zai429("1305"), zai429("1305"), zai429("1305")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = complete();
    const assertion = expect(result).rejects.toThrow(
      "Z.ai is overloaded right now. Wait a minute and try again, or switch provider in Settings.",
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(at).toHaveLength(3);
  });
});
