import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLlmAdapter,
  parseLlmProvider,
  providerRequestUrl,
} from "../../../worker/generation/llm";
import { sampleCardsJson } from "./fixtures";

function hostnameOf(url: string): string {
  return new URL(url).hostname;
}

describe("LLM provider routing", () => {
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

        if (hostnameOf(url) === "api.anthropic.com") {
          return new Response(
            JSON.stringify({
              content: [{ type: "text", text: sampleCardsJson }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (hostnameOf(url) === "generativelanguage.googleapis.com") {
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
    expect(urls.every((u) => hostnameOf(u) !== "api.openai.com")).toBe(true);
    expect(urls[0]).toBe(providerRequestUrl("anthropic"));
    expect(hostnameOf(urls[0]!)).toBe("api.anthropic.com");
    expect(urls[1]).toBe(providerRequestUrl("google"));
    expect(hostnameOf(urls[1]!)).toBe("generativelanguage.googleapis.com");
    expect(hostnameOf(urls[1]!)).not.toBe("api.openai.com");
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

  it("mock complete returns claims for extract and cards otherwise", async () => {
    const extract = await createLlmAdapter("mock").complete({
      system: "You extract atomic study claims from lecture",
      user: "--- MATERIAL ---\nMitochondria make ATP.\n--- END ---",
      apiKey: "",
      provider: "mock",
    });
    const claims = JSON.parse(extract.text) as { claims: unknown[] };
    expect(Array.isArray(claims.claims)).toBe(true);
    expect(claims.claims.length).toBeGreaterThan(0);

    const critique = await createLlmAdapter("mock").complete({
      system: "s",
      user: "u",
      apiKey: "",
      provider: "mock",
    });
    const parsed = JSON.parse(critique.text) as { cards: unknown[] };
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
    expect(
      bodies.every(
        (b) =>
          JSON.stringify((b as { thinking?: unknown }).thinking) ===
            JSON.stringify({ type: "disabled" }) &&
          (b as { max_tokens?: unknown }).max_tokens === 8192,
      ),
    ).toBe(true);
  });

  it("zai falls back to default text model when stored model left the allowlist", async () => {
    let body: { model?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as typeof body;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("zai", { model: "glm-retired" }).complete({
      system: "s",
      user: "u",
      apiKey: "zai-key",
      provider: "zai",
    });

    expect(body.model).toBe("glm-4.7-flash");
  });

  it("openai requests do not carry zai-only thinking/max_tokens fields", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("openai").complete({
      system: "s",
      user: "u",
      apiKey: "sk-test",
      provider: "openai",
    });

    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("max_tokens");
  });
});
