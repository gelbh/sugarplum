import { describe, expect, it } from "vitest";
import { app } from "../../../worker/index";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../../src/atlas/types";

type Env = ReturnType<typeof createTestEnv>;

const TS = "2026-02-01T00:00:00.000Z";

function seedOwner(env: Env) {
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

function authHeaders(json = false): HeadersInit {
  return {
    cookie: `${SESSION_COOKIE}=sess-a`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function createAtlas(env: Env): Promise<string> {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: authHeaders() },
    env,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

function patchEntry(env: Env, atlasId: string, entryId: string, body: unknown) {
  return app.request(
    `/api/atlas/${atlasId}/entries/${entryId}`,
    { method: "PATCH", headers: authHeaders(true), body: JSON.stringify(body) },
    env,
  );
}

async function listEntries(env: Env, atlasId: string): Promise<AtlasEntryView[]> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    { headers: authHeaders() },
    env,
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: AtlasEntryView[] }).entries;
}

async function createLearnerEntry(
  env: Env,
  atlasId: string,
  canonicalName: string,
): Promise<AtlasEntryView> {
  const res = await app.request(
    `/api/atlas/${atlasId}/entries`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        canonicalName,
        commonName: "Imaginary worm",
        fields: { group: "nematode" },
      }),
    },
    env,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as AtlasEntryView;
}

/** Legacy rows omit the 0042 columns; override rows list them last. */
async function seedOverlayRow(
  env: Env,
  atlasId: string,
  opts: {
    id: string;
    originKey: string;
    fieldsJson: string;
    overridesJson?: string;
  },
) {
  const dataset = datasetEntry(opts.originKey);
  if (opts.overridesJson === undefined) {
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(opts.id, atlasId, dataset.canonicalName, dataset.commonName,
        opts.fieldsJson, TS, TS, opts.originKey, 1, TS)
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO atlas_entries (
       id, atlas_id, canonical_name, common_name, fields_json, status,
       created_at, updated_at, origin_key, origin_version, edited_at, deleted_at,
       field_overrides_json, aliases_json
     ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(opts.id, atlasId, dataset.canonicalName, dataset.commonName,
      opts.fieldsJson, TS, TS, opts.originKey, 1, TS, null,
      opts.overridesJson, null)
    .run();
}

async function rawRow(env: Env, id: string) {
  return env.DB.prepare("SELECT * FROM atlas_entries WHERE id = ?")
    .bind(id)
    .first<{
      fields_json: string;
      field_overrides_json: string | null;
      common_name: string | null;
    }>();
}

function datasetEntry(key: string) {
  return loadParasiteDataset().entries.find((e) => e.key === key)!;
}

describe("stored field overrides on read", () => {
  it("lists override rows as dataset fields plus overrides", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-over",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ significance: "Mine" }),
    });

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.fields.significance).toBe("Mine");
    expect(view?.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
    expect(view?.editedFields).toEqual(["significance"]);
  });

  it("reads a legacy full-copy row exactly as before", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.fields).toEqual({ ...dataset.fields, significance: "Old copy" });
    expect(view?.editedFields).toEqual(["significance"]);
  });
});
