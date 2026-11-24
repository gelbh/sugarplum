import { env as cfEnv } from "cloudflare:workers";
import {
  type Bindings,
  getMaterials,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedSession,
  seedUser,
} from "./harness";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("materials source_role API", () => {
  async function seedOwner(env: Bindings) {
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

  it("persists suggested role on paste and returns it from list", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const create = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "tutorial body",
          filename: "Week2_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; source_role: string };
    expect(created.source_role).toBe("tutorial");
    expect((await getMaterials(env))[0]?.source_role).toBe("tutorial");

    const list = await app.request(
      "/api/decks/deck-a/materials",
      { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(list.status).toBe(200);
    const rows = (await list.json()) as Array<{
      id: string;
      source_role: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source_role).toBe("tutorial");
  });

  it("accepts an explicit source_role override on paste", async () => {
    const env = cfEnv;
    await seedOwner(env);

    const create = await app.request(
      "/api/decks/deck-a/materials/paste",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          text: "notes",
          filename: "Week2_TUTORIAL.pdf",
          source_role: "notes",
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { source_role: string };
    expect(created.source_role).toBe("notes");
  });

  it("patches source_role on an owned material", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "lecture",
    });

    const patch = await app.request(
      "/api/materials/mat-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ source_role: "past_paper" }),
      },
      env,
    );
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { source_role: string };
    expect(body.source_role).toBe("past_paper");
    expect((await getMaterials(env))[0]?.source_role).toBe("past_paper");
  });

  it("rejects an invalid source_role on patch", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: null,
      filename: "x.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "lecture",
    });

    const patch = await app.request(
      "/api/materials/mat-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({ source_role: "handout" }),
      },
      env,
    );
    expect(patch.status).toBe(400);
  });

  it("rejects a null JSON body on source_role patch", async () => {
    const env = cfEnv;
    await seedOwner(env);
    await seedMaterial(env, {
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: null,
      filename: "x.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      source_role: "lecture",
    });

    const patch = await app.request(
      "/api/materials/mat-1",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: "null",
      },
      env,
    );
    expect(patch.status).toBe(400);
  });
});
