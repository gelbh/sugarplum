import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getGenerationJobs,
  getQueueMessages,
  installQueueRecorders,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
  seedUserSecret,
  TEST_SECRETS_WRAP_KEY,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import {
  assertSingleCloze,
  parseCardDrafts,
  CardDraftSchema,
} from "../../worker/generation/schema";
import { mockLlmAdapter } from "../../worker/generation/llm";
import { processGenerateJob } from "../../worker/generation/consumer";
import { encryptSecret } from "../../worker/crypto/secrets";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("assertSingleCloze", () => {
  it("allows multi-blank cloze", () => {
    expect(() => assertSingleCloze("{{c1::a}} and {{c2::b}}")).not.toThrow();
  });

  it("allows a single Anki cloze blank", () => {
    expect(() =>
      assertSingleCloze("Paris is {{c1::France}}'s capital"),
    ).not.toThrow();
  });

  it("allows multiple underscore blanks within the cap", () => {
    expect(() => assertSingleCloze("___ and ___")).not.toThrow();
  });

  it("rejects more than eight blanks", () => {
    const front = Array.from({ length: 9 }, (_, i) => `{{c${i + 1}::x}}`).join(
      " ",
    );
    expect(() => assertSingleCloze(front)).toThrow(/at most 8 blanks/);
  });
});

describe("CardDraft schema", () => {
  it("parses valid qa and cloze drafts", () => {
    const drafts = parseCardDrafts([
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "Hello {{c1::world}}",
        back: "world",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(2);
  });

  it("parses cloze with multiple blanks via schema", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "{{c1::a}} and {{c2::b}}",
      back: "x",
      provenance: { pages: [1], excerpt: "ex" },
    });
    expect(result.success).toBe(true);
  });

  it("parses cloze with empty Extra back", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "The organelle is {{c1::mitochondria}}.",
      back: "",
      provenance: { pages: [1], excerpt: "organelle" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.back).toBe("");
    }
  });

  it("rejects qa with empty back", () => {
    const result = CardDraftSchema.safeParse({
      type: "qa",
      front: "What is ATP?",
      back: "",
      provenance: { pages: [1], excerpt: "ATP" },
    });
    expect(result.success).toBe(false);
  });

  const mcqBase = {
    type: "mcq" as const,
    front: "What is ATP?",
    back: "Adenosine triphosphate",
    options: ["Adenosine triphosphate", "Glucose", "DNA"],
    provenance: { pages: [1], excerpt: "ATP energy" },
  };

  it("parses valid mcq with 3–5 options", () => {
    expect(CardDraftSchema.safeParse(mcqBase).success).toBe(true);
    const four = {
      ...mcqBase,
      options: [...mcqBase.options, "RNA"],
    };
    expect(CardDraftSchema.safeParse(four).success).toBe(true);
    const five = {
      ...mcqBase,
      options: [...mcqBase.options, "RNA", "Lipids"],
    };
    expect(CardDraftSchema.safeParse(five).success).toBe(true);
  });

  it("rejects mcq with fewer than 3 or more than 5 options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "Glucose"],
      }).success,
    ).toBe(false);
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: [
          "Adenosine triphosphate",
          "Glucose",
          "DNA",
          "RNA",
          "Lipids",
          "Water",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects mcq with duplicate or empty options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "Glucose", "Glucose"],
      }).success,
    ).toBe(false);
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        options: ["Adenosine triphosphate", "  ", "DNA"],
      }).success,
    ).toBe(false);
  });

  it("rejects mcq when back is not one of the options", () => {
    expect(
      CardDraftSchema.safeParse({
        ...mcqBase,
        back: "Not an option",
      }).success,
    ).toBe(false);
  });

  it("keeps valid mcq when parseCardDrafts skips invalid mcq drafts", () => {
    const drafts = parseCardDrafts([
      mcqBase,
      { ...mcqBase, options: ["a", "b"] },
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.type)).toEqual(["mcq", "qa"]);
  });

  it("keeps multi-blank cloze drafts with valid cards", () => {
    const drafts = parseCardDrafts([
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "{{c1::a}} and {{c2::b}}",
        back: "a",
        provenance: { pages: [1], excerpt: "ex" },
      },
      {
        type: "cloze",
        front: "Hello {{c1::world}}",
        back: "world",
        provenance: { pages: [1], excerpt: "ex" },
      },
    ]);
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.type)).toEqual(["qa", "cloze", "cloze"]);
    expect(drafts[1]?.front).toBe("{{c1::a}} and {{c2::b}}");
  });
});

describe("mock LLM adapter", () => {
  it("returns 2 QA + 1 cloze", async () => {
    const drafts = await mockLlmAdapter().generateDrafts({
      text: "Mitochondria produce ATP in eukaryotic cells.",
      apiKey: "unused",
      provider: "mock",
    });
    expect(drafts.filter((d) => d.type === "qa")).toHaveLength(2);
    expect(drafts.filter((d) => d.type === "cloze")).toHaveLength(1);
    expect(() => assertSingleCloze(drafts[2]!.front)).not.toThrow();
  });
});

