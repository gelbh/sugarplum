import { env as cfEnv } from "cloudflare:workers";
import {
  getCards,
  getGenerationJobs,
  getMaterials,
  getR2Keys,
  resetTestDb,
  seedCard,
  seedDeck,
  seedGenerationJob,
  seedMaterial,
  seedR2,
  seedSession,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("DELETE /api/materials/:id", () => {
  it("deletes paste material, R2, and draft/rejected cards; keeps accepted with null job", async () => {
    const env = cfEnv;
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
    await seedMaterial(env, {
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedR2(env, "materials/deck-a/paste-1.txt", "paste body");
    await seedGenerationJob(env, {
      id: "job-1",
      material_id: "paste-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:10:00.000Z",
      finished_at: "2026-01-01T01:15:00.000Z",
    });
    await seedCard(env, {
      id: "c-draft",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Draft?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T01:16:00.000Z",
      updated_at: "2026-01-01T01:16:00.000Z",
    });
    await seedCard(env, {
      id: "c-rejected",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Rejected?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "rejected",
      created_at: "2026-01-01T01:17:00.000Z",
      updated_at: "2026-01-01T01:17:00.000Z",
    });
    await seedCard(env, {
      id: "c-accepted",
      deck_id: "deck-a",
      job_id: "job-1",
      type: "qa",
      front_json: JSON.stringify("Accepted?"),
      back_json: JSON.stringify("A"),
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T01:18:00.000Z",
      updated_at: "2026-01-01T01:18:00.000Z",
    });

    const res = await app.request(
      "/api/materials/paste-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getMaterials(env)).some((m) => m.id === "paste-1")).toBe(false);
    expect((await getR2Keys(env))).not.toContain("materials/deck-a/paste-1.txt");
    expect((await getGenerationJobs(env)).some((j) => j.id === "job-1")).toBe(false);
    expect(
      (await getCards(env))
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c-accepted"]);
    expect((await getCards(env))[0]?.job_id).toBeNull();
  });

  it("returns 409 when accepted card media references a figure key", async () => {
    const env = cfEnv;
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
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    await seedR2(env, figureKey, "png-bytes");
    await seedCard(env, {
      id: "c-media",
      deck_id: "deck-a",
      job_id: null,
      type: "image_label",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: JSON.stringify([figureKey]),
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T03:00:00.000Z",
      updated_at: "2026-01-01T03:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/figure-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
    expect((await getMaterials(env)).some((m) => m.id === "figure-1")).toBe(true);
    expect((await getR2Keys(env))).toContain(figureKey);
  });

  it("returns 409 when deleting pdf parent whose figure is referenced by accepted card media", async () => {
    const env = cfEnv;
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
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    await seedMaterial(env, {
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    await seedR2(env, pdfKey, "pdf-bytes");
    await seedR2(env, figureKey, "png-bytes");
    await seedCard(env, {
      id: "c-media",
      deck_id: "deck-a",
      job_id: null,
      type: "image_label",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: JSON.stringify([figureKey]),
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T03:00:00.000Z",
      updated_at: "2026-01-01T03:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/pdf-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(409);
    expect(
      (await getMaterials(env))
        .map((m) => m.id)
        .sort(),
    ).toEqual(["figure-1", "pdf-1"]);
    expect((await getR2Keys(env)).sort()).toEqual([figureKey, pdfKey].sort());
  });

  it("deletes pdf parent and unreferenced figure children plus R2", async () => {
    const env = cfEnv;
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
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    await seedMaterial(env, {
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    await seedR2(env, pdfKey, "pdf-bytes");
    await seedR2(env, figureKey, "png-bytes");
    await seedR2(env, "materials/deck-a/keep.txt", "keep");

    const res = await app.request(
      "/api/materials/pdf-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getMaterials(env)).map((m) => m.id)).toEqual([]);
    expect((await getR2Keys(env)).sort()).toEqual(["materials/deck-a/keep.txt"]);
  });

  it("deletes pdf when only draft cards reference figure media", async () => {
    const env = cfEnv;
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
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    await seedMaterial(env, {
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    await seedMaterial(env, {
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    await seedR2(env, pdfKey, "pdf-bytes");
    await seedR2(env, figureKey, "png-bytes");
    await seedGenerationJob(env, {
      id: "job-pdf",
      material_id: "pdf-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T02:10:00.000Z",
      finished_at: "2026-01-01T02:15:00.000Z",
    });
    await seedCard(env, {
      id: "c-draft-fig",
      deck_id: "deck-a",
      job_id: "job-pdf",
      type: "image_label",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: JSON.stringify([figureKey]),
      provenance_json: null,
      status: "draft",
      created_at: "2026-01-01T02:16:00.000Z",
      updated_at: "2026-01-01T02:16:00.000Z",
    });

    const res = await app.request(
      "/api/materials/pdf-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getMaterials(env)).map((m) => m.id)).toEqual([]);
    expect((await getCards(env)).map((c) => c.id)).toEqual([]);
    expect((await getR2Keys(env))).toEqual([]);
  });
});
