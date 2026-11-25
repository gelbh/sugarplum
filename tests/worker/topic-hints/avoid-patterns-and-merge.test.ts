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
import { mergeTopicHints } from "../../../worker/generation/topic-hints";

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

describe("avoidPatterns prompt wiring", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes job avoid patterns into write/critique", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-avoid",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-avoid.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, 
      "materials/deck-a/mat-avoid.txt",
      "The brainstem contains cranial nerve nuclei that innervate the head.",
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-avoid",
      deckId: "deck-a",
    });
    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId)!;
    await seedGenerationJob(env, {
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

    expect(llm.generateDrafts).not.toHaveBeenCalled();
    const writeOrCritiqueUsers = vi
      .mocked(llm.complete)
      .mock.calls.filter((c) => {
        const s = (c[0] as { system: string }).system.toLowerCase();
        return (
          s.includes("critique") ||
          (s.includes("flashcard") && !s.includes("extract"))
        );
      })
      .map((c) => (c[0] as { user: string }).user.toLowerCase());
    expect(
      writeOrCritiqueUsers.some((u) =>
        u.includes("rejected stem about cn iii"),
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
    expect(mergeTopicHints(["s1", "s2", "s3", "s4"], ["e1", "e2"], 5)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "e1",
    ]);
  });

  it("trims and skips blank entries", () => {
    expect(mergeTopicHints(["  ", "x "], ["", "y"])).toEqual(["x", "y"]);
  });
});
