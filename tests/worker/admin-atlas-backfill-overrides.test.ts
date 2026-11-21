import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { loadParasiteDataset } from "../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../src/atlas/types";
import { createTestEnv } from "./test-env";

const ADMIN_EMAIL = "ops@example.com";
const URL = "/api/admin/atlas/backfill-field-overrides";
type Env = ReturnType<typeof createTestEnv>;

const fasciola = () =>
  loadParasiteDataset().entries.find((e) => e.key === "fasciola-hepatica")!;

function seed(env: Env) {
  env.seedUser({
    id: "admin-u",
    email: ADMIN_EMAIL,
    password_hash: null,
    oauth_subject: "google-admin",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-admin", "admin-u");
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
}

async function atlasWithLegacyRow(
  env: Env,
  opts: { commonName?: string; fieldsJson?: string } = {},
): Promise<string> {
  const res = await app.request(
    "/api/atlas",
    { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
    env,
  );
  const { id: atlasId } = (await res.json()) as { id: string };
  const dataset = fasciola();
  const ts = "2026-02-01T00:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO atlas_entries (
       id, atlas_id, canonical_name, common_name, fields_json, status,
       created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
  )
    .bind("e-legacy", atlasId, dataset.canonicalName,
      opts.commonName ?? dataset.commonName,
      opts.fieldsJson ??
        JSON.stringify({ ...dataset.fields, significance: "Student text" }),
      ts, ts, "fasciola-hepatica", 1, ts)
    .run();
  return atlasId;
}

function post(env: Env, cookie: string, body: unknown) {
  return app.request(
    URL,
    {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${cookie}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    env,
  );
}

async function overridesOf(env: Env) {
  const row = await env.DB.prepare("SELECT * FROM atlas_entries WHERE id = ?")
    .bind("e-legacy")
    .first<{
      field_overrides_json: string | null;
      fields_json: string;
      common_name: string | null;
    }>();
  return row!;
}

async function fasciolaView(env: Env, atlasId: string) {
  const list = await app.request(
    `/api/atlas/${atlasId}/entries`,
    { headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
    env,
  );
  return ((await list.json()) as { entries: AtlasEntryView[] }).entries.find(
    (e) => e.originKey === "fasciola-hepatica",
  );
}

describe("POST /api/admin/atlas/backfill-field-overrides", () => {
  it("rejects non-admins", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    expect((await post(env, "sess-a", {})).status).toBe(403);
  });

  it("requires a scope when dry_run is false", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    expect((await post(env, "sess-admin", { dry_run: false })).status).toBe(400);
  });

  it("dry_run (the default) reports counts and writes nothing", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const atlasId = await atlasWithLegacyRow(env);
    const res = await post(env, "sess-admin", { atlasId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      scanned: 1,
      converted: 1,
      skipped: 0,
      skipped_corrupt: 0,
      dry_run: true,
    });
    const row = await overridesOf(env);
    expect(row.field_overrides_json ?? null).toBeNull();
    expect(row.common_name).toBe(fasciola().commonName);
  });

  it("writes the legacy diff, keeps the view, and is idempotent", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const atlasId = await atlasWithLegacyRow(env);
    const first = await post(env, "sess-admin", { atlasId, dry_run: false });
    expect(await first.json()).toMatchObject({ converted: 1, dry_run: false });
    const row = await overridesOf(env);
    expect(JSON.parse(row.field_overrides_json!)).toEqual({
      significance: "Student text",
    });
    // fields_json keeps the merged snapshot.
    expect(JSON.parse(row.fields_json)).toEqual({
      ...fasciola().fields,
      significance: "Student text",
    });
    // The legacy row copied the dataset name; the backfill nulls it.
    expect(row.common_name).toBeNull();

    const view = await fasciolaView(env, atlasId);
    expect(view?.fields.significance).toBe("Student text");
    expect(view?.editedFields).toEqual(["significance"]);

    // Converted rows no longer match the scan, so a rerun touches nothing.
    const again = await post(env, "sess-admin", { atlasId, dry_run: false });
    expect(await again.json()).toEqual({
      scanned: 0,
      converted: 0,
      skipped: 0,
      skipped_corrupt: 0,
      dry_run: false,
    });
  });

  it("keeps a learner's own common name and leaves dry runs untouched", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const atlasId = await atlasWithLegacyRow(env, { commonName: "Sheep fluke" });
    await post(env, "sess-admin", { atlasId });
    expect((await overridesOf(env)).common_name).toBe("Sheep fluke");
    await post(env, "sess-admin", { atlasId, dry_run: false });
    expect((await overridesOf(env)).common_name).toBe("Sheep fluke");
  });

  it("backfills a copy differing only by a missing nested default to {}", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const dataset = fasciola();
    expect(dataset.fields.lifecycleStages.length).toBeGreaterThan(0);
    // Written before lifecycle stages carried imageId.
    const oldStages = dataset.fields.lifecycleStages.map(
      ({ imageId: _dropped, ...stage }) => stage,
    );
    const atlasId = await atlasWithLegacyRow(env, {
      fieldsJson: JSON.stringify({ ...dataset.fields, lifecycleStages: oldStages }),
    });
    const res = await post(env, "sess-admin", { atlasId, dry_run: false });
    expect(await res.json()).toMatchObject({ converted: 1, skipped_corrupt: 0 });
    expect((await overridesOf(env)).field_overrides_json).toBe("{}");
    const view = await fasciolaView(env, atlasId);
    expect(view?.editedFields).toEqual([]);
    expect(view?.fields.lifecycleStages).toEqual(dataset.fields.lifecycleStages);
  });

  it("heals wiped fields from the dataset before converting", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const dataset = fasciola();
    expect(dataset.fields.distribution).not.toBeNull();
    const atlasId = await atlasWithLegacyRow(env, {
      fieldsJson: JSON.stringify({
        ...dataset.fields,
        significance: "Student text",
        distribution: null,
        lifecycleStages: [],
      }),
    });
    const res = await post(env, "sess-admin", { atlasId, dry_run: false });
    expect(await res.json()).toMatchObject({ converted: 1 });
    expect(JSON.parse((await overridesOf(env)).field_overrides_json!)).toEqual({
      significance: "Student text",
    });
    const view = await fasciolaView(env, atlasId);
    expect(view?.fields.distribution).toBe(dataset.fields.distribution);
    expect(view?.fields.lifecycleStages).toEqual(dataset.fields.lifecycleStages);
  });

  it("skips and counts a row whose fields_json cannot be parsed", async () => {
    const env = createTestEnv({ adminEmails: ADMIN_EMAIL });
    seed(env);
    const atlasId = await atlasWithLegacyRow(env, { fieldsJson: "{not json" });
    const res = await post(env, "sess-admin", { atlasId, dry_run: false });
    expect(await res.json()).toEqual({
      scanned: 1,
      converted: 0,
      skipped: 0,
      skipped_corrupt: 1,
      dry_run: false,
    });
    const row = await overridesOf(env);
    expect(row.field_overrides_json ?? null).toBeNull();
    expect(row.common_name).toBe(fasciola().commonName);
  });
});
