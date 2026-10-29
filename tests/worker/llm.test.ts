import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAdapter,
  isTruncationParseError,
  parseCardsPayload,
  parseLlmProvider,
  providerRequestUrl,
  withCompactTruncationRetry,
} from "../../worker/generation/llm";

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

describe("LLM provider allowlist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects unknown providers and bare URLs", () => {
    expect(() => parseLlmProvider("https://evil.example/v1")).toThrow(
      /Unsupported LLM provider/i,
    );
    expect(() => parseLlmProvider("openrouter")).toThrow(
      /Unsupported LLM provider/i,
    );
    expect(() => createLlmAdapter("http://localhost:8080")).toThrow(
      /Unsupported LLM provider/i,
    );
  });

  it("does not post anthropic or google keys to api.openai.com", async () => {
    const urls: string[] = [];
    const authHeaders: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        urls.push(url);
        const headers = new Headers(init?.headers);
        authHeaders.push(
          headers.get("authorization") ??
            headers.get("x-api-key") ??
            headers.get("x-goog-api-key") ??
            (url.includes("key=") ? "query-key" : ""),
        );

        if (url.includes("api.anthropic.com")) {
          return new Response(
            JSON.stringify({
              content: [{ type: "text", text: sampleCardsJson }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("generativelanguage.googleapis.com")) {
          return new Response(
            JSON.stringify({
              candidates: [
                { content: { parts: [{ text: sampleCardsJson }] } },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("unexpected host", { status: 500 });
      }),
    );

    const anthropicKey = "sk-ant-secret-anthropic";
    await createLlmAdapter("anthropic").generateDrafts({
      text: "notes",
      apiKey: anthropicKey,
      provider: "anthropic",
    });

    const googleKey = "AIza-secret-google";
    await createLlmAdapter("google").generateDrafts({
      text: "notes",
      apiKey: googleKey,
      provider: "google",
    });

    expect(urls).toHaveLength(2);
    expect(urls.every((u) => !u.includes("api.openai.com"))).toBe(true);
    expect(urls[0]).toBe(providerRequestUrl("anthropic"));
    expect(urls[0]).toContain("api.anthropic.com");
    expect(urls[1]).toBe(providerRequestUrl("google"));
    expect(urls[1]).toContain("generativelanguage.googleapis.com");
    expect(urls[1]).not.toContain("api.openai.com");
    expect(urls[1]).not.toContain(encodeURIComponent(googleKey));
    expect(urls[1]).not.toMatch(/[?&]key=/);
    expect(authHeaders[0]).toBe(anthropicKey);
    expect(authHeaders[1]).toBe(googleKey);
  });

  it("routes openai to api.openai.com only", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: sampleCardsJson } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("openai").generateDrafts({
      text: "notes",
      apiKey: "sk-openai",
      provider: "openai",
    });

    expect(urls).toEqual([providerRequestUrl("openai")]);
    expect(urls[0]).toContain("api.openai.com");
  });

  it("complete() posts custom system/user on the same BYO transport", async () => {
    let body: unknown;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 7,
              total_tokens: 18,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const result = await createLlmAdapter("openai").complete({
      system: "custom-system",
      user: "custom-user",
      apiKey: "sk-openai",
      provider: "openai",
    });

    expect(result.text).toBe('{"ok":true}');
    expect(result.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    });
    expect(body).toMatchObject({
      messages: [
        { role: "system", content: "custom-system" },
        { role: "user", content: "custom-user" },
      ],
    });
  });

  it("mock complete returns fixed critique JSON", async () => {
    const result = await createLlmAdapter("mock").complete({
      system: "s",
      user: "u",
      apiKey: "",
      provider: "mock",
    });
    const parsed = JSON.parse(result.text) as { cards: unknown[] };
    expect(Array.isArray(parsed.cards)).toBe(true);
    expect(parsed.cards.length).toBeGreaterThan(0);
  });

  it("parseLlmProvider accepts zai; unknown still throws", () => {
    expect(parseLlmProvider("zai")).toBe("zai");
    expect(() => parseLlmProvider("openrouter")).toThrow(
      /Unsupported LLM provider/i,
    );
  });

  it("routes zai to api.z.ai paas chat completions", () => {
    expect(providerRequestUrl("zai")).toBe(
      "https://api.z.ai/api/paas/v4/chat/completions",
    );
  });

  it("zai text complete/generateDrafts post chosen text model", async () => {
    const bodies: { model?: string }[] = [];
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        urls.push(String(input));
        bodies.push(JSON.parse(String(init?.body)) as { model?: string });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: sampleCardsJson } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("zai", { model: "glm-4.7" }).complete({
      system: "s",
      user: "u",
      apiKey: "zai-key",
      provider: "zai",
    });
    await createLlmAdapter("zai", { model: "glm-4.7" }).generateDrafts({
      text: "notes",
      apiKey: "zai-key",
      provider: "zai",
    });

    expect(urls.every((u) => u === providerRequestUrl("zai"))).toBe(true);
    expect(bodies.every((b) => b.model === "glm-4.7")).toBe(true);
  });

  it("zai image generateDrafts force glm-4.6v-flash with image_url", async () => {
    let body: {
      model?: string;
      messages?: { role: string; content: unknown }[];
    } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as typeof body;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: sampleCardsJson } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("zai", { model: "glm-4.7" }).generateDrafts({
      text: "",
      apiKey: "zai-key",
      provider: "zai",
      imageKey: "materials/x.png",
      image: { mimeType: "image/png", base64: "abc" },
    });

    expect(body.model).toBe("glm-4.6v-flash");
    const user = body.messages?.find((m) => m.role === "user");
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as { type?: string; image_url?: unknown }[];
    expect(parts.some((p) => p.type === "image_url" && p.image_url)).toBe(
      true,
    );
  });
});

