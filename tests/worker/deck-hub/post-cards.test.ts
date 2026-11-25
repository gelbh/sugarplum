import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getSchedules,
  resetTestDb,
  seedDeck,
  seedMaterial,
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

type CardBody = {
  id: string;
  deck_id: string;
  type: string;
  front: string | Record<string, unknown>;
  back: string | { answer: string };
  status: string;
  options?: string[];
  media_r2_keys?: string[];
};

async function seedOwner(env: Bindings) {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSubject(env, {
    id: "sub-1",
    user_id: "user-a",
    title: "Anatomy",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: "deck-a",
    user_id: "user-a",
    title: "Bones",
    subject_hint: null,
    subject_id: "sub-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedSession(env, "sess-a", "user-a");
}

function authHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...extra,
  };
}

describe("POST /api/decks/:id/cards", () => {
  it("creates an accepted qa card with a fresh schedule due near now", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const before = Date.now();

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "qa",
          front: "What is the femur?",
          back: "Thigh bone",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      deck_id: "deck-a",
      type: "qa",
      front: "What is the femur?",
      back: "Thigh bone",
      status: "accepted",
    });
    expect(body.id).toBeTruthy();

    const schedules = (await getSchedules(env));
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.card_id).toBe(body.id);
    expect(schedules[0]!.reps).toBe(0);
    expect(schedules[0]!.lapses).toBe(0);
    const dueMs = Date.parse(schedules[0]!.due);
    expect(dueMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(dueMs).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("creates cloze with empty Extra (back)", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "cloze",
          front: "The {{c1::femur}} is the thigh bone",
          back: "",
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      type: "cloze",
      front: "The {{c1::femur}} is the thigh bone",
      back: "",
      status: "accepted",
    });
  });

  it("returns 404 when creating on another user's deck", async () => {
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
      "/api/decks/deck-b/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "qa",
          front: "Q?",
          back: "A",
        }),
      },
      env,
    );

    expect(res.status).toBe(404);
  });

  it("creates an accepted occlusion card with media and schedule", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const imageKey = "materials/deck-a/slide.png";
    await seedMaterial(env, {
      id: "mat-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: imageKey,
      filename: "slide.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const occlusionFront = {
      image_key: imageKey,
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

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "occlusion",
          front: occlusionFront,
          back: { answer: "Femur head" },
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      deck_id: "deck-a",
      type: "occlusion",
      front: occlusionFront,
      back: { answer: "Femur head" },
      status: "accepted",
      media_r2_keys: [imageKey],
    });
    expect((await getSchedules(env)).some((s) => s.card_id === body.id)).toBe(true);
  });

  it("creates an accepted image_label card with media_r2_keys", async () => {
    const env = cfEnv;
    await seedOwner(env);
    const imageKey = "materials/deck-a/diagram.png";
    await seedMaterial(env, {
      id: "mat-diag",
      deck_id: "deck-a",
      kind: "image",
      r2_key: imageKey,
      filename: "diagram.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "image_label",
          front: "Name the labelled structure",
          back: "Femur",
          media_r2_keys: [imageKey],
        }),
      },
      env,
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as CardBody;
    expect(body).toMatchObject({
      type: "image_label",
      front: "Name the labelled structure",
      back: "Femur",
      status: "accepted",
      media_r2_keys: [imageKey],
    });
    expect((await getSchedules(env)).some((s) => s.card_id === body.id)).toBe(true);
  });

  it("rejects occlusion when image_key is not deck material", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "occlusion",
          front: {
            image_key: "materials/other-deck/stolen.png",
            regions: [
              {
                id: "r1",
                x: 0.1,
                y: 0.1,
                w: 0.2,
                h: 0.2,
                label: "X",
              },
            ],
            mode: "hide_one",
          },
          back: { answer: "X" },
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("rejects image_label without media_r2_keys", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const res = await app.request(
      "/api/decks/deck-a/cards",
      {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          type: "image_label",
          front: "Label",
          back: "Answer",
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });
});
