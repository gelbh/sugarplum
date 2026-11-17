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
  appendExtraUserSuffix,
  buildExtraUserSuffix,
  topicHintsPromptSuffix,
} from "../../worker/generation/feedback-hints";
import { generateUserPrompt } from "../../worker/generation/prompts";
import { mergeTopicHints } from "../../worker/generation/topic-hints";
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
          topicHints: Array.from({ length: 21 }, (_, i) => `h${i}`),
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
          topicHints: ["x".repeat(301)],
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
    expect(suffix.toLowerCase()).toMatch(/assess/);
    expect(suffix.toLowerCase()).toMatch(/grounded/);
    expect(suffix.toLowerCase()).toMatch(/do not invent/);
  });

  it("puts each hint on its own bullet line", () => {
    const suffix = topicHintsPromptSuffix(["cranial nerves", "spinal cord"]);
    expect(suffix).toContain("- cranial nerves\n- spinal cord");
    expect(suffix).not.toContain("cranial nerves; spinal cord");
  });

  it("returns empty string when hints are absent", () => {
    expect(topicHintsPromptSuffix([])).toBe("");
  });

  it("built generate user prompt includes the hint phrase", () => {
    const prompt = appendExtraUserSuffix(
      generateUserPrompt("brainstem notes"),
      buildExtraUserSuffix({ topicHints: ["cranial nerves"] }),
    );
    expect(prompt.toLowerCase()).toContain("cranial nerves");
    expect(prompt.toLowerCase()).toMatch(/assess/);
    expect(prompt).toContain("brainstem notes");
  });
});