describe("generation pipeline (paste + mock LLM)", () => {
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
      title: "Bio",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-a", "user-a");
    const ciphertext = await encryptSecret(
      "sk-test-mock-key",
      TEST_SECRETS_WRAP_KEY,
    );
    await seedUserSecret(env, {
      user_id: "user-a",
      provider: "mock",
      ciphertext,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }

  it("paste enqueue → consumer drafts → job needs_review; GET /api/jobs/:id polls", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);

    const pasteRes = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "Mitochondria are the powerhouse of the cell.",
        }),
      },
      env,
    );
    expect(pasteRes.status).toBe(201);
    const pasteBody = (await pasteRes.json()) as {
      id: string;
      jobId: string;
    };
    expect(pasteBody.jobId).toBeTruthy();

    const queued = getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued).toHaveLength(1);
    expect(queued[0]!.jobId).toBe(pasteBody.jobId);

    await processGenerateJob(env, queued[0]!, { llm: mockLlmAdapter() });

    const jobs = (await getGenerationJobs(env));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("needs_review");
    expect(jobs[0]!.error).toBeNull();
    expect(jobs[0]!.progress_json).not.toBeNull();
    const storedProgress = JSON.parse(jobs[0]!.progress_json!) as {
      stage: string;
      current: number;
      total: number;
      percent: number;
      label: string;
    };
    expect(storedProgress.stage).toBe("enrich");
    expect(storedProgress.percent).toBe(100);
    expect(storedProgress.label).toBeTruthy();

    const cards = (await getCards(env));
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.status === "draft")).toBe(true);
    expect(cards.filter((c) => c.type === "qa")).toHaveLength(2);
    expect(cards.filter((c) => c.type === "cloze")).toHaveLength(1);
    expect(cards.every((c) => c.job_id === pasteBody.jobId)).toBe(true);

    const pollRes = await app.request(
      `/api/jobs/${pasteBody.jobId}`,
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(pollRes.status).toBe(200);
    const poll = (await pollRes.json()) as {
      id: string;
      status: string;
      error: string | null;
      progress: {
        stage: string;
        current: number;
        total: number;
        percent: number;
        label: string;
      } | null;
    };
    expect(poll.id).toBe(pasteBody.jobId);
    expect(poll.status).toBe("needs_review");
    expect(poll.error).toBeNull();
    expect(poll.progress).not.toBeNull();
    expect(poll.progress!.stage).toBe("enrich");
    expect(poll.progress!.percent).toBe(100);
  });

  it("failed job leaves last progress_json and GET returns it", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-pdf-progress.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/mat-pdf-progress.pdf", "%PDF-fake");

    const { enqueueGeneration } =
      await import("../../worker/generation/enqueue");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId);
    expect(job?.status).toBe("failed");
    expect(job?.progress_json).not.toBeNull();
    const failedProgress = JSON.parse(job!.progress_json!) as {
      stage: string;
      percent: number;
    };
    expect(["queued", "extract"]).toContain(failedProgress.stage);

    const pollRes = await app.request(
      `/api/jobs/${jobId}`,
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(pollRes.status).toBe(200);
    const poll = (await pollRes.json()) as {
      status: string;
      progress: { stage: string } | null;
    };
    expect(poll.status).toBe("failed");
    expect(poll.progress).not.toBeNull();
    expect(poll.progress!.stage).toBe(failedProgress.stage);
  });

  it("PDF extract feeds generation and yields draft cards", async () => {
    const { minimalPdfWithText } = await import("./pdf-fixture");
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-pdf.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const pdfBytes = minimalPdfWithText("Mitochondria produce ATP");
    await seedR2(env, 
      "materials/deck-a/mat-pdf.pdf",
      new TextDecoder().decode(pdfBytes),
    );

    const { enqueueGeneration } =
      await import("../../worker/generation/enqueue");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect((await getCards(env)).length).toBeGreaterThan(0);
  });

  it("empty PDF extract fails the job with an actionable hint", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedMaterial(env, {
      id: "mat-pdf-empty",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-empty.pdf",
      filename: "scan.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/mat-empty.pdf", "%PDF-1.1\n%%EOF");

    const { enqueueGeneration } =
      await import("../../worker/generation/enqueue");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf-empty",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf-empty", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = (await getGenerationJobs(env)).find((j) => j.id === jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/PDF|OCR|text/i);
    expect((await getCards(env))).toHaveLength(0);
  });

  it("GET /api/jobs/:id returns 404 for another user", async () => {
    const env = installQueueRecorders(cfEnv);
    await seedPasteOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSession(env, "sess-b", "user-b");
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const { enqueueGeneration } =
      await import("../../worker/generation/enqueue");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-1",
      deckId: "deck-a",
    });

    const res = await app.request(
      `/api/jobs/${jobId}`,
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(res.status).toBe(404);
  });
});
