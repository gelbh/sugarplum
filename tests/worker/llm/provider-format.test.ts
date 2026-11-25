import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JSON_OBJECT_RESPONSE_FORMAT,
  openAiClaimsJsonSchemaResponseFormat,
  openAiJsonSchemaResponseFormat,
} from "../../../worker/generation/cards-json-schema";
import { createLlmAdapter } from "../../../worker/generation/llm";
import { sampleCardsJson } from "./fixtures";

describe("LLM provider format and retries", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("openai text complete sends json_schema", async () => {
    let body: { response_format?: unknown } = {};
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

    await createLlmAdapter("openai").complete({
      system: "s",
      user: "u",
      apiKey: "sk-test",
      provider: "openai",
    });

    expect(body.response_format).toEqual(openAiJsonSchemaResponseFormat());
  });

  it("openai complete with jsonShape claims sends claims schema", async () => {
    let body: { response_format?: unknown } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as typeof body;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"claims":[]}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("openai").complete({
      system: "s",
      user: "u",
      apiKey: "sk-test",
      provider: "openai",
      jsonShape: "claims",
    });

    expect(body.response_format).toEqual(openAiClaimsJsonSchemaResponseFormat());
  });

  it("retries json_object once when OpenAI rejects the schema format", async () => {
    const bodies: { response_format?: { type?: string } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        if (bodies.length === 1) {
          return new Response(
            JSON.stringify({
              error: { message: "Invalid response_format json_schema" },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
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

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.response_format?.type).toBe("json_schema");
    expect(bodies[1]?.response_format).toEqual(JSON_OBJECT_RESPONSE_FORMAT);
  });

  it("retries an overloaded OpenAI schema request on the same body", async () => {
    const bodies: { response_format?: { type?: string } }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
        if (bodies.length === 1) {
          return new Response("overloaded", {
            status: 429,
            headers: { "retry-after": "0.001" },
          });
        }
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

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.response_format?.type).toBe("json_schema");
    expect(bodies[1]?.response_format?.type).toBe("json_schema");
  });

  it("does not retry an OpenAI 400 that is not a format rejection", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: { message: "model not found" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createLlmAdapter("openai").complete({
        system: "s",
        user: "u",
        apiKey: "sk-test",
        provider: "openai",
      }),
    ).rejects.toThrow(/LLM request failed \(400\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("zai text complete still sends json_object", async () => {
    let body: { response_format?: unknown } = {};
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

    await createLlmAdapter("zai").complete({
      system: "s",
      user: "u",
      apiKey: "zai-key",
      provider: "zai",
    });

    expect(body.response_format).toEqual(JSON_OBJECT_RESPONSE_FORMAT);
  });

  it("openai image generateDrafts still sends json_object", async () => {
    let body: { response_format?: unknown } = {};
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

    await createLlmAdapter("openai").generateDrafts({
      text: "",
      apiKey: "sk-test",
      provider: "openai",
      imageKey: "materials/x.png",
      image: { mimeType: "image/png", base64: "abc" },
    });

    expect(body.response_format).toEqual(JSON_OBJECT_RESPONSE_FORMAT);
  });

  it("zai image generateDrafts force glm-4.6v-flash with image_url", async () => {
    let body: {
      model?: string;
      response_format?: unknown;
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
    expect(body).not.toHaveProperty("response_format");
    expect((body as { thinking?: unknown }).thinking).toEqual({
      type: "disabled",
    });
    expect((body as { max_tokens?: unknown }).max_tokens).toBe(8192);
    const user = body.messages?.find((m) => m.role === "user");
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as { type?: string; image_url?: unknown }[];
    expect(parts.some((p) => p.type === "image_url" && p.image_url)).toBe(
      true,
    );
  });
});