describe("POST /api/decks/:id/topic-generate", () => {
  function seedDeckWithMaterialAndCards(env: ReturnType<typeof createTestEnv>) {
    seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-a",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-a.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedGenerationJob({
      id: "job-old",
      material_id: "mat-a",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:00:00.000Z",
      finished_at: "2026-01-01T01:05:00.000Z",
    });
    env.seedCard({
      id: "c-keep-1",
      deck_id: "deck-a",
      job_id: "job-old",
      type: "qa",
      front_json: JSON.stringify("Keep 1?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T01:06:00.000Z",
      updated_at: "2026-01-01T01:06:00.000Z",
    });
    env.seedCard({
      id: "c-keep-2",
      deck_id: "deck-a",
      job_id: "job-old",
      type: "qa",
      front_json: JSON.stringify("Keep 2?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:07:00.000Z",
      updated_at: "2026-01-01T01:07:00.000Z",
    });
  }

  it("queues a new job with topic hint and leaves existing cards intact", async () => {
    const env = createTestEnv();
    seedDeckWithMaterialAndCards(env);
    const cardsBefore = env.getCards().length;

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { jobId: string };
    expect(body.jobId).toBeTruthy();
    expect(body.jobId).not.toBe("job-old");

    expect(env.getCards()).toHaveLength(cardsBefore);
    expect(env.getCards().map((c) => c.id).sort()).toEqual([
      "c-keep-1",
      "c-keep-2",
    ]);

    const jobs = env.getGenerationJobs();
    expect(jobs).toHaveLength(2);
    const created = jobs.find((j) => j.id === body.jobId);
    expect(created).toMatchObject({
      material_id: "mat-a",
      status: "queued",
    });
    expect(JSON.parse(created?.topic_hints_json as string)).toEqual([
      "cranial nerves",
    ]);

    const queued = env.getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued.some((m) => m.jobId === body.jobId)).toBe(true);
  });

  it("returns 400 for an empty topic", async () => {
    const env = createTestEnv();
    seedDeckWithMaterialAndCards(env);

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "   " }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect(env.getGenerationJobs()).toHaveLength(1);
  });

  it("returns 404 for another user's deck", async () => {
    const env = createTestEnv();
    seedDeckWithMaterialAndCards(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-b`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect(env.getGenerationJobs()).toHaveLength(1);
    expect(env.getCards()).toHaveLength(2);
  });

  it("returns 422 when the deck has no paste/pdf material", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ topic: "cranial nerves" }),
      },
      env,
    );

    expect(res.status).toBe(422);
    expect(env.getGenerationJobs()).toHaveLength(0);
  });

  it("rejects free-path image generate with DIY occlusion guidance", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img.png",
      filename: "diagram.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/topic-generate",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          topic: "labels",
          materialId: "mat-img",
        }),
      },
      env,
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; message?: string };
    const msg = body.error ?? body.message ?? JSON.stringify(body);
    expect(msg).toMatch(/Occlusion|suggested automatically|API key/i);
    expect(env.getGenerationJobs()).toHaveLength(0);
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
      calls.some(([input]) =>
        (input.extraUserSuffix ?? "").toLowerCase().includes("cranial nerves"),
      ),
    ).toBe(true);
  });

  it("merges this run's topic hints ahead of job hints", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-run",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-run.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(
      "materials/deck-a/mat-run.txt",
      "The brainstem contains cranial nerve nuclei that innervate the head.",
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-run",
      deckId: "deck-a",
      topicHints: ["cranial nerves"],
    });
    const job0 = env.getGenerationJobs().find((j) => j.id === jobId)!;
    env.seedGenerationJob({
      ...job0,
      run_topic_hints_json: JSON.stringify(["nuclei of the head"]),
    });
    const base = mockLlmAdapter();
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(base.generateDrafts.bind(base)),
      complete: vi.fn(base.complete.bind(base)),
    };

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-run", deckId: "deck-a" },
      { llm },
    );

    const suffixes = vi
      .mocked(llm.generateDrafts)
      .mock.calls.map(([input]) => (input.extraUserSuffix ?? "").toLowerCase());
    expect(
      suffixes.some((s) =>
        s.includes("- nuclei of the head\n- cranial nerves"),
      ),
    ).toBe(true);
    const job = env.getGenerationJobs().find((j) => j.id === jobId)!;
    expect(job.topic_hints_json).toBe(JSON.stringify(["cranial nerves"]));
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
      extraUserSuffix: buildExtraUserSuffix({
        topicHints: ["cranial nerves"],
      }),
    });

    expect(userContent.toLowerCase()).toContain("cranial nerves");
    expect(userContent.toLowerCase()).toMatch(/assess/);
  });
});

describe("avoidPatterns prompt wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes job avoid patterns into generateDrafts", async () => {
    const env = createTestEnv();
    seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-avoid",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-avoid.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(
      "materials/deck-a/mat-avoid.txt",
      "The brainstem contains cranial nerve nuclei that innervate the head.",
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-avoid",
      deckId: "deck-a",
    });
    const job = env.getGenerationJobs().find((j) => j.id === jobId)!;
    env.seedGenerationJob({
      ...job,
      avoid_patterns_json: JSON.stringify(["Rejected stem about CN III"]),
    });
    const base = mockLlmAdapter();
    const llm: LlmAdapter = {
      generateDrafts: vi.fn(base.generateDrafts.bind(base)),
      complete: vi.fn(base.complete.bind(base)),
    };

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-avoid", deckId: "deck-a" },
      { llm },
    );

    expect(llm.generateDrafts).toHaveBeenCalled();
    const calls = vi.mocked(llm.generateDrafts).mock.calls;
    expect(
      calls.some(([input]) =>
        (input.extraUserSuffix ?? "")
          .toLowerCase()
          .includes("rejected stem about cn iii"),
      ),
    ).toBe(true);
  });

  it("openai generate user message includes avoid-pattern language", async () => {
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
      extraUserSuffix: buildExtraUserSuffix({
        avoidPatterns: ["Rejected stem about CN III"],
      }),
    });

    expect(userContent.toLowerCase()).toContain("rejected stem about cn iii");
    expect(userContent.toLowerCase()).toMatch(/avoid near-duplicates/);
  });
});

describe("mergeTopicHints", () => {
  it("puts selected first and keeps the selected copy on case-insensitive dupes", () => {
    expect(
      mergeTopicHints(["Krebs cycle", "ATP"], ["atp", "glycolysis"]),
    ).toEqual(["Krebs cycle", "ATP", "glycolysis"]);
  });

  it("caps by dropping existing hints, never selected ones", () => {
    expect(
      mergeTopicHints(["s1", "s2", "s3", "s4"], ["e1", "e2"], 5),
    ).toEqual(["s1", "s2", "s3", "s4", "e1"]);
  });

  it("trims and skips blank entries", () => {
    expect(mergeTopicHints(["  ", "x "], ["", "y"])).toEqual(["x", "y"]);
  });
});
