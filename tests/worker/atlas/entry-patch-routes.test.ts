import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../../worker/index";
import { refreshFocusBestEffort } from "../../../worker/atlas/focus";
import { SESSION_COOKIE } from "../../../worker/auth/session";
import { createTestEnv } from "../test-env";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { AtlasEntryView } from "../../../src/atlas/types";
import { searchable } from "../../../src/atlas/hub/nameMatch";
import arthropods from "../../../worker/atlas/datasets/parasites/arthropods.json";

vi.mock("../../../worker/atlas/focus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../worker/atlas/focus")>();
  return {
    ...actual,
    refreshFocusBestEffort: vi.fn(actual.refreshFocusBestEffort),
  };
});

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
    updatedAt?: string;
  },
) {
  // A key missing from the bundle stands for a retired dataset entry.
  const dataset = loadParasiteDataset().entries.find(
    (e) => e.key === opts.originKey,
  ) ?? { canonicalName: `Retiredus ${opts.id}`, commonName: null };
  const updatedAt = opts.updatedAt ?? TS;
  if (opts.overridesJson === undefined) {
    await env.DB.prepare(
      `INSERT INTO atlas_entries (
         id, atlas_id, canonical_name, common_name, fields_json, status,
         created_at, updated_at, origin_key, origin_version, edited_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, NULL)`,
    )
      .bind(opts.id, atlasId, dataset.canonicalName, dataset.commonName,
        opts.fieldsJson, TS, updatedAt, opts.originKey, 1, TS)
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
      opts.fieldsJson, TS, updatedAt, opts.originKey, 1, TS, null,
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

describe("PATCH /entries/:entryId field overrides", () => {
  it("stores only the changed key on the first edit of a dataset entry", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual(["significance"]);
    expect(view.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
    const row = await rawRow(env, view.id);
    // fields_json keeps the full merged snapshot for a later dataset removal.
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({ significance: "Mine" });
  });

  it("removes an override when the value is set back to the dataset value", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine" },
    });
    const edited = (await first.json()) as AtlasEntryView;
    const back = await patchEntry(env, atlasId, edited.id, {
      fields: { significance: datasetEntry("fasciola-hepatica").fields.significance },
    });
    expect(back.status).toBe(200);
    expect(((await back.json()) as AtlasEntryView).editedFields).toEqual([]);
    expect((await rawRow(env, edited.id))?.field_overrides_json).toBe("{}");
  });

  it("resetFields removes one override and leaves the others", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { significance: "Mine", family: "Editedidae" },
    });
    const edited = (await first.json()) as AtlasEntryView;
    const res = await patchEntry(env, atlasId, edited.id, {
      resetFields: ["family"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual(["significance"]);
    expect(view.fields.family).toBe(datasetEntry("fasciola-hepatica").fields.family);
  });

  it("rejects unknown reset keys and resets on learner entries", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const unknown = await patchEntry(env, atlasId, "fasciola-hepatica", {
      resetFields: ["nope"],
    });
    expect(unknown.status).toBe(400);
    const learner = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, learner.id, {
      resetFields: ["family"],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a PATCH that both sets and resets the same field", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      fields: { family: "Editedidae", significance: "Mine" },
      resetFields: ["family"],
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("family");
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first();
    expect(row).toBeNull();
  });

  it("writes nothing for a reset-only PATCH on an unedited dataset entry", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      resetFields: ["family"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.id).toBe("fasciola-hepatica");
    expect(view.editedAt).toBeNull();
  });

  it("converts a legacy full-copy row on its first PATCH", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });
    const res = await patchEntry(env, atlasId, "e-legacy", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    const row = await rawRow(env, "e-legacy");
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({
      significance: "Old copy",
      family: "Editedidae",
    });
  });

  it("nulls a copied dataset common name when a fields-only PATCH converts a legacy row", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    await seedOverlayRow(env, atlasId, {
      id: "e-legacy",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({ ...dataset.fields, significance: "Old copy" }),
    });
    expect((await rawRow(env, "e-legacy"))?.common_name).toBe(dataset.commonName);
    const res = await patchEntry(env, atlasId, "e-legacy", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.commonNameEdited).toBe(false);
    expect(view.commonName).toBe(dataset.commonName);
    expect((await rawRow(env, "e-legacy"))?.common_name).toBeNull();
  });

  it("heals wiped fields before converting a legacy row on PATCH", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const dataset = datasetEntry("fasciola-hepatica");
    expect(dataset.fields.distribution).not.toBeNull();
    expect(dataset.fields.lifecycleStages.length).toBeGreaterThan(0);
    await seedOverlayRow(env, atlasId, {
      id: "e-wiped",
      originKey: "fasciola-hepatica",
      fieldsJson: JSON.stringify({
        ...dataset.fields,
        significance: "Old copy",
        distribution: null,
        lifecycleStages: [],
      }),
    });
    const res = await patchEntry(env, atlasId, "e-wiped", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.fields.distribution).toBe(dataset.fields.distribution);
    expect(view.fields.lifecycleStages).toEqual(dataset.fields.lifecycleStages);
    expect(view.editedFields).toEqual(["family", "significance"]);
    expect(JSON.parse((await rawRow(env, "e-wiped"))!.field_overrides_json!)).toEqual({
      significance: "Old copy",
      family: "Editedidae",
    });
  });

  it("stores empty overrides on a delete-only tombstone", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const soft = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/soft-delete`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(soft.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first<{
        fields_json: string;
        field_overrides_json: string | null;
        common_name: string | null;
      }>();
    expect(JSON.parse(row!.fields_json)).toEqual(
      datasetEntry("fasciola-hepatica").fields,
    );
    expect(row?.field_overrides_json).toBe("{}");
    expect(row?.common_name).toBeNull();
  });

  it("keeps a NULL common name on a ref-route overlay insert", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const ref = await app.request(
      `/api/atlas/${atlasId}/entries/fasciola-hepatica/refs`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          citation: "Lecture 3 handout",
          url: "https://example.com/handout",
        }),
      },
      env,
    );
    expect(ref.status).toBeLessThan(300);
    const row = await env.DB.prepare(
      "SELECT * FROM atlas_entries WHERE atlas_id = ? AND origin_key = ?",
    )
      .bind(atlasId, "fasciola-hepatica")
      .first<{ common_name: string | null }>();
    expect(row?.common_name).toBeNull();
    const view = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "fasciola-hepatica",
    );
    expect(view?.commonName).toBe(datasetEntry("fasciola-hepatica").commonName);
    expect(view?.commonNameEdited).toBe(false);
  });

  it("stores NULL when the common name is set back to the dataset name", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const datasetName = datasetEntry("fasciola-hepatica").commonName;
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      commonName: "Sheep fluke",
    });
    const edited = (await first.json()) as AtlasEntryView;
    expect(edited.commonNameEdited).toBe(true);
    expect((await rawRow(env, edited.id))?.common_name).toBe("Sheep fluke");

    const back = await patchEntry(env, atlasId, edited.id, {
      commonName: datasetName,
    });
    const view = (await back.json()) as AtlasEntryView;
    expect(view.commonName).toBe(datasetName);
    expect(view.commonNameEdited).toBe(false);
    expect((await rawRow(env, edited.id))?.common_name).toBeNull();

    const fresh = await patchEntry(env, atlasId, "toxocara-canis", {
      commonName: datasetEntry("toxocara-canis").commonName,
    });
    const freshView = (await fresh.json()) as AtlasEntryView;
    expect((await rawRow(env, freshView.id))?.common_name).toBeNull();
  });

  it("Verify 7: a later dataset change shows through; the edited field stays and resets", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "psoroptes-ovis", {
      fields: { significance: "Student version" },
    });
    const edited = (await res.json()) as AtlasEntryView;

    // Simulate a dataset PR: loadParasiteDataset re-parses the imported JSON on every call.
    const json = (
      arthropods as { entries: { key: string; fields: { distribution: string | null } }[] }
    ).entries.find((e) => e.key === "psoroptes-ovis")!;
    const before = json.fields.distribution;
    json.fields.distribution = "Changed by a dataset PR";
    try {
      const view = (await listEntries(env, atlasId)).find(
        (e) => e.originKey === "psoroptes-ovis",
      )!;
      expect(view.fields.distribution).toBe("Changed by a dataset PR");
      expect(view.fields.significance).toBe("Student version");
      expect(view.editedFields).toEqual(["significance"]);

      const reset = await patchEntry(env, atlasId, edited.id, {
        resetFields: ["significance"],
      });
      const after = (await reset.json()) as AtlasEntryView;
      expect(after.fields.significance).toBe(
        datasetEntry("psoroptes-ovis").fields.significance,
      );
      expect(after.editedFields).toEqual([]);
    } finally {
      json.fields.distribution = before;
    }
  });

  it("keeps a retired dataset row an override row and updates its snapshot", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const snapshot = {
      ...datasetEntry("fasciola-hepatica").fields,
      significance: "Snapshot text",
    };
    await seedOverlayRow(env, atlasId, {
      id: "e-retired",
      originKey: "no-such-parasite",
      fieldsJson: JSON.stringify(snapshot),
      overridesJson: JSON.stringify({ significance: "Snapshot text" }),
    });
    const res = await patchEntry(env, atlasId, "e-retired", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.fields.significance).toBe("Snapshot text");
    expect(view.fields.family).toBe("Editedidae");
    // Nothing to reset to once the dataset entry is gone.
    expect(view.editedFields).toEqual([]);
    const row = await rawRow(env, "e-retired");
    expect(JSON.parse(row!.field_overrides_json!)).toEqual({
      significance: "Snapshot text",
      family: "Editedidae",
    });
    expect(JSON.parse(row!.fields_json)).toEqual(view.fields);
  });

  it("drops a stored diagnosticStage override that conflicts with a flagged dataset stage", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const giardia = datasetEntry("giardia-duodenalis");
    const flagged = giardia.fields.lifecycleStages.find((s) => s.diagnostic)!;
    expect(flagged.name).not.toBe("trophozoite");
    await seedOverlayRow(env, atlasId, {
      id: "e-diag",
      originKey: "giardia-duodenalis",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ diagnosticStage: "trophozoite" }),
    });
    const listed = (await listEntries(env, atlasId)).find((e) => e.id === "e-diag")!;
    expect(listed.fields.diagnosticStage).toBe(flagged.name);
    expect(listed.editedFields).toEqual([]);

    const res = await patchEntry(env, atlasId, "e-diag", { commonName: "Beaver fever" });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.editedFields).toEqual([]);
    expect(view.fields.diagnosticStage).toBe(flagged.name);
    expect(JSON.parse((await rawRow(env, "e-diag"))!.field_overrides_json!)).toEqual({});
  });

  it("still rejects a submitted diagnosticStage that conflicts with the flagged stage", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "giardia-duodenalis", {
      fields: { diagnosticStage: "trophozoite" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 and keeps the other write when the row changed mid-request", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-race",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: JSON.stringify({ significance: "First" }),
    });
    const concurrent = JSON.stringify({ significance: "Other tab snapshot" });
    const realPrepare = env.DB.prepare.bind(env.DB);
    let raced = false;
    env.DB.prepare = ((sql: string) => {
      if (raced || !/UPDATE atlas_entries\s+SET common_name/.test(sql)) {
        return realPrepare(sql);
      }
      raced = true;
      return {
        bind: (...args: unknown[]) => ({
          run: async () => {
            // Another tab's write lands between our read and our UPDATE.
            await realPrepare(
              "UPDATE atlas_entries SET fields_json = ?, updated_at = ? WHERE id = ? AND atlas_id = ?",
            ).bind(concurrent, "2026-03-01T00:00:00.000Z", "e-race", atlasId).run();
            env.DB.prepare = realPrepare;
            return realPrepare(sql).bind(...args).run();
          },
        }),
      } as unknown as D1PreparedStatement;
    }) as D1Database["prepare"];

    const res = await patchEntry(env, atlasId, "e-race", {
      fields: { family: "Editedidae" },
    });
    expect(raced).toBe(true);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("Entry changed, reload and try again");
    const row = await env.DB.prepare("SELECT * FROM atlas_entries WHERE id = ?")
      .bind("e-race")
      .first<{ updated_at: string; fields_json: string; field_overrides_json: string }>();
    expect(row?.updated_at).toBe("2026-03-01T00:00:00.000Z");
    expect(row?.fields_json).toBe(concurrent);
    expect(JSON.parse(row!.field_overrides_json)).toEqual({ significance: "First" });
  });

  it("refuses to overwrite an unparseable overrides column", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    await seedOverlayRow(env, atlasId, {
      id: "e-corrupt",
      originKey: "fasciola-hepatica",
      fieldsJson: "{}",
      overridesJson: "{not json",
    });
    const res = await patchEntry(env, atlasId, "e-corrupt", {
      fields: { family: "Editedidae" },
    });
    expect(res.status).toBe(500);
    const row = await rawRow(env, "e-corrupt");
    expect(row?.field_overrides_json).toBe("{not json");
    expect(row?.fields_json).toBe("{}");
  });
});

const demodex = loadParasiteDataset().entries.find(
  (e) => e.key === "demodex-canis",
)!;
const datasetAliases = [...demodex.aliases, ...demodex.misspellings];

describe("PATCH /entries/:entryId aliases", () => {
  it("saves trimmed learner aliases and unions them with dataset aliases", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const res = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["  follicular mite ", "", "Follicle Mite", "follicular  mite"],
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.learnerAliases).toEqual(["follicular mite", "Follicle Mite"]);
    expect(view.aliases).toEqual(expect.arrayContaining(datasetAliases));
    expect(view.aliases.at(-1)).toBe("follicular mite");
    expect(
      view.aliases.filter((a) => searchable(a) === "follicle mite"),
    ).toHaveLength(1);
    expect(view.editedFields).toEqual([]);

    const listed = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(listed?.learnerAliases).toEqual(["follicular mite", "Follicle Mite"]);
  });

  it("replaces aliases on an existing overlay row and clears them with []", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const first = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    const edited = (await first.json()) as AtlasEntryView;

    const cleared = await patchEntry(env, atlasId, edited.id, { aliases: [] });
    expect(cleared.status).toBe(200);
    const view = (await cleared.json()) as AtlasEntryView;
    expect(view.learnerAliases).toEqual([]);
    expect(view.aliases).not.toContain("follicular mite");
  });

  it("rejects more than 20 aliases, long aliases and non-lists", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);

    const tooMany = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: Array.from({ length: 21 }, (_, i) => `alias ${i}`),
    });
    expect(tooMany.status).toBe(400);
    expect(((await tooMany.json()) as { message: string }).message).toMatch(
      /At most 20 aliases/,
    );
    const tooLong = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["a".repeat(81)],
    });
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { message: string }).message).toMatch(
      /80 characters/,
    );
    const notList = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: "follicular mite",
    });
    expect(notList.status).toBe(400);
    const twenty = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: Array.from({ length: 20 }, (_, i) => `alias ${i}`),
    });
    expect(twenty.status).toBe(200);
  });

  it("reset to dataset clears learner aliases and overrides", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      aliases: ["big liver fluke"],
      fields: { significance: "Mine" },
    });
    const edited = (await res.json()) as AtlasEntryView;

    const reset = await app.request(
      `/api/atlas/${atlasId}/entries/${edited.id}/reset`,
      { method: "POST", headers: authHeaders() },
      env,
    );
    expect(reset.status).toBe(204);

    const view = (await listEntries(env, atlasId)).find(
      (e) => e.id === "fasciola-hepatica",
    );
    expect(view?.editedAt).toBeNull();
    expect(view?.aliases).not.toContain("big liver fluke");
    expect(view?.learnerAliases).toEqual([]);
    expect(view?.editedFields).toEqual([]);
  });

  it("refreshes Focus so a learner alias counts as a mention", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const paste = await app.request(
      `/api/atlas/${atlasId}/materials/paste`,
      {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          text: "Follicular mite notes",
          filename: "Follicular_mite_TUTORIAL.pdf",
        }),
      },
      env,
    );
    expect(paste.status).toBe(201);

    const before = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(before?.tier).not.toBe("key");

    const res = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    expect(res.status).toBe(200);

    const after = (await listEntries(env, atlasId)).find(
      (e) => e.originKey === "demodex-canis",
    );
    expect(after?.tier).toBe("key");
  });
});

const BUILT_IN_MESSAGE =
  "Scientific name of a built-in parasite cannot change; add an alias instead";

describe("PATCH /entries/:entryId canonicalName", () => {
  it("returns 400 for a dataset entry and writes no overlay", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola gigantica",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe(
      BUILT_IN_MESSAGE,
    );
    const view = (await listEntries(env, atlasId)).find(
      (e) => e.id === "fasciola-hepatica",
    );
    expect(view?.editedAt).toBeNull();
  });

  it("returns 400 for an edited dataset overlay row", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const first = await patchEntry(env, atlasId, "fasciola-hepatica", {
      commonName: "Edited fluke",
    });
    const edited = (await first.json()) as AtlasEntryView;
    const res = await patchEntry(env, atlasId, edited.id, {
      canonicalName: "Fasciola gigantica",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe(
      BUILT_IN_MESSAGE,
    );
  });

  it("renames a learner entry with normalization", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, added.id, {
      canonicalName: "  madeupius renamus ",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as AtlasEntryView).canonicalName).toBe(
      "Madeupius renamus",
    );
    const listed = (await listEntries(env, atlasId)).find(
      (e) => e.id === added.id,
    );
    expect(listed?.canonicalName).toBe("Madeupius renamus");
  });

  it("returns 409 for a duplicate learner or dataset name, and accepts its own name", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    await createLearnerEntry(env, atlasId, "Madeupius renamus");
    const other = await createLearnerEntry(env, atlasId, "Madeupius alter");
    const dupLearner = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Madeupius renamus",
    });
    expect(dupLearner.status).toBe(409);
    const dupDataset = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Fasciola hepatica",
    });
    expect(dupDataset.status).toBe(409);
    const same = await patchEntry(env, atlasId, other.id, {
      canonicalName: "Madeupius alter",
    });
    expect(same.status).toBe(200);
  });

  it("returns 400 for an empty or unparseable name", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    const res = await patchEntry(env, atlasId, added.id, { canonicalName: "" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(
      /canonicalName required/,
    );
    const notString = await patchEntry(env, atlasId, added.id, { canonicalName: 5 });
    expect(notString.status).toBe(400);
    expect(((await notString.json()) as { message: string }).message).toMatch(
      /canonicalName must be a string/,
    );
  });

  it("accepts a built-in entry's own name alongside another edit", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola hepatica",
      commonName: "My fluke",
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.canonicalName).toBe("Fasciola hepatica");
    expect(view.commonName).toBe("My fluke");
  });
});

describe("PATCH /entries/:entryId Focus refresh", () => {
  const refresh = vi.mocked(refreshFocusBestEffort);
  beforeEach(() => {
    refresh.mockClear();
  });

  it("does not refresh when the names stay the same", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    refresh.mockClear();
    const first = await patchEntry(env, atlasId, "demodex-canis", {
      aliases: ["follicular mite"],
    });
    const edited = (await first.json()) as AtlasEntryView;
    expect(refresh).toHaveBeenCalledTimes(1);
    refresh.mockClear();

    const fieldsOnly = await patchEntry(env, atlasId, edited.id, {
      fields: { significance: "Mine" },
    });
    expect(fieldsOnly.status).toBe(200);
    const sameNames = await patchEntry(env, atlasId, edited.id, {
      aliases: ["follicular mite"],
      commonName: edited.commonName,
      canonicalName: edited.canonicalName,
    });
    expect(sameNames.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes after a common name change or a learner rename", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    refresh.mockClear();
    await patchEntry(env, atlasId, "fasciola-hepatica", { commonName: "My fluke" });
    expect(refresh).toHaveBeenCalledTimes(1);

    const added = await createLearnerEntry(env, atlasId, "Madeupius fictus");
    refresh.mockClear();
    await patchEntry(env, atlasId, added.id, { canonicalName: "Madeupius renamus" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("writes no overlay for a built-in entry's own name alone", async () => {
    const env = createTestEnv();
    seedOwner(env);
    const atlasId = await createAtlas(env);
    refresh.mockClear();
    const res = await patchEntry(env, atlasId, "fasciola-hepatica", {
      canonicalName: "Fasciola hepatica",
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as AtlasEntryView;
    expect(view.id).toBe("fasciola-hepatica");
    expect(view.editedAt).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
