import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  resetTestDb,
  seedCard,
  seedCardsReviewOwner,
  seedMaterial,
  seedNeedsReviewJob,
} from "./harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("PATCH /api/cards draft fields", () => {
  it("patch preserves image_label type", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-img",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "image_label",
      front_json: JSON.stringify("Label the aorta"),
      back_json: JSON.stringify("Aorta"),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-img",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: "Label the aortic arch",
          back: "Aortic arch",
          type: "image_label",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; front: string };
    expect(body.type).toBe("image_label");
    expect(body.front).toBe("Label the aortic arch");
    expect((await getCards(env)).find((c) => c.id === "card-img")?.type).toBe(
      "image_label",
    );
  });

  it("patch round-trips occlusion structured front and keeps type", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    const front = {
      image_key: "materials/deck-a/m1.png",
      prompt: "Identify the hidden structure",
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
      mode: "hide_one" as const,
    };
    await seedCard(env, {
      id: "card-occ",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "occlusion",
      front_json: JSON.stringify(front),
      back_json: JSON.stringify({ answer: "Femur head" }),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const nextFront = {
      ...front,
      regions: [
        {
          id: "r1",
          x: 0.15,
          y: 0.22,
          w: 0.28,
          h: 0.3,
          label: "Femoral head",
        },
      ],
    };
    const res = await app.request(
      "/api/cards/card-occ",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: nextFront,
          back: { answer: "Femoral head" },
          type: "occlusion",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      type: string;
      front: typeof nextFront;
      back: { answer: string };
    };
    expect(body.type).toBe("occlusion");
    expect(body.front).toEqual(nextFront);
    expect(body.back).toEqual({ answer: "Femoral head" });

    const stored = (await getCards(env)).find((c) => c.id === "card-occ");
    expect(stored?.type).toBe("occlusion");
    expect(JSON.parse(stored!.front_json)).toEqual(nextFront);
    expect(JSON.parse(stored!.back_json)).toEqual({ answer: "Femoral head" });
  });

  it("patch rejects occlusion with string front", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-occ-bad",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "occlusion",
      front_json: JSON.stringify({
        image_key: "materials/deck-a/m1.png",
        regions: [{ id: "r1", x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: "A" }],
        mode: "hide_one",
      }),
      back_json: JSON.stringify({ answer: "A" }),
      media_r2_keys_json: JSON.stringify(["materials/deck-a/m1.png"]),
      provenance_json: JSON.stringify({ pages: [], excerpt: "fig" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-occ-bad",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          front: "not a structured front",
          back: { answer: "A" },
          type: "occlusion",
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("lists mcq drafts with back and options", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedNeedsReviewJob(env, {
      jobId: "job-mcq",
      materialId: "mat-mcq",
      deckId: "deck-a",
      cards: [],
    });
    const options = ["Adenosine triphosphate", "Adenosine diphosphate", "RNA"];
    await seedCard(env, {
      id: "card-mcq",
      deck_id: "deck-a",
      job_id: "job-mcq",
      type: "mcq",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify({
        answer: "Adenosine triphosphate",
        options,
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/jobs/job-mcq/drafts",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      type: string;
      back: string;
      options: string[];
    }[];
    expect(body).toHaveLength(1);
    expect(body[0]!.type).toBe("mcq");
    expect(body[0]!.back).toBe("Adenosine triphosphate");
    expect(body[0]!.options).toEqual(options);
  });

  it("patch updates mcq correct answer and options", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    const options = ["Aorta", "Vena cava", "Pulmonary artery"];
    await seedCard(env, {
      id: "card-mcq-patch",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify(
        "Which vessel carries oxygenated blood from the heart?",
      ),
      back_json: JSON.stringify({ answer: "Aorta", options }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "aorta" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const newOptions = ["Aorta", "Vena cava", "Pulmonary vein"];
    const res = await app.request(
      "/api/cards/card-mcq-patch",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          back: "Pulmonary vein",
          options: newOptions,
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      back: string;
      options: string[];
    };
    expect(body.back).toBe("Pulmonary vein");
    expect(body.options).toEqual(newOptions);

    const stored = (await getCards(env)).find((c) => c.id === "card-mcq-patch");
    expect(JSON.parse(stored!.back_json)).toEqual({
      answer: "Pulmonary vein",
      options: newOptions,
    });
  });

  it("patch trims mcq answer and options for exact grade match", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-mcq-trim",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify("What is ATP?"),
      back_json: JSON.stringify({
        answer: "ATP",
        options: ["ATP", "ADP", "RNA"],
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ATP" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-mcq-trim",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          back: "ATP",
          options: ["ATP ", "ADP", "RNA"],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { back: string; options: string[] };
    expect(body.back).toBe("ATP");
    expect(body.options).toEqual(["ATP", "ADP", "RNA"]);
    const stored = (await getCards(env)).find((c) => c.id === "card-mcq-trim");
    expect(JSON.parse(stored!.back_json)).toEqual({
      answer: "ATP",
      options: ["ATP", "ADP", "RNA"],
    });
  });

  it("accept rejects invalid mcq drafts", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-mcq-bad",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "mcq",
      front_json: JSON.stringify("Broken MCQ?"),
      back_json: JSON.stringify({
        answer: "Only two",
        options: ["Only two", "Options"],
      }),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "x" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-mcq-bad/accept",
      {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );
    expect(res.status).toBe(400);
    expect((await getCards(env)).find((c) => c.id === "card-mcq-bad")!.status).toBe(
      "draft",
    );
  });

  it("patch provenance_pages only merges pages and keeps excerpt", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-prov-pages",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({
        pages: [1],
        excerpt: "keep me",
        extra: true,
      }),
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-prov-pages",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ provenance_pages: [4, 4, 2] }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provenance: unknown };
    expect(body.provenance).toEqual({
      pages: [2, 4],
      excerpt: "keep me",
      extra: true,
    });
    const stored = (await getCards(env)).find((c) => c.id === "card-prov-pages");
    expect(JSON.parse(stored!.provenance_json!)).toEqual({
      pages: [2, 4],
      excerpt: "keep me",
      extra: true,
    });
    expect(stored!.front_json).toBe(JSON.stringify("Q?"));
  });

  it("patch qa card keeps string back_json", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-qa",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Q?"),
      back_json: JSON.stringify("Original A"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-qa",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ front: "Updated Q?" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const stored = (await getCards(env)).find((c) => c.id === "card-qa");
    expect(stored!.back_json).toBe(JSON.stringify("Original A"));
  });

  it("patch cloze allows empty Extra back", async () => {
    const env = cfEnv;
    await seedCardsReviewOwner(env);
    await seedCard(env, {
      id: "card-cloze-extra",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "cloze",
      front_json: JSON.stringify("The {{c1::mitochondria}} is the powerhouse."),
      back_json: JSON.stringify("old extra"),
      media_r2_keys_json: null,
      provenance_json: JSON.stringify({ pages: [1], excerpt: "ex" }),
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/cards/card-cloze-extra",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ back: "" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const stored = (await getCards(env)).find((c) => c.id === "card-cloze-extra");
    expect(stored!.back_json).toBe(JSON.stringify(""));
  });
});
