import { afterEach, describe, it, expect, vi } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { processGenerateJob } from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import {
  createLlmAdapter,
  mockLlmAdapter,
  type LlmAdapter,
} from "../../worker/generation/llm";
import {
  appendTopicHintsSuffix,
  generateUserPrompt,
  topicHintsPromptSuffix,
} from "../../worker/generation/prompts";
import { createTestEnv } from "./test-env";

function seedPasteOwner(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

describe("topicHints on paste", () => {
  it("persists topicHints on the generation job as JSON", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes about the brainstem",
          topicHints: ["cranial nerves"],
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    expect(env.getGenerationJobs()).toHaveLength(1);
    const raw = env.getGenerationJobs()[0]?.topic_hints_json;
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toEqual(["cranial nerves"]);
  });

  it("strips empties and rejects over-cap or over-length topicHints", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);

    const tooMany = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          topicHints: ["a", "b", "c", "d", "e", "f"],
        }),
      },
      env,
    );
    expect(tooMany.status).toBe(400);
    expect(env.getGenerationJobs()).toHaveLength(0);

    const tooLong = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          topicHints: ["x".repeat(201)],
        }),
      },
      env,
    );
    expect(tooLong.status).toBe(400);
  });
});

describe("topicHints prompt suffix", () => {
  it("includes each hint phrase when hints are present", () => {
    const suffix = topicHintsPromptSuffix(["cranial nerves"]);
    expect(suffix.toLowerCase()).toContain("cranial nerves");
    expect(suffix.toLowerCase()).toMatch(/must attempt/);
    expect(suffix.toLowerCase()).toMatch(/grounded/);
    expect(suffix.toLowerCase()).toMatch(/do not invent/);
  });

  it("returns empty string when hints are absent", () => {
    expect(topicHintsPromptSuffix([])).toBe("");
  });

  it("built generate user prompt includes the hint phrase", () => {
    const prompt = appendTopicHintsSuffix(
      generateUserPrompt("brainstem notes"),
      ["cranial nerves"],
    );
    expect(prompt.toLowerCase()).toContain("cranial nerves");
    expect(prompt.toLowerCase()).toMatch(/must attempt/);
    expect(prompt).toContain("brainstem notes");
  });
});

describe("topicHints consumer injection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes job topic hints into generateDrafts", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-hints",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-hints.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(
      "materials/deck-a/mat-hints.txt",
      "The brainstem contains cranial nerve nuclei that innervate the head.",
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-hints",
      deckId: "deck-a",
      topicHints: ["cranial nerves"],
    });
    const base = mockLlmAdapter();
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(base.generateDrafts.bind(base)),
      complete: vi.fn(base.complete.bind(base)),
    };

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-hints", deckId: "deck-a" },
      { llm },
    );

    expect(llm.generateDrafts).toHaveBeenCalled();
    const calls = vi.mocked(llm.generateDrafts).mock.calls;
    expect(
      calls.some(
        ([input]) =>
          Array.isArray(input.topicHints) &&
          input.topicHints.includes("cranial nerves"),
      ),
    ).toBe(true);
  });

  it("openai generate user message includes the hint phrase", async () => {
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
    let userContent = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          messages?: { role?: string; content?: string }[];
        };
        userContent =
          body.messages?.find((m) => m.role === "user")?.content ?? "";
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: sampleCardsJson } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );

    await createLlmAdapter("openai").generateDrafts({
      text: "brainstem notes",
      apiKey: "sk-test",
      provider: "openai",
      topicHints: ["cranial nerves"],
    });

    expect(userContent.toLowerCase()).toContain("cranial nerves");
    expect(userContent.toLowerCase()).toMatch(/must attempt/);
  });
});
