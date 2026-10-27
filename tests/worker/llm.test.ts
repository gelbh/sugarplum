import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAdapter,
  parseCardsPayload,
  parseLlmProvider,
  providerRequestUrl,
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
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    const raw = await createLlmAdapter("openai").complete({
      system: "custom-system",
      user: "custom-user",
      apiKey: "sk-openai",
      provider: "openai",
    });

    expect(raw).toBe('{"ok":true}');
    expect(body).toMatchObject({
      messages: [
        { role: "system", content: "custom-system" },
        { role: "user", content: "custom-user" },
      ],
    });
  });

  it("mock complete returns fixed critique JSON", async () => {
    const raw = await createLlmAdapter("mock").complete({
      system: "s",
      user: "u",
      apiKey: "",
      provider: "mock",
    });
    const parsed = JSON.parse(raw) as { cards: unknown[] };
    expect(Array.isArray(parsed.cards)).toBe(true);
    expect(parsed.cards.length).toBeGreaterThan(0);
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
});
