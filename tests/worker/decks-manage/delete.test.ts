import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getCards,
  getMaterials,
  getR2Keys,
  getSchedules,
  resetTestDb,
  seedCard,
  seedDeck,
  seedMaterial,
  seedR2,
  seedSchedule,
  seedSession,
  seedSubject,
  seedUser,
} from "../harness";
import { afterEach, describe, it, expect } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

describe("DELETE /api/decks/:id", () => {
  it("deletes an owned deck and cascades cards and schedules", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-1",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-1",
      deck_id: "deck-1",
      job_id: null,
      type: "qa",
      front_json: '"Q"',
      back_json: '"A"',
      media_r2_keys_json: null,
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSchedule(env, {
      card_id: "card-1",
      due: "2026-01-02T00:00:00.000Z",
      stability: 1,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    });
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-1",
      kind: "paste",
      r2_key: null,
      filename: null,
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-1",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getCards(env))).toHaveLength(0);
    expect((await getSchedules(env))).toHaveLength(0);
    expect((await getMaterials(env))).toHaveLength(0);

    const listRes = await app.request(
      "/api/decks",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(await listRes.json()).toEqual([]);
  });

  it("deletes R2 keys for materials and card media before cascading", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-r2",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const materialKey = "materials/deck-r2/mat-1.pdf";
    const mediaKey = "materials/deck-r2/figures/0.png";
    await seedR2(env, materialKey, "pdf-bytes");
    await seedR2(env, mediaKey, "png-bytes");
    await seedR2(env, "materials/other-deck/keep.pdf", "keep");
    await seedMaterial(env, {
      id: "mat-r2",
      deck_id: "deck-r2",
      kind: "pdf",
      r2_key: materialKey,
      filename: "mat-1.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedCard(env, {
      id: "card-r2",
      deck_id: "deck-r2",
      job_id: null,
      type: "image_label",
      front_json: "{}",
      back_json: "{}",
      media_r2_keys_json: JSON.stringify([mediaKey]),
      provenance_json: null,
      status: "accepted",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-r2",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getR2Keys(env))).toEqual(["materials/other-deck/keep.pdf"]);
    expect((await getMaterials(env))).toHaveLength(0);
    expect((await getCards(env))).toHaveLength(0);
  });

  it("deletes R2-only figure crops under figures/{pdfId}/ with no materials row", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedSubject(env, {
      id: "sub-1",
      user_id: "user-a",
      title: "Anatomy",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-fig",
      user_id: "user-a",
      title: "Bones",
      subject_hint: null,
      subject_id: "sub-1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const materialKey = "materials/deck-fig/mat-pdf.pdf";
    const figureKey = "materials/deck-fig/figures/mat-pdf/0.png";
    await seedR2(env, materialKey, "pdf-bytes");
    await seedR2(env, figureKey, "png-bytes");
    await seedR2(env, "materials/other-deck/keep.pdf", "keep");
    await seedMaterial(env, {
      id: "mat-pdf",
      deck_id: "deck-fig",
      kind: "pdf",
      r2_key: materialKey,
      filename: "mat-pdf.pdf",
      page_count: 1,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-fig",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect((await getR2Keys(env))).toEqual(["materials/other-deck/keep.pdf"]);
    expect((await getMaterials(env))).toHaveLength(0);
  });

  it("returns 404 when deleting another user's deck", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedUser(env, {
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedSubject(env, {
      id: "sub-b",
      user_id: "user-b",
      title: "Theirs",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    await seedDeck(env, {
      id: "deck-b",
      user_id: "user-b",
      title: "Secret",
      subject_hint: null,
      subject_id: "sub-b",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-b",
      {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE}=sess-a` },
      },
      env,
    );

    expect(res.status).toBe(404);
  });
});
