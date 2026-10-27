import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { processGenerateJob } from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import { mockLlmAdapter } from "../../worker/generation/llm";
import {
  parseCardDrafts,
  type OcclusionFront,
} from "../../worker/generation/schema";
import { createTestEnv } from "./test-env";

describe("image / diagram card drafts", () => {
  it("parses image_label and diagram drafts", () => {
    const drafts = parseCardDrafts([
      {
        type: "image_label",
        front: "Name the labelled structure",
        back: "Femur",
        provenance: { pages: [1], excerpt: "labelled bone" },
      },
      {
        type: "diagram",
        front: "What sits superior to the labelled structure?",
        back: "Pelvis",
        provenance: { pages: [1], excerpt: "spatial relation" },
      },
    ]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.type).toBe("image_label");
    expect(drafts[1]?.type).toBe("diagram");
  });

  it("parses occlusion drafts with normalized regions", () => {
    const drafts = parseCardDrafts([
      {
        type: "occlusion",
        front: {
          image_key: "materials/deck-a/fig.png",
          regions: [
            {
              id: "r1",
              x: 0.1,
              y: 0.2,
              w: 0.3,
              h: 0.25,
              label: "Femur head",
            },
          ],
          mode: "hide_one",
        },
        back: { answer: "Femur head" },
        provenance: { pages: [1], excerpt: "labelled femur" },
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.type).toBe("occlusion");
    if (drafts[0]?.type === "occlusion") {
      expect(drafts[0].front.regions[0]!.x).toBeGreaterThanOrEqual(0);
      expect(drafts[0].front.regions[0]!.x).toBeLessThanOrEqual(1);
      expect(drafts[0].front.mode).toBe("hide_one");
    }
  });

  it("mock vision path returns occlusion plus image card types", async () => {
    const drafts = await mockLlmAdapter().generateDrafts({
      text: "",
      apiKey: "x",
      provider: "mock",
      imageKey: "materials/deck-a/mat-img.png",
      image: { mimeType: "image/png", base64: "AAAA" },
    });
    expect(drafts.some((d) => d.type === "occlusion")).toBe(true);
    expect(
      drafts.every(
        (d) =>
          d.type === "occlusion" ||
          d.type === "image_label" ||
          d.type === "diagram",
      ),
    ).toBe(true);
    const occlusion = drafts.find((d) => d.type === "occlusion");
    expect(occlusion?.type).toBe("occlusion");
    if (occlusion?.type === "occlusion") {
      expect(occlusion.front.image_key).toBe("materials/deck-a/mat-img.png");
      expect(occlusion.front.regions.length).toBeGreaterThanOrEqual(1);
      expect(occlusion.front.regions.length).toBeLessThanOrEqual(8);
      for (const r of occlusion.front.regions) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x).toBeLessThanOrEqual(1);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeLessThanOrEqual(1);
        expect(r.w).toBeGreaterThan(0);
        expect(r.w).toBeLessThanOrEqual(1);
        expect(r.h).toBeGreaterThan(0);
        expect(r.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it("image generate persists occlusion draft and accept creates schedule", async () => {
    const env = createTestEnv();
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
      title: "A",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const imageKey = "materials/deck-a/mat-img.png";
    env.seedMaterial({
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: imageKey,
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(imageKey, "fakepng");
    env.seedSession("sess-a", "user-a");

    const jobId = await enqueueGeneration(env, {
      materialId: "mat-img",
      deckId: "deck-a",
    });
    await processGenerateJob(
      env,
      { jobId, materialId: "mat-img", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );

    const job = env.getGenerationJobs().find((j) => j.id === jobId);
    expect(job?.status).toBe("needs_review");

    const cards = env.getCards();
    const occlusion = cards.find((c) => c.type === "occlusion");
    expect(occlusion).toBeTruthy();
    expect(occlusion!.status).toBe("draft");

    const mediaKeys = JSON.parse(occlusion!.media_r2_keys_json ?? "[]") as string[];
    expect(mediaKeys).toContain(imageKey);

    const front = JSON.parse(occlusion!.front_json) as OcclusionFront;
    expect(front.image_key).toBe(imageKey);
    expect(mediaKeys).toContain(front.image_key);
    expect(front.mode).toBe("hide_one");
    expect(front.regions.length).toBeGreaterThanOrEqual(1);
    expect(typeof front.regions[0]!.label).toBe("string");

    const back = JSON.parse(occlusion!.back_json) as { answer: string };
    expect(back.answer.length).toBeGreaterThan(0);

    const imageLabel = cards.find((c) => c.type === "image_label");
    expect(imageLabel).toBeTruthy();
    expect(JSON.parse(imageLabel!.front_json)).toEqual(expect.any(String));

    const acceptRes = await app.request(
      `/api/cards/${occlusion!.id}/accept`,
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(acceptRes.status).toBe(200);

    const accepted = env.getCards().find((c) => c.id === occlusion!.id);
    expect(accepted?.status).toBe("accepted");
    const schedules = env.getSchedules();
    expect(schedules.some((s) => s.card_id === occlusion!.id)).toBe(true);
  });

  it("serves owned media and 404s for others", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "A",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mat-img.png",
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2("materials/deck-a/mat-img.png", "fakepng");
    env.seedSession("sess-a", "user-a");
    env.seedSession("sess-b", "user-b");

    const ok = await app.request(
      "/api/materials/media?key=materials%2Fdeck-a%2Fmat-img.png",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(await ok.text()).toBe("fakepng");

    const denied = await app.request(
      "/api/materials/media?key=materials%2Fdeck-a%2Fmat-img.png",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(denied.status).toBe(404);
  });

  it("accepts image upload-url metadata", async () => {
    const env = createTestEnv();
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
      title: "A",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");

    const res = await app.request(
      "/api/decks/deck-a/materials/upload-url",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          filename: "fig.png",
          contentType: "image/png",
          size: 512,
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.getMaterials()[0]?.kind).toBe("image");
  });
});