describe("parseCardsPayload", () => {
  it("accepts markdown-fenced JSON from Workers AI / GLM", () => {
    const fenced = "```json\n" + sampleCardsJson + "\n```";
    const drafts = parseCardsPayload(fenced);
    expect(drafts).toHaveLength(3);
    expect(drafts[0]?.type).toBe("qa");
    expect(drafts[2]?.type).toBe("cloze");
  });

  it("accepts prose before a fenced JSON block", () => {
    const wrapped =
      "Sure, here are the cards:\n\n```json\n" + sampleCardsJson + "\n```\n";
    expect(parseCardsPayload(wrapped)).toHaveLength(3);
  });

  it("accepts raw JSON with leading/trailing chatter", () => {
    const wrapped =
      "Output:\n" + sampleCardsJson + "\nHope this helps!";
    expect(parseCardsPayload(wrapped)).toHaveLength(3);
  });

  it("still rejects content with no JSON object or array", () => {
    expect(() => parseCardsPayload("I cannot help with that.")).toThrow(
      /non-JSON/i,
    );
  });

  it("salvages complete cards when the model truncates mid-JSON", () => {
    const truncated =
      '{"cards":[' +
      JSON.stringify({
        type: "qa",
        front: "What defines monoxenous protozoa?",
        back: "A single host.",
        provenance: { pages: [1], excerpt: "monoxenous" },
      }) +
      ',{"type":"cloze","front":"Monoxenous protozoa are defined by having a {';
    const drafts = parseCardsPayload(truncated);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.type).toBe("qa");
  });

  it("names truncation when no complete card objects can be salvaged", () => {
    expect(() =>
      parseCardsPayload(
        '{"cards":[{"type":"cloze","front":"Monoxenous protozoa are defined by having a {}',
      ),
    ).toThrow(/truncated/i);
  });
});

describe("isTruncationParseError", () => {
  it("matches mid-JSON truncation errors only", () => {
    expect(
      isTruncationParseError(new Error("LLM response truncated mid-JSON")),
    ).toBe(true);
    expect(
      isTruncationParseError(
        new Error("LLM response truncated mid-JSON (preview: {) [len=12]"),
      ),
    ).toBe(true);
    expect(isTruncationParseError(new Error("LLM returned non-JSON content"))).toBe(
      false,
    );
    expect(isTruncationParseError("truncated mid-JSON")).toBe(false);
  });
});

describe("withCompactTruncationRetry", () => {
  it("returns first success without calling retry", async () => {
    const retry = vi.fn(async () => "retry");
    await expect(
      withCompactTruncationRetry(async () => "ok", retry),
    ).resolves.toBe("ok");
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries once on truncation parse error", async () => {
    const first = vi.fn(async () => {
      throw new Error("LLM response truncated mid-JSON");
    });
    const retry = vi.fn(async () => "compact-ok");
    await expect(withCompactTruncationRetry(first, retry)).resolves.toBe(
      "compact-ok",
    );
    expect(first).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("does not retry non-truncation errors", async () => {
    const retry = vi.fn(async () => "retry");
    await expect(
      withCompactTruncationRetry(async () => {
        throw new Error("LLM returned non-JSON content");
      }, retry),
    ).rejects.toThrow(/non-JSON/i);
    expect(retry).not.toHaveBeenCalled();
  });
});

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
