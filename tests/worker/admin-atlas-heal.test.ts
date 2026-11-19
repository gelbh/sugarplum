import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { emptyParasiteFields } from "../../worker/atlas/templates/parasite";
import { loadParasiteDataset } from "../../worker/atlas/datasets/parasites";
import { createTestEnv } from "./test-env";

const ADMIN_EMAIL = "ops@example.com";
const LEARNER_ID = "user-a";
const ADMIN_ID = "admin-u";

function seedAdmin(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-admin", ADMIN_ID);
}

function seedLearnerWithAtlas(env: ReturnType<typeof createTestEnv>) {
  env.seedUser({
    id: LEARNER_ID,
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", LEARNER_ID);
  env.seedSubject({
    id: "sub-1",
    user_id: LEARNER_ID,
    title: "Parasitology",
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

async function createAtlas(env: ReturnType<typeof createTestEnv>) {
  const res = await app.request(
    "/api/atlas",
    {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=sess-a` },
    },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

describe("POST /api/admin/atlas/heal-wiped-fields", () => {
  it("403 for non-admin", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedLearnerWithAtlas(env);
    const res = await app.request(
      "/api/admin/atlas/heal-wiped-fields",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-a`,
          "content-type": "application/json",
        },
        body: "{}",
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("defaults dry_run and reports healed without writing", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdmin(env);
    seedLearnerWithAtlas(env);
    const { id: atlasId } = await createAtlas(env);
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!;
    const wiped = {
      ...emptyParasiteFields(),
      definitiveHosts: ["sheep"],
    };
    const editedAt = "2026-02-01T00:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(
        "e-wiped",
        atlasId,
        dataset.canonicalName,
        "Common liver fluke",
        JSON.stringify(wiped),
        "2026-02-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        "fasciola-hepatica",
        1,
        editedAt,
      )
      .run();

    const dry = await app.request(
      "/api/admin/atlas/heal-wiped-fields",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-admin`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ atlasId }),
      },
      env,
    );
    expect(dry.status).toBe(200);
    const dryBody = (await dry.json()) as {
      scanned: number;
      healed: number;
      skipped: number;
      dry_run: boolean;
    };
    expect(dryBody.dry_run).toBe(true);
    expect(dryBody.healed).toBeGreaterThanOrEqual(1);

    const still = await env.DB.prepare(
      `SELECT fields_json, edited_at FROM atlas_entries WHERE id = ?`,
    )
      .bind("e-wiped")
      .first<{ fields_json: string; edited_at: string }>();
    expect(JSON.parse(still!.fields_json).lifecycleStages).toEqual([]);
    expect(still!.edited_at).toBe(editedAt);
  });

  it("dry_run:false updates fields_json and second run healed===0", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seedAdmin(env);
    seedLearnerWithAtlas(env);
    const { id: atlasId } = await createAtlas(env);
    const dataset = loadParasiteDataset().entries.find(
      (e) => e.key === "fasciola-hepatica",
    )!;
    const wiped = {
      ...emptyParasiteFields(),
      definitiveHosts: ["sheep"],
    };
    const editedAt = "2026-02-01T00:00:00.000Z";
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(
        "e-wiped-2",
        atlasId,
        dataset.canonicalName,
        "Common liver fluke",
        JSON.stringify(wiped),
        "2026-02-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        "fasciola-hepatica",
        1,
        editedAt,
      )
      .run();

    const mutate = await app.request(
      "/api/admin/atlas/heal-wiped-fields",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-admin`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ atlasId, dry_run: false }),
      },
      env,
    );
    expect(mutate.status).toBe(200);
    const mutateBody = (await mutate.json()) as { healed: number };
    expect(mutateBody.healed).toBeGreaterThanOrEqual(1);

    const row = await env.DB.prepare(
      `SELECT fields_json, edited_at FROM atlas_entries WHERE id = ?`,
    )
      .bind("e-wiped-2")
      .first<{ fields_json: string; edited_at: string }>();
    const fields = JSON.parse(row!.fields_json);
    expect(fields.definitiveHosts).toEqual(["sheep"]);
    expect(fields.lifecycleStages).toEqual(dataset.fields.lifecycleStages);
    expect(row!.edited_at).toBe(editedAt);

    const again = await app.request(
      "/api/admin/atlas/heal-wiped-fields",
      {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=sess-admin`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ atlasId, dry_run: false }),
      },
      env,
    );
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { healed: number };
    expect(againBody.healed).toBe(0);
  });
});
