import { describe, expect, it, vi } from "vitest";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import {
  processGenerateJob,
} from "../../worker/generation/consumer";
import type { LlmAdapter } from "../../worker/generation/llm";
import { createTestEnv } from "./test-env";
import { minimalPdfWithText } from "./pdf-fixture";

function seedPdf(env: ReturnType<typeof createTestEnv>, withFigure = false) {
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
  env.seedR2(
    "materials/deck-a/mat-pdf.pdf",
    new TextDecoder().decode(minimalPdfWithText("Mitochondria produce ATP")),
  );
  if (withFigure) {
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/mat-pdf/0.png",
      filename: "figure.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2("materials/deck-a/figures/mat-pdf/0.png", "figure-bytes");
  }
}

function visionLlm() {
  const generateDrafts = vi.fn(
    async ({ image }: { image?: unknown; text?: string }) =>
      image
        ? [
            {
              type: "image_label" as const,
              front: "What does the figure show?",
              back: "A diagram from the source.",
              provenance: { pages: [1], excerpt: "Figure p.1#0" },
            },
          ]
        : [
            {
              type: "qa" as const,
              front: "What does the text explain?",
              back: "The source material.",
              provenance: { pages: [1], excerpt: "text" },
            },
          ],
  );
  return {
    generateDrafts,
    complete: vi.fn(async () => JSON.stringify({ cards: [] })),
  } satisfies LlmAdapter;
}

describe("PDF consumer figure stage", () => {
  it("generates figure cards and stores the crop media key", async () => {
    const env = createTestEnv();
    seedPdf(env);
    env.DOCLING_URL = "http://docling.test";
    const oldFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      const uri = `data:image/png;base64,${btoa("crop")}`;
      return new Response(
        JSON.stringify({
          document: {
            json_content: JSON.stringify({
              pictures: [
                {
                  prov: [{ page_no: 1 }],
                  image: { uri },
                },
              ],
            }),
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const jobId = await enqueueGeneration(env, {
        materialId: "mat-pdf",
        deckId: "deck-a",
      });
      const llm = visionLlm();
      await processGenerateJob(
        env,
        { jobId, materialId: "mat-pdf", deckId: "deck-a" },
        { llm },
      );

      expect(
        env.getGenerationJobs()[0]?.status,
        env.getGenerationJobs()[0]?.error ?? "",
      ).toBe("needs_review");
      expect(env.getCards().some((card) => card.type === "image_label")).toBe(
        true,
      );
      expect(
        env
          .getCards()
          .map((card) => card.media_r2_keys_json)
          .filter(Boolean),
      ).toContain(JSON.stringify(["materials/deck-a/figures/mat-pdf/0.png"]));
      expect(JSON.parse(env.getGenerationJobs()[0]!.progress_json!).stage).toBe(
        "persist",
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it("keeps text generation working when Docling fails", async () => {
    const env = createTestEnv();
    seedPdf(env);
    env.DOCLING_URL = "http://docling.test";
    const oldFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("down", { status: 500 }));

    try {
      const jobId = await enqueueGeneration(env, {
        materialId: "mat-pdf",
        deckId: "deck-a",
      });
      await processGenerateJob(
        env,
        { jobId, materialId: "mat-pdf", deckId: "deck-a" },
        { llm: visionLlm() },
      );

      expect(
        env.getGenerationJobs()[0]?.status,
        env.getGenerationJobs()[0]?.error ?? "",
      ).toBe("needs_review");
      expect(env.getCards().length).toBeGreaterThan(0);
      expect(env.getCards().every((card) => card.media_r2_keys_json === null)).toBe(
        true,
      );
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it("uses pre-uploaded figure keys without Docling", async () => {
    const env = createTestEnv();
    seedPdf(env, true);
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });
    const llm = visionLlm();

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm },
    );

    expect(llm.generateDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ image: expect.any(Object) }),
    );
    expect(env.getCards().some((card) => card.media_r2_keys_json)).toBe(true);
  });

  it("allows figure-only generation when PDF text is empty", async () => {
    const env = createTestEnv();
    seedPdf(env, true);
    env.seedR2("materials/deck-a/mat-pdf.pdf", "%PDF-1.1\n%%EOF");
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });

    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: visionLlm() },
    );

    expect(env.getGenerationJobs()[0]?.status).toBe("needs_review");
    expect(env.getCards().some((card) => card.media_r2_keys_json)).toBe(true);
  });
});
