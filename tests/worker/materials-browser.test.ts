import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { createTestEnv } from "./test-env";

type MaterialListRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  deck_title?: string;
};

describe("GET /api/decks/:id/materials", () => {
  it("lists deck materials and hides PDF figure crops", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MaterialListRow[];
    expect(body.map((row) => row.id)).toEqual(["paste-1"]);
    expect(body[0]).toMatchObject({
      id: "paste-1",
      kind: "paste",
      filename: "notes.txt",
    });
  });

  it("returns 404 when listing another user's deck materials", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("GET /api/materials", () => {
  it("returns owner materials with deck_title and excludes other users", async () => {
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
      title: "Anatomy",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "mine-old",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mine-old.txt",
      filename: "old.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "mine-new",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/mine-new.png",
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T03:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-hidden",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-1/0.png",
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T03:30:00.000Z",
    });
    env.seedMaterial({
      id: "theirs",
      deck_id: "deck-b",
      kind: "paste",
      r2_key: "materials/deck-b/theirs.txt",
      filename: "theirs.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T04:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as MaterialListRow[];
    expect(body.map((row) => row.id)).toEqual(["mine-new", "mine-old"]);
    expect(body.every((row) => row.deck_title === "Anatomy")).toBe(true);
    expect(body.some((row) => row.id === "theirs")).toBe(false);
    expect(body.some((row) => row.id === "figure-hidden")).toBe(false);
  });
});

describe("GET /api/materials/:id/download", () => {
  it("returns paste bytes with attachment disposition", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedR2("materials/deck-a/paste-1.txt", "hello paste body");

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello paste body");
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="notes.txt"',
    );
  });

  it("returns 404 when another user downloads", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedR2("materials/deck-a/paste-1.txt", "secret");
    env.seedSession("sess-b", "user-b");

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("returns 404 when R2 object is missing", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/paste-1/download",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/materials/:id", () => {
  it("deletes paste material, R2, and draft/rejected cards; keeps accepted with null job", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "paste-1",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/paste-1.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedR2("materials/deck-a/paste-1.txt", "paste body");
    env.seedGenerationJob({
      id: "job-1",
      material_id: "paste-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T01:10:00.000Z",
      finished_at: "2026-01-01T01:15:00.000Z",
    });
    env.seedCard({
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
    env.seedCard({
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
    env.seedCard({
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
    expect(env.getMaterials().some((m) => m.id === "paste-1")).toBe(false);
    expect(env.getR2Keys()).not.toContain("materials/deck-a/paste-1.txt");
    expect(env.getGenerationJobs().some((j) => j.id === "job-1")).toBe(false);
    expect(
      env
        .getCards()
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c-accepted"]);
    expect(env.getCards()[0]?.job_id).toBeNull();
  });

  it("returns 409 when accepted card media references a figure key", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    env.seedR2(figureKey, "png-bytes");
    env.seedCard({
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
    expect(env.getMaterials().some((m) => m.id === "figure-1")).toBe(true);
    expect(env.getR2Keys()).toContain(figureKey);
  });

  it("returns 409 when deleting pdf parent whose figure is referenced by accepted card media", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    env.seedMaterial({
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    env.seedR2(pdfKey, "pdf-bytes");
    env.seedR2(figureKey, "png-bytes");
    env.seedCard({
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
      env
        .getMaterials()
        .map((m) => m.id)
        .sort(),
    ).toEqual(["figure-1", "pdf-1"]);
    expect(env.getR2Keys().sort()).toEqual([figureKey, pdfKey].sort());
  });

  it("deletes pdf parent and unreferenced figure children plus R2", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    env.seedMaterial({
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    env.seedR2(pdfKey, "pdf-bytes");
    env.seedR2(figureKey, "png-bytes");
    env.seedR2("materials/deck-a/keep.txt", "keep");

    const res = await app.request(
      "/api/materials/pdf-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(env.getMaterials().map((m) => m.id)).toEqual([]);
    expect(env.getR2Keys().sort()).toEqual(["materials/deck-a/keep.txt"]);
  });

  it("deletes pdf when only draft cards reference figure media", async () => {
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
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    const pdfKey = "materials/deck-a/pdf-1.pdf";
    const figureKey = "materials/deck-a/figures/pdf-1/0.png";
    env.seedMaterial({
      id: "pdf-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: pdfKey,
      filename: "slides.pdf",
      page_count: 2,
      status: "ready",
      created_at: "2026-01-01T01:00:00.000Z",
    });
    env.seedMaterial({
      id: "figure-1",
      deck_id: "deck-a",
      kind: "image",
      r2_key: figureKey,
      filename: "crop.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T02:00:00.000Z",
    });
    env.seedR2(pdfKey, "pdf-bytes");
    env.seedR2(figureKey, "png-bytes");
    env.seedGenerationJob({
      id: "job-pdf",
      material_id: "pdf-1",
      status: "needs_review",
      error: null,
      coverage_json: null,
      progress_json: null,
      created_at: "2026-01-01T02:10:00.000Z",
      finished_at: "2026-01-01T02:15:00.000Z",
    });
    env.seedCard({
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
    expect(env.getMaterials().map((m) => m.id)).toEqual([]);
    expect(env.getCards().map((c) => c.id)).toEqual([]);
    expect(env.getR2Keys()).toEqual([]);
  });
});
