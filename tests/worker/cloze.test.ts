import { describe, it, expect } from "vitest";
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
import { createTestEnv, TEST_SECRETS_WRAP_KEY } from "./test-env";

describe("assertSingleCloze", () => {
  it("rejects multi-blank cloze", () => {
    expect(() => assertSingleCloze("{{c1::a}} and {{c2::b}}")).toThrow();
  });

  it("allows a single Anki cloze blank", () => {
    expect(() => assertSingleCloze("Paris is {{c1::France}}'s capital")).not.toThrow();
  });

  it("rejects multiple underscore blanks", () => {
    expect(() => assertSingleCloze("___ and ___")).toThrow();
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

  it("rejects cloze with multiple blanks via schema", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "{{c1::a}} and {{c2::b}}",
      back: "x",
      provenance: { pages: [1], excerpt: "ex" },
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

  it("keeps valid cards when some cloze drafts are multi-blank", () => {
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
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.type)).toEqual(["qa", "cloze"]);
    expect(drafts[1]?.front).toBe("Hello {{c1::world}}");
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
  async function seedPasteOwner(env: ReturnType<typeof createTestEnv>) {
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
      title: "Bio",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const ciphertext = await encryptSecret(
      "sk-test-mock-key",
      TEST_SECRETS_WRAP_KEY,
    );
    env.seedUserSecret({
      user_id: "user-a",
      provider: "mock",
      ciphertext,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }

  it("paste enqueue → consumer drafts → job needs_review; GET /api/jobs/:id polls", async () => {
    const env = createTestEnv();
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

    const queued = env.getQueueMessages() as {
      jobId: string;
      materialId: string;
      deckId: string;
    }[];
    expect(queued).toHaveLength(1);
    expect(queued[0]!.jobId).toBe(pasteBody.jobId);

    await processGenerateJob(env, queued[0]!, { llm: mockLlmAdapter() });

    const jobs = env.getGenerationJobs();
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
    expect(storedProgress.stage).toBe("persist");
    expect(storedProgress.percent).toBe(100);
    expect(storedProgress.label).toBeTruthy();

    const cards = env.getCards();
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
    expect(poll.progress!.stage).toBe("persist");
    expect(poll.progress!.percent).toBe(100);
  });

  it("failed job leaves last progress_json and GET returns it", async () => {
    const env = createTestEnv();
    await seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-pdf",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-pdf-progress.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2("materials/deck-a/mat-pdf-progress.pdf", "%PDF-fake");

    const { enqueueGeneration } = await import(
      "../../worker/generation/enqueue"
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
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
    const env = createTestEnv();
    await seedPasteOwner(env);
    env.seedMaterial({
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
    env.seedR2(
      "materials/deck-a/mat-pdf.pdf",
      new TextDecoder().decode(pdfBytes),
    );

    const { enqueueGeneration } = await import(
      "../../worker/generation/enqueue"
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect(env.getCards().length).toBeGreaterThan(0);
  });

  it("empty PDF extract fails the job with an actionable hint", async () => {
    const env = createTestEnv();
    await seedPasteOwner(env);
    env.seedMaterial({
      id: "mat-pdf-empty",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-empty.pdf",
      filename: "scan.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2("materials/deck-a/mat-empty.pdf", "%PDF-1.1\n%%EOF");

    const { enqueueGeneration } = await import(
      "../../worker/generation/enqueue"
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf-empty",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf-empty", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toMatch(/PDF|OCR|text/i);
    expect(env.getCards()).toHaveLength(0);
  });

  it("GET /api/jobs/:id returns 404 for another user", async () => {
    const env = createTestEnv();
    await seedPasteOwner(env);
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const { enqueueGeneration } = await import(
      "../../worker/generation/enqueue"
    );
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
