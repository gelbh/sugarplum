import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getGenerationJobs,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect, vi } from "vitest";
import { processGenerateJob } from "../../../worker/generation/consumer";
import { enqueueGeneration } from "../../../worker/generation/enqueue";
import {
  createLlmAdapter,
  mockLlmAdapter,
  type LlmAdapter,
} from "../../../worker/generation/llm";
import { buildExtraUserSuffix } from "../../../worker/generation/feedback-hints";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedPasteOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("topicHints consumer injection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes job topic hints into claim extract", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-hints",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-hints.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, 
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

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const extractUsers = vi
      .mocked(llm.complete)
      .mock.calls.filter((c) => {
        const s = (c[0] as { system: string }).system.toLowerCase();
        return s.includes("extract") && s.includes("claim");
      })
      .map((c) => (c[0] as { user: string }).user.toLowerCase());
    expect(extractUsers.some((u) => u.includes("cranial nerves"))).toBe(true);
  });

  it("merges this run's topic hints ahead of job hints", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-run",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-run.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/mat-run.txt",
      "The brainstem contains cranial nerve nuclei that innervate the head.",
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-run",
      deckId: "deck-a",
      topicHints: ["cranial nerves"],
    });
    const job0 = (await getGenerationJobs(env)).find((j) => j.id === jobId)!;
    await seedGenerationJob(env, {
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

    const extractUsers = vi
      .mocked(llm.complete)
      .mock.calls.filter((c) => {
        const s = (c[0] as { system: string }).system.toLowerCase();
        return s.includes("extract") && s.includes("claim");
      })
      .map((c) => (c[0] as { user: string }).user.toLowerCase());
    expect(
      extractUsers.some((u) =>
        u.includes("- nuclei of the head\n- cranial nerves"),
      ),
    ).toBe(true);
    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId)!;
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
    expect(userContent.toLowerCase()).toMatch(/steer|cover|prefer/);
  });
});
